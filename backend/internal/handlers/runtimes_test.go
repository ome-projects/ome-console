package handlers

import (
	"net/http"
	"testing"

	"go.uber.org/zap/zaptest"
)

func TestRuntimesHandler_RecommendationWithoutMatchIsNotFound(t *testing.T) {
	client, _ := newStartedClient(t, served)
	router, v1 := newRouter()
	v1.GET("/runtimes/recommend", NewRuntimesHandler(client, zaptest.NewLogger(t)).GetRecommendation)

	expectError(t, do(t, router, http.MethodGet, "/api/v1/runtimes/recommend?format=safetensors", nil, ""),
		http.StatusNotFound, "NOT_FOUND")
}
