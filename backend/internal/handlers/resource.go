package handlers

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

// maxPatchBytes bounds the size of a patch body.
const maxPatchBytes = 1 << 20

// ResourceHandler serves the standard CRUD API for one OME resource. Reads come from the
// informer cache; writes go to the API server with the client's field validation mode.
//
// Routes (see Mount): cluster-scoped resources live at /<key>; namespaced ones at
// /namespaces/:namespace/<key>, and optionally at /<key> too, where a list spans all namespaces
// (or ?namespace=) and single-object routes take ?namespace=.
type ResourceHandler struct {
	client   *k8s.Client
	resource k8s.OMEResource
	logger   *zap.Logger
}

// NewResourceHandler creates a handler for one resource.
func NewResourceHandler(client *k8s.Client, resource k8s.OMEResource, logger *zap.Logger) *ResourceHandler {
	return &ResourceHandler{client: client, resource: resource, logger: logger}
}

// Mount registers the handler's routes on the API group. topLevel also exposes a namespaced
// resource at /<key>; leave it false when a cluster-scoped resource owns that path.
func (h *ResourceHandler) Mount(v1 *gin.RouterGroup, topLevel bool) {
	key := h.resource.Key
	if h.resource.Namespaced {
		h.mountRoutes(v1.Group("/namespaces/:namespace/" + key))
		if topLevel {
			h.mountRoutes(v1.Group("/" + key))
		}
		return
	}
	h.mountRoutes(v1.Group("/" + key))
}

func (h *ResourceHandler) mountRoutes(g *gin.RouterGroup) {
	g.GET("", h.List)
	g.POST("", h.Create)
	g.GET("/:name", h.Get)
	g.PUT("/:name", h.Update)
	g.PATCH("/:name", h.Patch)
	g.DELETE("/:name", h.Delete)
	g.GET("/:name/status", h.GetStatus)
}

// namespace resolves the namespace of a request: the path parameter, else ?namespace=.
func (h *ResourceHandler) namespace(c *gin.Context) string {
	if !h.resource.Namespaced {
		return ""
	}
	if ns := c.Param("namespace"); ns != "" {
		return ns
	}
	return c.Query("namespace")
}

// requireNamespace is namespace for single-object routes, where a namespaced resource needs one.
func (h *ResourceHandler) requireNamespace(c *gin.Context) (string, bool) {
	ns := h.namespace(c)
	if h.resource.Namespaced && ns == "" {
		writeBadRequest(c, h.logger, "Namespace is required",
			fmt.Errorf("%s is namespaced: pass the namespace in the path or as ?namespace=", h.resource.Kind))
		return "", false
	}
	return ns, true
}

func (h *ResourceHandler) writeOptions(c *gin.Context) k8s.WriteOptions {
	return k8s.WriteOptions{DryRun: c.Query("dryRun") == "true"}
}

// List handles GET on the collection. ?labelSelector= filters, ?namespace= narrows a top-level list.
func (h *ResourceHandler) List(c *gin.Context) {
	selector := labels.Everything()
	if raw := c.Query("labelSelector"); raw != "" {
		parsed, err := labels.Parse(raw)
		if err != nil {
			writeBadRequest(c, h.logger, "Invalid labelSelector", err)
			return
		}
		selector = parsed
	}

	namespace := h.namespace(c)
	list, err := h.client.List(h.resource, namespace, selector)
	if err != nil {
		writeError(c, h.logger, "Failed to list "+h.resource.Key, err)
		return
	}

	body := gin.H{"items": list.Items, "total": len(list.Items)}
	if namespace != "" {
		body["namespace"] = namespace
	}
	c.JSON(http.StatusOK, body)
}

// Get handles GET on one object.
func (h *ResourceHandler) Get(c *gin.Context) {
	namespace, ok := h.requireNamespace(c)
	if !ok {
		return
	}
	obj, err := h.client.Get(h.resource, namespace, c.Param("name"))
	if err != nil {
		writeError(c, h.logger, "Failed to get "+h.resource.Kind, err)
		return
	}
	c.JSON(http.StatusOK, obj.Object)
}

// GetStatus handles GET on one object's status.
func (h *ResourceHandler) GetStatus(c *gin.Context) {
	namespace, ok := h.requireNamespace(c)
	if !ok {
		return
	}
	obj, err := h.client.Get(h.resource, namespace, c.Param("name"))
	if err != nil {
		writeError(c, h.logger, "Failed to get "+h.resource.Kind+" status", err)
		return
	}
	status, found, err := unstructured.NestedMap(obj.Object, "status")
	if err != nil || !found {
		status = map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"status": status})
}

// Create handles POST on the collection. The namespace comes from the path, else from
// metadata.namespace in the body. ?dryRun=true validates without persisting.
func (h *ResourceHandler) Create(c *gin.Context) {
	obj, ok := h.bindObject(c)
	if !ok {
		return
	}
	namespace := h.namespace(c)
	if h.resource.Namespaced && namespace == "" {
		namespace = obj.GetNamespace()
	}
	if h.resource.Namespaced && namespace == "" {
		writeBadRequest(c, h.logger, "Namespace is required",
			fmt.Errorf("%s is namespaced: pass the namespace in the path or set metadata.namespace", h.resource.Kind))
		return
	}

	created, err := h.client.Create(c.Request.Context(), h.resource, namespace, obj, h.writeOptions(c))
	if err != nil {
		writeError(c, h.logger, "Failed to create "+h.resource.Kind, err)
		return
	}
	h.logger.Info("Resource created",
		zap.String("kind", h.resource.Kind),
		zap.String("namespace", namespace),
		zap.String("name", created.GetName()),
		zap.Bool("dryRun", c.Query("dryRun") == "true"))
	c.JSON(http.StatusCreated, created.Object)
}

// Update handles PUT on one object. The body must carry the resourceVersion it was read at.
func (h *ResourceHandler) Update(c *gin.Context) {
	namespace, ok := h.requireNamespace(c)
	if !ok {
		return
	}
	obj, ok := h.bindObject(c)
	if !ok {
		return
	}
	name := c.Param("name")
	if obj.GetName() != "" && obj.GetName() != name {
		writeBadRequest(c, h.logger, "Name mismatch",
			fmt.Errorf("metadata.name %q does not match the request path %q", obj.GetName(), name))
		return
	}
	obj.SetName(name)

	updated, err := h.client.Update(c.Request.Context(), h.resource, namespace, obj, h.writeOptions(c))
	if err != nil {
		writeError(c, h.logger, "Failed to update "+h.resource.Kind, err)
		return
	}
	h.logger.Info("Resource updated",
		zap.String("kind", h.resource.Kind),
		zap.String("namespace", namespace),
		zap.String("name", name),
		zap.Bool("dryRun", c.Query("dryRun") == "true"))
	c.JSON(http.StatusOK, updated.Object)
}

// Patch handles PATCH on one object. The Content-Type selects the patch type:
// application/json-patch+json, application/merge-patch+json or
// application/strategic-merge-patch+json. A plain application/json body is a JSON patch when it
// is an array and a merge patch otherwise.
func (h *ResourceHandler) Patch(c *gin.Context) {
	namespace, ok := h.requireNamespace(c)
	if !ok {
		return
	}
	data, err := io.ReadAll(io.LimitReader(c.Request.Body, maxPatchBytes+1))
	if err != nil {
		writeBadRequest(c, h.logger, "Invalid request body", err)
		return
	}
	if len(data) > maxPatchBytes {
		writeBadRequest(c, h.logger, "Patch too large", fmt.Errorf("patch exceeds %d bytes", maxPatchBytes))
		return
	}
	patchType, err := patchTypeFor(c.ContentType(), data)
	if err != nil {
		writeBadRequest(c, h.logger, "Unsupported patch type", err)
		return
	}

	name := c.Param("name")
	patched, err := h.client.Patch(c.Request.Context(), h.resource, namespace, name, patchType, data, h.writeOptions(c))
	if err != nil {
		writeError(c, h.logger, "Failed to patch "+h.resource.Kind, err)
		return
	}
	h.logger.Info("Resource patched",
		zap.String("kind", h.resource.Kind),
		zap.String("namespace", namespace),
		zap.String("name", name),
		zap.String("patchType", string(patchType)),
		zap.Bool("dryRun", c.Query("dryRun") == "true"))
	c.JSON(http.StatusOK, patched.Object)
}

// Delete handles DELETE on one object.
func (h *ResourceHandler) Delete(c *gin.Context) {
	namespace, ok := h.requireNamespace(c)
	if !ok {
		return
	}
	name := c.Param("name")
	if err := h.client.Delete(c.Request.Context(), h.resource, namespace, name); err != nil {
		writeError(c, h.logger, "Failed to delete "+h.resource.Kind, err)
		return
	}
	h.logger.Info("Resource deleted",
		zap.String("kind", h.resource.Kind),
		zap.String("namespace", namespace),
		zap.String("name", name))
	body := gin.H{"message": h.resource.Kind + " deleted successfully", "name": name}
	if h.resource.Namespaced {
		body["namespace"] = namespace
	}
	c.JSON(http.StatusOK, body)
}

// bindObject parses the request body as an object of this resource.
func (h *ResourceHandler) bindObject(c *gin.Context) (*unstructured.Unstructured, bool) {
	var data map[string]interface{}
	if err := c.ShouldBindJSON(&data); err != nil {
		writeBadRequest(c, h.logger, "Invalid request body", err)
		return nil, false
	}
	if data == nil {
		writeBadRequest(c, h.logger, "Invalid request body", errors.New("body must be a JSON object"))
		return nil, false
	}
	obj := &unstructured.Unstructured{Object: data}
	if kind := obj.GetKind(); kind != "" && kind != h.resource.Kind {
		writeBadRequest(c, h.logger, "Kind mismatch",
			fmt.Errorf("body kind %q is not %s", kind, h.resource.Kind))
		return nil, false
	}
	return obj, true
}

// patchTypeFor picks the Kubernetes patch type from the Content-Type, falling back to the body
// shape for application/json.
func patchTypeFor(contentType string, body []byte) (types.PatchType, error) {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "application/json-patch+json":
		return types.JSONPatchType, nil
	case "application/merge-patch+json":
		return types.MergePatchType, nil
	case "application/strategic-merge-patch+json":
		return types.StrategicMergePatchType, nil
	case "application/json", "":
		if bytes.HasPrefix(bytes.TrimSpace(body), []byte("[")) {
			return types.JSONPatchType, nil
		}
		return types.MergePatchType, nil
	default:
		return "", fmt.Errorf("content type %q is not a supported patch type", contentType)
	}
}
