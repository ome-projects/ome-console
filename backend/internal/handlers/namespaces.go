package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

type NamespacesHandler struct {
	k8sClient *k8s.Client
	logger    *zap.Logger
}

func NewNamespacesHandler(k8sClient *k8s.Client, logger *zap.Logger) *NamespacesHandler {
	return &NamespacesHandler{
		k8sClient: k8sClient,
		logger:    logger,
	}
}

// ListNamespaces handles GET /api/v1/namespaces
func (h *NamespacesHandler) List(c *gin.Context) {
	ctx := c.Request.Context()

	namespaces, err := h.k8sClient.ListNamespaces(ctx)
	if err != nil {
		writeError(c, h.logger, "Failed to list namespaces", err)
		return
	}

	// Extract namespace names
	names := make([]string, 0, len(namespaces.Items))
	for _, ns := range namespaces.Items {
		names = append(names, ns.Name)
	}

	c.JSON(http.StatusOK, gin.H{
		"items": names,
		"total": len(names),
	})
}

// GetNamespace handles GET /api/v1/namespaces/:name
func (h *NamespacesHandler) Get(c *gin.Context) {
	ctx := c.Request.Context()
	name := c.Param("name")

	namespace, err := h.k8sClient.GetNamespace(ctx, name)
	if err != nil {
		writeError(c, h.logger, "Namespace not found", err)
		return
	}

	c.JSON(http.StatusOK, namespace)
}
