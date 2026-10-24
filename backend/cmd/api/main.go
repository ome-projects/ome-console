package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"
	"sigs.k8s.io/ome/ome-console/backend/internal/api"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

func main() {
	// Initialize logger
	logger, err := zap.NewProduction()
	if err != nil {
		log.Fatalf("Failed to initialize logger: %v", err)
	}
	defer logger.Sync()

	logger.Info("Starting OME Web Console API Server")

	// Initialize Kubernetes client
	k8sClient, err := k8s.NewClient(logger)
	if err != nil {
		logger.Fatal("Failed to create Kubernetes client", zap.Error(err))
	}

	// Find out which OME resources this cluster serves. Informers are only created for those,
	// so a missing CRD disables a feature instead of blocking startup.
	caps, err := k8sClient.DiscoverCapabilities(context.Background())
	if err != nil {
		logger.Fatal("Failed to discover OME API resources", zap.Error(err))
	}
	if !caps.OMEInstalled {
		logger.Warn("OME API group not found on this cluster; OME features stay disabled until OME is installed and the console restarts",
			zap.String("groupVersion", k8s.OMEGroupVersion))
	}

	// Setup informers with event handlers
	if err := k8sClient.SetupInformers(); err != nil {
		logger.Fatal("Failed to set up informers", zap.Error(err))
	}

	// Field validation for writes: Strict (default) rejects fields the CRD does not declare
	if mode := os.Getenv("OME_FIELD_VALIDATION"); mode != "" {
		switch mode {
		case k8s.FieldValidationStrict, k8s.FieldValidationWarn, k8s.FieldValidationIgnore:
			k8sClient.FieldValidation = mode
		default:
			logger.Fatal("Invalid OME_FIELD_VALIDATION", zap.String("value", mode),
				zap.Strings("allowed", []string{k8s.FieldValidationStrict, k8s.FieldValidationWarn, k8s.FieldValidationIgnore}))
		}
	}

	// Bound the wait for the informer caches so a missing permission fails loudly
	if timeout := os.Getenv("INFORMER_SYNC_TIMEOUT"); timeout != "" {
		d, err := time.ParseDuration(timeout)
		if err != nil {
			logger.Fatal("Invalid INFORMER_SYNC_TIMEOUT", zap.String("value", timeout), zap.Error(err))
		}
		k8sClient.CacheSyncTimeout = d
	}

	// Start informers and wait for cache sync before accepting requests
	logger.Info("Starting informers and waiting for cache sync...")
	if err := k8sClient.StartInformers(); err != nil {
		logger.Fatal("Failed to start informers", zap.Error(err))
	}
	logger.Info("Informers started and caches synced successfully")

	// Create API server
	server := api.NewServer(k8sClient, logger)

	// Setup routes
	router := server.SetupRoutes()

	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Create HTTP server
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           router,
		ReadTimeout:       15 * time.Second,
		ReadHeaderTimeout: 10 * time.Second,
		// Bounds ordinary responses. The SSE stream at GET /api/v1/events outlives this; its
		// handler renews the write deadline before every write instead (see handlers/events.go).
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		logger.Info("Server starting", zap.String("port", port))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server failed to start", zap.Error(err))
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Server shutting down...")

	// Stop informers
	logger.Info("Stopping informers...")
	k8sClient.Stop()

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exited")
}
