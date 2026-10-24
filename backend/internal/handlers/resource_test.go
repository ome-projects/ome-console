package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"go.uber.org/zap/zaptest"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8stesting "k8s.io/client-go/testing"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

var served = []string{"inferenceservices", "basemodels", "clusterbasemodels", "servingruntimes", "clusterservingruntimes", "acceleratorclasses"}

func do(t *testing.T, router http.Handler, method, path string, body []byte, contentType string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var body map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON (%d): %s", rec.Code, rec.Body.String())
	}
	return body
}

func expectError(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) map[string]interface{} {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("expected %d, got %d: %s", status, rec.Code, rec.Body.String())
	}
	body := decode(t, rec)
	if body["code"] != code {
		t.Fatalf("expected code %s, got %v: %s", code, body["code"], rec.Body.String())
	}
	if body["message"] == "" || body["error"] == "" {
		t.Fatalf("error body must carry error and message: %s", rec.Body.String())
	}
	return body
}

// waitForCache polls until the informer cache reflects a write made through the dynamic client.
func waitForCache(t *testing.T, client *k8s.Client, res k8s.OMEResource, namespace, name string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := client.Get(res, namespace, name); err == nil {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("%s %s/%s never reached the cache", res.Kind, namespace, name)
}

func TestResourceHandler_NamespacedRoutes(t *testing.T) {
	client, _ := newStartedClient(t, served,
		newObject("InferenceService", "team-a", "llama", map[string]interface{}{"model": map[string]interface{}{"name": "llama"}}),
		newObject("InferenceService", "team-b", "qwen", nil),
	)
	router, v1 := newRouter()
	NewResourceHandler(client, k8s.InferenceServiceResource, zaptest.NewLogger(t)).Mount(v1, true)

	t.Run("list across namespaces", func(t *testing.T) {
		rec := do(t, router, http.MethodGet, "/api/v1/services", nil, "")
		if rec.Code != http.StatusOK {
			t.Fatalf("%d: %s", rec.Code, rec.Body.String())
		}
		body := decode(t, rec)
		if body["total"].(float64) != 2 || body["namespace"] != nil {
			t.Fatalf("unexpected body %v", body)
		}
	})
	t.Run("list one namespace via path and via query", func(t *testing.T) {
		for _, path := range []string{"/api/v1/namespaces/team-a/services", "/api/v1/services?namespace=team-a"} {
			body := decode(t, do(t, router, http.MethodGet, path, nil, ""))
			if body["total"].(float64) != 1 || body["namespace"] != "team-a" {
				t.Fatalf("%s: unexpected body %v", path, body)
			}
		}
	})
	t.Run("invalid label selector", func(t *testing.T) {
		expectError(t, do(t, router, http.MethodGet, "/api/v1/services?labelSelector=!!!", nil, ""), http.StatusBadRequest, "BAD_REQUEST")
	})
	t.Run("get", func(t *testing.T) {
		rec := do(t, router, http.MethodGet, "/api/v1/namespaces/team-a/services/llama", nil, "")
		if rec.Code != http.StatusOK || decode(t, rec)["kind"] != "InferenceService" {
			t.Fatalf("%d: %s", rec.Code, rec.Body.String())
		}
		expectError(t, do(t, router, http.MethodGet, "/api/v1/namespaces/team-a/services/missing", nil, ""), http.StatusNotFound, "NOT_FOUND")
		expectError(t, do(t, router, http.MethodGet, "/api/v1/services/llama", nil, ""), http.StatusBadRequest, "BAD_REQUEST")
	})
	t.Run("status", func(t *testing.T) {
		body := decode(t, do(t, router, http.MethodGet, "/api/v1/services/llama/status?namespace=team-a", nil, ""))
		if _, ok := body["status"].(map[string]interface{}); !ok {
			t.Fatalf("unexpected body %v", body)
		}
	})
	t.Run("create, patch, update, delete", func(t *testing.T) {
		rec := do(t, router, http.MethodPost, "/api/v1/namespaces/team-a/services?dryRun=true",
			[]byte(`{"metadata":{"name":"dry"},"spec":{}}`), "application/json")
		if rec.Code != http.StatusCreated {
			t.Fatalf("dry-run create: %d %s", rec.Code, rec.Body.String())
		}

		rec = do(t, router, http.MethodPost, "/api/v1/namespaces/team-a/services",
			[]byte(`{"metadata":{"name":"new"},"spec":{"engine":{}}}`), "application/json")
		if rec.Code != http.StatusCreated {
			t.Fatalf("create: %d %s", rec.Code, rec.Body.String())
		}
		created := decode(t, rec)
		if created["apiVersion"] != k8s.OMEGroupVersion || created["kind"] != "InferenceService" {
			t.Fatalf("apiVersion/kind not stamped: %v", created)
		}
		waitForCache(t, client, k8s.InferenceServiceResource, "team-a", "new")

		rec = do(t, router, http.MethodPatch, "/api/v1/namespaces/team-a/services/new",
			[]byte(`{"metadata":{"labels":{"team":"a"}}}`), "application/merge-patch+json")
		if rec.Code != http.StatusOK {
			t.Fatalf("merge patch: %d %s", rec.Code, rec.Body.String())
		}
		rec = do(t, router, http.MethodPatch, "/api/v1/namespaces/team-a/services/new",
			[]byte(`[{"op":"add","path":"/metadata/annotations","value":{"note":"x"}}]`), "application/json")
		if rec.Code != http.StatusOK {
			t.Fatalf("json patch: %d %s", rec.Code, rec.Body.String())
		}
		patched := decode(t, rec)
		meta := patched["metadata"].(map[string]interface{})
		if meta["labels"].(map[string]interface{})["team"] != "a" || meta["annotations"].(map[string]interface{})["note"] != "x" {
			t.Fatalf("patches not applied: %v", meta)
		}
		expectError(t, do(t, router, http.MethodPatch, "/api/v1/namespaces/team-a/services/new", []byte(`{}`), "text/plain"),
			http.StatusBadRequest, "BAD_REQUEST")

		full, _ := json.Marshal(patched)
		rec = do(t, router, http.MethodPut, "/api/v1/namespaces/team-a/services/new", full, "application/json")
		if rec.Code != http.StatusOK {
			t.Fatalf("update: %d %s", rec.Code, rec.Body.String())
		}
		expectError(t, do(t, router, http.MethodPut, "/api/v1/namespaces/team-a/services/other", full, "application/json"),
			http.StatusBadRequest, "BAD_REQUEST")

		rec = do(t, router, http.MethodDelete, "/api/v1/services/new?namespace=team-a", nil, "")
		if rec.Code != http.StatusOK || decode(t, rec)["namespace"] != "team-a" {
			t.Fatalf("delete: %d %s", rec.Code, rec.Body.String())
		}
		expectError(t, do(t, router, http.MethodDelete, "/api/v1/namespaces/team-a/services/new", nil, ""), http.StatusNotFound, "NOT_FOUND")
	})
	t.Run("create needs a namespace and a matching kind", func(t *testing.T) {
		expectError(t, do(t, router, http.MethodPost, "/api/v1/services", []byte(`{"metadata":{"name":"x"}}`), "application/json"),
			http.StatusBadRequest, "BAD_REQUEST")
		expectError(t, do(t, router, http.MethodPost, "/api/v1/namespaces/team-a/services",
			[]byte(`{"kind":"BaseModel","metadata":{"name":"x"}}`), "application/json"), http.StatusBadRequest, "BAD_REQUEST")
		expectError(t, do(t, router, http.MethodPost, "/api/v1/namespaces/team-a/services",
			[]byte(`{"metadata":{"name":"x","namespace":"team-b"}}`), "application/json"), http.StatusBadRequest, "BAD_REQUEST")
		expectError(t, do(t, router, http.MethodPost, "/api/v1/namespaces/team-a/services", []byte(`not json`), "application/json"),
			http.StatusBadRequest, "BAD_REQUEST")
	})
	t.Run("create takes the namespace from the body at the top level", func(t *testing.T) {
		rec := do(t, router, http.MethodPost, "/api/v1/services",
			[]byte(`{"metadata":{"name":"frombody","namespace":"team-b"}}`), "application/json")
		if rec.Code != http.StatusCreated {
			t.Fatalf("create: %d %s", rec.Code, rec.Body.String())
		}
	})
	t.Run("writes take dryRun only as true or false", func(t *testing.T) {
		body := []byte(`{"metadata":{"name":"llama"}}`)
		for _, req := range []struct{ method, path string }{
			{http.MethodPost, "/api/v1/namespaces/team-a/services?dryRun=1"},
			{http.MethodPut, "/api/v1/namespaces/team-a/services/llama?dryRun=True"},
			{http.MethodPatch, "/api/v1/namespaces/team-a/services/llama?dryRun="},
		} {
			expectError(t, do(t, router, req.method, req.path, body, "application/json"), http.StatusBadRequest, "BAD_REQUEST")
		}
		rec := do(t, router, http.MethodPost, "/api/v1/namespaces/team-a/services?dryRun=false",
			[]byte(`{"metadata":{"name":"notdry"},"spec":{}}`), "application/json")
		if rec.Code != http.StatusCreated {
			t.Fatalf("dryRun=false create: %d %s", rec.Code, rec.Body.String())
		}
	})
}

func TestResourceHandler_ClusterScopedRoutes(t *testing.T) {
	client, _ := newStartedClient(t, served, newObject("ClusterBaseModel", "", "llama", nil))
	router, v1 := newRouter()
	NewResourceHandler(client, k8s.ClusterBaseModelResource, zaptest.NewLogger(t)).Mount(v1, false)

	body := decode(t, do(t, router, http.MethodGet, "/api/v1/models", nil, ""))
	if body["total"].(float64) != 1 {
		t.Fatalf("unexpected body %v", body)
	}
	rec := do(t, router, http.MethodGet, "/api/v1/models/llama", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("%d: %s", rec.Code, rec.Body.String())
	}
	expectError(t, do(t, router, http.MethodPost, "/api/v1/models",
		[]byte(`{"metadata":{"name":"x","namespace":"team-a"}}`), "application/json"), http.StatusBadRequest, "BAD_REQUEST")
	rec = do(t, router, http.MethodDelete, "/api/v1/models/llama", nil, "")
	if rec.Code != http.StatusOK || decode(t, rec)["namespace"] != nil {
		t.Fatalf("delete: %d %s", rec.Code, rec.Body.String())
	}
}

func TestResourceHandler_MapsAPIServerErrors(t *testing.T) {
	client, dynamicClient := newStartedClient(t, served, newObject("InferenceService", "team-a", "llama", nil))
	router, v1 := newRouter()
	NewResourceHandler(client, k8s.InferenceServiceResource, zaptest.NewLogger(t)).Mount(v1, true)
	gr := schema.GroupResource{Group: "ome.io", Resource: "inferenceservices"}

	dynamicClient.PrependReactor("update", "inferenceservices", func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewConflict(gr, "llama", errors.New("the object has been modified"))
	})
	body := expectError(t, do(t, router, http.MethodPut, "/api/v1/namespaces/team-a/services/llama",
		[]byte(`{"metadata":{"name":"llama"}}`), "application/json"), http.StatusConflict, "CONFLICT")
	if body["error"] != "Failed to update InferenceService" {
		t.Fatalf("unexpected error title %v", body["error"])
	}

	dynamicClient.PrependReactor("create", "inferenceservices", func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewInvalid(schema.GroupKind{Group: "ome.io", Kind: "InferenceService"}, "x", nil)
	})
	expectError(t, do(t, router, http.MethodPost, "/api/v1/namespaces/team-a/services",
		[]byte(`{"metadata":{"name":"x"}}`), "application/json"), http.StatusUnprocessableEntity, "INVALID")
}

func TestResourceHandler_UnsupportedResource(t *testing.T) {
	client, _ := newStartedClient(t, served)
	router, v1 := newRouter()
	NewResourceHandler(client, k8s.MustResource("rolloutpolicies"), zaptest.NewLogger(t)).Mount(v1, true)

	expectError(t, do(t, router, http.MethodGet, "/api/v1/rolloutpolicies", nil, ""), http.StatusNotFound, "CAPABILITY_MISSING")
	expectError(t, do(t, router, http.MethodGet, "/api/v1/namespaces/team-a/rolloutpolicies/p", nil, ""), http.StatusNotFound, "CAPABILITY_MISSING")
	expectError(t, do(t, router, http.MethodPost, "/api/v1/namespaces/team-a/rolloutpolicies",
		[]byte(`{"metadata":{"name":"p"}}`), "application/json"), http.StatusNotFound, "CAPABILITY_MISSING")
	expectError(t, do(t, router, http.MethodDelete, "/api/v1/namespaces/team-a/rolloutpolicies/p", nil, ""), http.StatusNotFound, "CAPABILITY_MISSING")
}

func TestPatchTypeFor(t *testing.T) {
	cases := []struct {
		contentType string
		body        string
		want        string
		wantErr     bool
	}{
		{"application/json-patch+json", "[]", "application/json-patch+json", false},
		{"application/merge-patch+json", "{}", "application/merge-patch+json", false},
		{"application/strategic-merge-patch+json", "{}", "application/strategic-merge-patch+json", false},
		{"application/json", "[{}]", "application/json-patch+json", false},
		{"application/json", " {}", "application/merge-patch+json", false},
		{"", "{}", "application/merge-patch+json", false},
		{"text/plain", "{}", "", true},
	}
	for _, tc := range cases {
		got, err := patchTypeFor(tc.contentType, []byte(tc.body))
		if (err != nil) != tc.wantErr || string(got) != tc.want {
			t.Errorf("patchTypeFor(%q, %q) = %q, %v; want %q, err=%v", tc.contentType, tc.body, got, err, tc.want, tc.wantErr)
		}
	}
}
