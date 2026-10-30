package handlers

import (
	"net/http"
	"sort"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/labels"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
	"sigs.k8s.io/ome/ome-console/backend/internal/omestatus"
)

// ReplicasHandler serves InferenceReplicas with their per-instance status expanded. OME stores
// the instance rows in a compact ColumnarV2 payload by default; the console decodes it once
// server-side so the UI gets one row per instance.
type ReplicasHandler struct {
	k8sClient    *k8s.Client
	logger       *zap.Logger
	maxInstances uint64
}

// NewReplicasHandler creates a ReplicasHandler. maxInstances bounds how many rows one status may
// expand to; 0 selects the bound OME's own CLI uses.
func NewReplicasHandler(k8sClient *k8s.Client, logger *zap.Logger, maxInstances uint64) *ReplicasHandler {
	if maxInstances == 0 {
		maxInstances = omestatus.DefaultMaxInstances
	}
	return &ReplicasHandler{k8sClient: k8sClient, logger: logger, maxInstances: maxInstances}
}

// DecodedReplica is one InferenceReplica with its instance rows expanded. Replica is the object
// without the three fields that carry the rows (instanceStatuses, instanceStatusEncoding,
// instanceStatusColumns); the rows are in Instances.
type DecodedReplica struct {
	Replica     map[string]interface{}              `json:"replica"`
	Encoding    omestatus.Encoding                  `json:"encoding,omitempty"`
	Instances   []omestatus.OMENativeInstanceStatus `json:"instances"`
	DecodeError string                              `json:"decodeError,omitempty"`
}

// ListForService handles GET /api/v1/namespaces/:namespace/services/:name/replicas: the replicas
// OME projects for the service (one per OMENative component), decoded, sorted by name.
func (h *ReplicasHandler) ListForService(c *gin.Context) {
	namespace := c.Param("namespace")
	service := c.Param("name")

	list, err := h.k8sClient.List(k8s.InferenceReplicaResource, namespace, labels.Everything())
	if err != nil {
		writeError(c, h.logger, "Failed to list replicas", err)
		return
	}

	items := make([]DecodedReplica, 0)
	for i := range list.Items {
		if belongsToService(&list.Items[i], service) {
			items = append(items, h.decode(&list.Items[i]))
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return replicaName(items[i]) < replicaName(items[j])
	})
	c.JSON(http.StatusOK, gin.H{
		"items": items,
		"total": len(items),
	})
}

// Instances handles GET /api/v1/namespaces/:namespace/replicas/:name/instances: one replica, decoded.
func (h *ReplicasHandler) Instances(c *gin.Context) {
	obj, err := h.k8sClient.Get(k8s.InferenceReplicaResource, c.Param("namespace"), c.Param("name"))
	if err != nil {
		writeError(c, h.logger, "Replica not found", err)
		return
	}
	c.JSON(http.StatusOK, h.decode(obj))
}

// belongsToService reports whether a replica is one of the service's: labelled with it, naming it
// as its parent, or, failing both, carrying the name OME gives projected replicas. A label or
// parentRef that names another service wins over the name.
func belongsToService(u *unstructured.Unstructured, service string) bool {
	label := u.GetLabels()[k8s.InferenceServiceLabel]
	parent, _, _ := unstructured.NestedString(u.Object, "spec", "parentRef", "name")
	if label != "" || parent != "" {
		return label == service || parent == service
	}
	for _, component := range []string{"engine", "decoder", "router"} {
		if u.GetName() == service+"-"+component {
			return true
		}
	}
	return false
}

func (h *ReplicasHandler) decode(u *unstructured.Unstructured) DecodedReplica {
	out := DecodedReplica{
		Replica:   stripInstanceRepresentation(u),
		Instances: []omestatus.OMENativeInstanceStatus{},
	}
	status, _, _ := unstructured.NestedMap(u.Object, "status")
	decoded, err := omestatus.DecodeUnstructured(status, h.maxInstances)
	if err != nil {
		h.logger.Warn("Cannot decode replica instance status",
			zap.String("namespace", u.GetNamespace()), zap.String("name", u.GetName()), zap.Error(err))
		out.DecodeError = err.Error()
		if marker, _, _ := unstructured.NestedString(status, "instanceStatusEncoding"); marker != "" {
			out.Encoding = omestatus.Encoding(marker)
		}
		return out
	}
	out.Encoding = decoded.Encoding
	if decoded.Instances != nil {
		out.Instances = decoded.Instances
	}
	return out
}

// stripInstanceRepresentation copies the object without the fields that carry the instance rows.
func stripInstanceRepresentation(u *unstructured.Unstructured) map[string]interface{} {
	obj := u.DeepCopy().Object
	for _, field := range []string{"instanceStatuses", "instanceStatusEncoding", "instanceStatusColumns"} {
		unstructured.RemoveNestedField(obj, "status", field)
	}
	return obj
}

func replicaName(r DecodedReplica) string {
	name, _, _ := unstructured.NestedString(r.Replica, "metadata", "name")
	return name
}
