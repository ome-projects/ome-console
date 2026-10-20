package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap/zaptest"
	"k8s.io/apimachinery/pkg/runtime"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

func TestCapabilitiesHandler_Get(t *testing.T) {
	gin.SetMode(gin.TestMode)
	client := k8s.NewClientWith(k8sfake.NewSimpleClientset(), dynamicfake.NewSimpleDynamicClient(runtime.NewScheme()), nil, zaptest.NewLogger(t))
	client.Capabilities = k8s.Capabilities{
		OMEInstalled: true,
		Resources:    map[string]bool{"inferenceservices": true, "rolloutpolicies": false},
		Features:     map[string]bool{"rolloutPolicy": false},
		CheckedAt:    time.Now(),
	}

	router := gin.New()
	router.GET("/api/v1/capabilities", NewCapabilitiesHandler(client).Get)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/capabilities", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		OMEInstalled bool            `json:"omeInstalled"`
		Resources    map[string]bool `json:"resources"`
		Features     map[string]bool `json:"features"`
		CheckedAt    time.Time       `json:"checkedAt"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if !body.OMEInstalled || !body.Resources["inferenceservices"] || body.Resources["rolloutpolicies"] || body.Features["rolloutPolicy"] {
		t.Fatalf("unexpected body: %s", rec.Body.String())
	}
	if body.CheckedAt.IsZero() {
		t.Fatal("checkedAt missing")
	}
}
