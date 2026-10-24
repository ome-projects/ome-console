package handlers

import (
	"context"
	"net/http"
	"testing"

	"go.uber.org/zap/zaptest"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestModelsHandler_CreateStoresTokenWhereTheModelAgentReadsIt(t *testing.T) {
	client, _ := newStartedClient(t, served)
	router, v1 := newRouter()
	h := NewModelsHandler(client, zaptest.NewLogger(t))
	v1.POST("/models", h.Create)
	v1.POST("/namespaces/:namespace/models", h.CreateBaseModel)

	body := []byte(`{"model": {"metadata": {"name": "llama"}, "spec": {"storage": {"storageUri": "hf://meta-llama/Llama-3.1-8B"}}}, "huggingfaceToken": "hf_secret"}`)
	for _, tc := range []struct {
		path, kind, namespace, secretNamespace string
	}{
		{"/api/v1/namespaces/team-a/models", "BaseModel", "team-a", "team-a"},
		{"/api/v1/models", "ClusterBaseModel", "", "ome"},
	} {
		rec := do(t, router, http.MethodPost, tc.path, body, "application/json")
		if rec.Code != http.StatusCreated {
			t.Fatalf("POST %s: expected 201, got %d: %s", tc.path, rec.Code, rec.Body.String())
		}
		created := &unstructured.Unstructured{Object: decode(t, rec)}
		if created.GetKind() != tc.kind || created.GetNamespace() != tc.namespace || created.GetName() != "llama" {
			t.Fatalf("POST %s: created %s %s/%s", tc.path, created.GetKind(), created.GetNamespace(), created.GetName())
		}
		if key, _, _ := unstructured.NestedString(created.Object, "spec", "storage", "key"); key != "llama-hf-token" {
			t.Fatalf("POST %s: spec.storage.key = %q", tc.path, key)
		}
		secret, err := client.Clientset.CoreV1().Secrets(tc.secretNamespace).Get(context.Background(), "llama-hf-token", metav1.GetOptions{})
		if err != nil {
			t.Fatalf("POST %s: token secret in %s: %v", tc.path, tc.secretNamespace, err)
		}
		if secret.StringData["token"] != "hf_secret" {
			t.Fatalf("POST %s: secret carries %v", tc.path, secret.StringData)
		}
	}
}

func TestModelsHandler_CreateWithoutModelIsBadRequest(t *testing.T) {
	client, _ := newStartedClient(t, served)
	router, v1 := newRouter()
	v1.POST("/namespaces/:namespace/models", NewModelsHandler(client, zaptest.NewLogger(t)).CreateBaseModel)

	// A bare object is not a create request: the body wraps it as {model, huggingfaceToken}.
	expectError(t, do(t, router, http.MethodPost, "/api/v1/namespaces/team-a/models",
		[]byte(`{"metadata": {"name": "llama"}}`), "application/json"), http.StatusBadRequest, "BAD_REQUEST")
}
