package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"go.uber.org/zap/zaptest"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

func TestModelsHandler_ProgressMatchesTheModelsScope(t *testing.T) {
	client, _ := newStartedClient(t, served)
	router, v1 := newRouter()
	h := NewModelsHandler(client, zaptest.NewLogger(t))
	v1.GET("/models/:name/progress", h.GetProgress)
	v1.GET("/namespaces/:namespace/models/:name/progress", h.GetProgress)

	entry := func(completed uint64) string {
		b, _ := json.Marshal(map[string]interface{}{
			"name": "llama", "status": "Updating",
			"progress": map[string]interface{}{"phase": "Downloading", "totalBytes": 100, "completedBytes": completed},
		})
		return string(b)
	}
	_, err := client.Clientset.CoreV1().ConfigMaps(k8s.OMENamespace).Create(context.Background(), &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1", Labels: map[string]string{k8s.ModelStatusConfigMapLabel: "true"}},
		Data: map[string]string{
			"clusterbasemodel.llama":                  entry(10),
			"default.basemodel.llama":                 entry(20),
			"team-a.basemodel.llama":                  entry(30),
			"artifact.huggingface.meta-llama.llama-3": `{"repo": "meta-llama/llama-3"}`,
		},
	}, metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("create ConfigMap: %v", err)
	}

	for path, completed := range map[string]float64{
		"/api/v1/models/llama/progress":                    10,
		"/api/v1/namespaces/team-a/models/llama/progress":  30,
		"/api/v1/namespaces/default/models/llama/progress": 20,
	} {
		rec := do(t, router, http.MethodGet, path, nil, "")
		if rec.Code != http.StatusOK {
			t.Fatalf("GET %s: expected 200, got %d: %s", path, rec.Code, rec.Body.String())
		}
		progress, _ := decode(t, rec)["progress"].([]interface{})
		if len(progress) != 1 {
			t.Fatalf("GET %s: expected one node entry, got %v", path, progress)
		}
		if got := progress[0].(map[string]interface{})["completedBytes"]; got != completed {
			t.Fatalf("GET %s: completedBytes = %v, want %v", path, got, completed)
		}
	}
}
