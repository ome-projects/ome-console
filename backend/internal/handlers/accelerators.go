package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

// AcceleratorsHandler handles HTTP requests for AcceleratorClass resources
type AcceleratorsHandler struct {
	k8sClient *k8s.Client
	logger    *zap.Logger
}

// NewAcceleratorsHandler creates a new AcceleratorsHandler
func NewAcceleratorsHandler(k8sClient *k8s.Client, logger *zap.Logger) *AcceleratorsHandler {
	return &AcceleratorsHandler{
		k8sClient: k8sClient,
		logger:    logger,
	}
}

// List handles GET /api/v1/accelerators
func (h *AcceleratorsHandler) List(c *gin.Context) {
	ctx := c.Request.Context()

	accelerators, err := h.k8sClient.ListAcceleratorClasses(ctx)
	if err != nil {
		writeError(c, h.logger, "Failed to list accelerators", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": accelerators.Items,
		"total": len(accelerators.Items),
	})
}

// Get handles GET /api/v1/accelerators/:name
func (h *AcceleratorsHandler) Get(c *gin.Context) {
	ctx := c.Request.Context()
	name := c.Param("name")

	accelerator, err := h.k8sClient.GetAcceleratorClass(ctx, name)
	if err != nil {
		writeError(c, h.logger, "Accelerator not found", err)
		return
	}

	c.JSON(http.StatusOK, accelerator.Object)
}
