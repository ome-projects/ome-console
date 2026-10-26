package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

// ModelsHandler handles HTTP requests for ClusterBaseModel resources
type ModelsHandler struct {
	k8sClient *k8s.Client
	logger    *zap.Logger
}

// NewModelsHandler creates a new ModelsHandler
func NewModelsHandler(k8sClient *k8s.Client, logger *zap.Logger) *ModelsHandler {
	return &ModelsHandler{
		k8sClient: k8sClient,
		logger:    logger,
	}
}

// List handles GET /api/v1/models
// Supports optional ?namespace= query parameter
// - No namespace: returns ClusterBaseModel resources
// - namespace=<name>: returns BaseModel resources from that namespace
func (h *ModelsHandler) List(c *gin.Context) {
	ctx := c.Request.Context()
	namespace := c.Query("namespace")

	// If namespace is specified, list namespace-scoped BaseModels
	if namespace != "" {
		models, err := h.k8sClient.ListBaseModels(ctx, namespace)
		if err != nil {
			writeError(c, h.logger, "Failed to list base models", err)
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"items":     models.Items,
			"total":     len(models.Items),
			"namespace": namespace,
		})
		return
	}

	// Otherwise, list cluster-scoped ClusterBaseModels
	models, err := h.k8sClient.ListClusterBaseModels(ctx)
	if err != nil {
		writeError(c, h.logger, "Failed to list models", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": models.Items,
		"total": len(models.Items),
	})
}

// Get handles GET /api/v1/models/:name
func (h *ModelsHandler) Get(c *gin.Context) {
	ctx := c.Request.Context()
	name := c.Param("name")

	model, err := h.k8sClient.GetClusterBaseModel(ctx, name)
	if err != nil {
		writeError(c, h.logger, "Model not found", err)
		return
	}

	c.JSON(http.StatusOK, model.Object)
}

// Create handles POST /api/v1/models
func (h *ModelsHandler) Create(c *gin.Context) {
	h.create(c, "")
}

// create creates a ClusterBaseModel, or a BaseModel in namespace when one is given, from a
// {model, huggingfaceToken} body. A token is stored in a Secret that spec.storage.key names, in
// the namespace OME's model agent reads it from: the BaseModel's own, or "ome" for a
// ClusterBaseModel.
func (h *ModelsHandler) create(c *gin.Context, namespace string) {
	ctx := c.Request.Context()

	var requestBody struct {
		Model            map[string]interface{} `json:"model"`
		HuggingfaceToken string                 `json:"huggingfaceToken,omitempty"`
	}
	if err := c.ShouldBindJSON(&requestBody); err != nil {
		writeBadRequest(c, h.logger, "Invalid request body", err)
		return
	}
	if requestBody.Model == nil {
		writeBadRequest(c, h.logger, "Invalid request body", errors.New("missing 'model' field"))
		return
	}

	model := &unstructured.Unstructured{Object: requestBody.Model}

	res, secretNamespace := k8s.ClusterBaseModelResource, "ome"
	if namespace != "" {
		res, secretNamespace = k8s.BaseModelResource, namespace
		model.SetNamespace(namespace)
	}

	// Set GVK if not present
	if model.GetAPIVersion() == "" {
		model.SetAPIVersion("ome.io/v1beta1")
	}
	if model.GetKind() == "" {
		model.SetKind(res.Kind)
	}

	// If HuggingFace token provided, store it in a Secret and point spec.storage.key at it
	var secretName string
	var secretCreated bool
	if requestBody.HuggingfaceToken != "" {
		// An existing model keeps its token: refuse before its Secret is touched.
		exists, err := h.k8sClient.ModelExists(ctx, namespace, model.GetName())
		if err != nil {
			writeError(c, h.logger, "Failed to check for an existing model", err)
			return
		}
		if exists {
			writeError(c, h.logger, "Failed to create model",
				apierrors.NewAlreadyExists(res.GVR().GroupResource(), model.GetName()))
			return
		}

		secretName = model.GetName() + "-hf-token"
		if err := unstructured.SetNestedField(model.Object, secretName, "spec", "storage", "key"); err != nil {
			writeBadRequest(c, h.logger, "Invalid model spec", err)
			return
		}

		secretCreated, err = h.k8sClient.EnsureHuggingFaceTokenSecret(ctx, secretName, secretNamespace, requestBody.HuggingfaceToken)
		if err != nil {
			writeError(c, h.logger, "Failed to create HuggingFace token secret", err)
			return
		}

		h.logger.Info("Stored HuggingFace token secret",
			zap.String("secretName", secretName),
			zap.String("namespace", secretNamespace),
			zap.Bool("created", secretCreated))
	}

	var created *unstructured.Unstructured
	var err error
	if namespace == "" {
		created, err = h.k8sClient.CreateClusterBaseModel(ctx, model)
	} else {
		created, err = h.k8sClient.CreateBaseModel(ctx, namespace, model)
	}
	if err != nil {
		// A rejected model was not stored, so the Secret made for it goes too and a corrected
		// retry starts clean. AlreadyExists is the exception: another create of the same name got
		// there first, and its model points at this Secret. After any other error the model may
		// exist: the Secret stays, and a retry reuses it.
		if secretCreated && rejected(err) && !apierrors.IsAlreadyExists(err) {
			if delErr := h.k8sClient.DeleteSecret(ctx, secretName, secretNamespace); delErr != nil {
				h.logger.Warn("Failed to remove HuggingFace token secret",
					zap.String("secretName", secretName),
					zap.String("namespace", secretNamespace),
					zap.Error(delErr))
			}
		}
		writeError(c, h.logger, "Failed to create model", err)
		return
	}

	h.logger.Info("Model created successfully",
		zap.String("kind", res.Kind),
		zap.String("namespace", namespace),
		zap.String("name", created.GetName()))
	c.JSON(http.StatusCreated, created.Object)
}

// Update handles PUT /api/v1/models/:name
func (h *ModelsHandler) Update(c *gin.Context) {
	ctx := c.Request.Context()
	name := c.Param("name")

	var modelData map[string]interface{}
	if err := c.ShouldBindJSON(&modelData); err != nil {
		writeBadRequest(c, h.logger, "Invalid request body", err)
		return
	}

	// Create unstructured object
	model := &unstructured.Unstructured{Object: modelData}

	// Ensure name matches
	model.SetName(name)

	// Set GVK if not present
	if model.GetAPIVersion() == "" {
		model.SetAPIVersion("ome.io/v1beta1")
	}
	if model.GetKind() == "" {
		model.SetKind("ClusterBaseModel")
	}

	updated, err := h.k8sClient.UpdateClusterBaseModel(ctx, model)
	if err != nil {
		writeError(c, h.logger, "Failed to update model", err)
		return
	}

	h.logger.Info("Model updated successfully", zap.String("name", name))
	c.JSON(http.StatusOK, updated.Object)
}

// Delete handles DELETE /api/v1/models/:name
func (h *ModelsHandler) Delete(c *gin.Context) {
	ctx := c.Request.Context()
	name := c.Param("name")

	err := h.k8sClient.DeleteClusterBaseModel(ctx, name)
	if err != nil {
		writeError(c, h.logger, "Failed to delete model", err)
		return
	}

	h.logger.Info("Model deleted successfully", zap.String("name", name))
	c.JSON(http.StatusOK, gin.H{
		"message": "Model deleted successfully",
		"name":    name,
	})
}

// GetStatus handles GET /api/v1/models/:name/status
func (h *ModelsHandler) GetStatus(c *gin.Context) {
	ctx := c.Request.Context()
	name := c.Param("name")

	model, err := h.k8sClient.GetClusterBaseModel(ctx, name)
	if err != nil {
		writeError(c, h.logger, "Model not found", err)
		return
	}

	// Extract status from the model
	status, found, err := unstructured.NestedMap(model.Object, "status")
	if err != nil || !found {
		c.JSON(http.StatusOK, gin.H{
			"status": map[string]interface{}{},
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": status,
	})
}

// ===== BaseModel (namespace-scoped) Handlers =====

// ListBaseModels handles GET /api/v1/namespaces/:namespace/models
func (h *ModelsHandler) ListBaseModels(c *gin.Context) {
	ctx := c.Request.Context()
	namespace := c.Param("namespace")

	models, err := h.k8sClient.ListBaseModels(ctx, namespace)
	if err != nil {
		writeError(c, h.logger, "Failed to list base models", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": models.Items,
		"total": len(models.Items),
	})
}

// GetBaseModel handles GET /api/v1/namespaces/:namespace/models/:name
func (h *ModelsHandler) GetBaseModel(c *gin.Context) {
	ctx := c.Request.Context()
	namespace := c.Param("namespace")
	name := c.Param("name")

	model, err := h.k8sClient.GetBaseModel(ctx, namespace, name)
	if err != nil {
		writeError(c, h.logger, "Base model not found", err)
		return
	}

	c.JSON(http.StatusOK, model.Object)
}

// CreateBaseModel handles POST /api/v1/namespaces/:namespace/models
func (h *ModelsHandler) CreateBaseModel(c *gin.Context) {
	h.create(c, c.Param("namespace"))
}

// UpdateBaseModel handles PUT /api/v1/namespaces/:namespace/models/:name
func (h *ModelsHandler) UpdateBaseModel(c *gin.Context) {
	ctx := c.Request.Context()
	namespace := c.Param("namespace")
	name := c.Param("name")

	var modelData map[string]interface{}
	if err := c.ShouldBindJSON(&modelData); err != nil {
		writeBadRequest(c, h.logger, "Invalid request body", err)
		return
	}

	// Create unstructured object
	model := &unstructured.Unstructured{Object: modelData}

	// Ensure name and namespace match
	model.SetName(name)
	model.SetNamespace(namespace)

	// Set GVK if not present
	if model.GetAPIVersion() == "" {
		model.SetAPIVersion("ome.io/v1beta1")
	}
	if model.GetKind() == "" {
		model.SetKind("BaseModel")
	}

	updated, err := h.k8sClient.UpdateBaseModel(ctx, namespace, model)
	if err != nil {
		writeError(c, h.logger, "Failed to update base model", err)
		return
	}

	h.logger.Info("Base model updated successfully",
		zap.String("namespace", namespace),
		zap.String("name", name))
	c.JSON(http.StatusOK, updated.Object)
}

// DeleteBaseModel handles DELETE /api/v1/namespaces/:namespace/models/:name
func (h *ModelsHandler) DeleteBaseModel(c *gin.Context) {
	ctx := c.Request.Context()
	namespace := c.Param("namespace")
	name := c.Param("name")

	err := h.k8sClient.DeleteBaseModel(ctx, namespace, name)
	if err != nil {
		writeError(c, h.logger, "Failed to delete base model", err)
		return
	}

	h.logger.Info("Base model deleted successfully",
		zap.String("namespace", namespace),
		zap.String("name", name))
	c.JSON(http.StatusOK, gin.H{
		"message":   "Base model deleted successfully",
		"name":      name,
		"namespace": namespace,
	})
}

// ModelEvent represents a K8s event in a simplified format for the API
type ModelEvent struct {
	Type           string `json:"type"`           // Normal or Warning
	Reason         string `json:"reason"`         // e.g., DownloadProgress, FinalizerAdded
	Message        string `json:"message"`        // Human-readable message
	Count          int32  `json:"count"`          // Number of times this event occurred
	FirstTimestamp string `json:"firstTimestamp"` // RFC3339 timestamp
	LastTimestamp  string `json:"lastTimestamp"`  // RFC3339 timestamp
	Source         string `json:"source"`         // Component that generated the event
}

// GetEvents handles GET /api/v1/models/:name/events
func (h *ModelsHandler) GetEvents(c *gin.Context) {
	ctx := c.Request.Context()
	name := c.Param("name")

	events, err := h.k8sClient.GetClusterBaseModelEvents(ctx, name)
	if err != nil {
		writeError(c, h.logger, "Failed to get model events", err)
		return
	}

	// Convert to simplified format
	modelEvents := make([]ModelEvent, 0, len(events.Items))
	for _, e := range events.Items {
		modelEvents = append(modelEvents, ModelEvent{
			Type:           e.Type,
			Reason:         e.Reason,
			Message:        e.Message,
			Count:          e.Count,
			FirstTimestamp: e.FirstTimestamp.Format("2006-01-02T15:04:05Z07:00"),
			LastTimestamp:  e.LastTimestamp.Format("2006-01-02T15:04:05Z07:00"),
			Source:         e.Source.Component,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"events": modelEvents,
		"total":  len(modelEvents),
	})
}

// NodeDownloadProgress represents download progress on a specific node
type NodeDownloadProgress struct {
	Node           string  `json:"node"`
	Phase          string  `json:"phase"`          // Scanning, Downloading, Finalizing
	TotalBytes     uint64  `json:"totalBytes"`     // Total bytes to download
	CompletedBytes uint64  `json:"completedBytes"` // Bytes downloaded so far
	BytesPerSecond float64 `json:"bytesPerSecond"` // Download speed
	RemainingTime  float64 `json:"remainingTime"`  // ETA in seconds
	Percentage     float64 `json:"percentage"`     // Calculated percentage (0-100)
}

// ModelInfoFromConfigMap represents the model info stored in ConfigMap
type ModelInfoFromConfigMap struct {
	Name     string `json:"name"`
	Status   string `json:"status"`
	Progress *struct {
		Phase            string  `json:"phase"`
		TotalBytes       uint64  `json:"totalBytes"`
		CompletedBytes   uint64  `json:"completedBytes"`
		SpeedBytesPerSec float64 `json:"speedBytesPerSec"`
	} `json:"progress,omitempty"`
}

// GetProgress handles GET /api/v1/models/:name/progress and, for a BaseModel,
// GET /api/v1/namespaces/:namespace/models/:name/progress
// Returns download progress from ConfigMaps written by model-agent daemonsets
func (h *ModelsHandler) GetProgress(c *gin.Context) {
	ctx := c.Request.Context()
	modelName := c.Param("name")

	// Key formats from constants.GetModelConfigMapKey (names short enough not to be truncated):
	// - ClusterBaseModel: "clusterbasemodel.{model_name}"
	// - BaseModel: "{namespace}.basemodel.{model_name}"
	// Other keys in the same ConfigMaps, such as artifact.huggingface.*, are not models.
	key := "clusterbasemodel." + modelName
	if namespace := c.Param("namespace"); namespace != "" {
		key = namespace + ".basemodel." + modelName
	}

	configMaps, err := h.k8sClient.GetModelStatusConfigMaps(ctx)
	if err != nil {
		writeError(c, h.logger, "Failed to get model progress", err)
		return
	}

	progressList := make([]NodeDownloadProgress, 0)

	// Each ConfigMap is named after a node and contains model status data
	for _, cm := range configMaps.Items {
		nodeName := cm.Name
		// Get node name from annotation if available (more reliable)
		if nn, ok := cm.Annotations["models.ome.io/node-name"]; ok {
			nodeName = nn
		}

		// Look for the specific model in this ConfigMap's data
		value, ok := cm.Data[key]
		if !ok {
			continue
		}

		var modelInfo ModelInfoFromConfigMap
		if err := json.Unmarshal([]byte(value), &modelInfo); err != nil {
			h.logger.Warn("Failed to parse model info from ConfigMap",
				zap.String("node", nodeName),
				zap.String("key", key),
				zap.Error(err))
			continue
		}

		// Only include if there's progress data
		if modelInfo.Progress != nil {
			percentage := float64(0)
			if modelInfo.Progress.TotalBytes > 0 {
				percentage = float64(modelInfo.Progress.CompletedBytes) / float64(modelInfo.Progress.TotalBytes) * 100
			}

			// Calculate remaining time from speed and remaining bytes
			remainingTime := float64(0)
			if modelInfo.Progress.SpeedBytesPerSec > 0 {
				remainingBytes := modelInfo.Progress.TotalBytes - modelInfo.Progress.CompletedBytes
				remainingTime = float64(remainingBytes) / modelInfo.Progress.SpeedBytesPerSec
			}

			progressList = append(progressList, NodeDownloadProgress{
				Node:           nodeName,
				Phase:          modelInfo.Progress.Phase,
				TotalBytes:     modelInfo.Progress.TotalBytes,
				CompletedBytes: modelInfo.Progress.CompletedBytes,
				BytesPerSecond: modelInfo.Progress.SpeedBytesPerSec,
				RemainingTime:  remainingTime,
				Percentage:     percentage,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"progress": progressList,
		"total":    len(progressList),
	})
}
