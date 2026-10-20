package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

// CapabilitiesHandler reports which OME resources and console features the connected cluster
// supports, as discovered at startup.
type CapabilitiesHandler struct {
	k8sClient *k8s.Client
}

// NewCapabilitiesHandler creates a new CapabilitiesHandler
func NewCapabilitiesHandler(k8sClient *k8s.Client) *CapabilitiesHandler {
	return &CapabilitiesHandler{k8sClient: k8sClient}
}

// Get handles GET /api/v1/capabilities
func (h *CapabilitiesHandler) Get(c *gin.Context) {
	c.JSON(http.StatusOK, h.k8sClient.Capabilities)
}
