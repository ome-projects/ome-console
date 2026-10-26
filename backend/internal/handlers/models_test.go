package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"go.uber.org/zap/zaptest"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/validation/field"
	k8stesting "k8s.io/client-go/testing"
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

func TestModelsHandler_CreateRemovesItsTokenSecretWhenTheModelIsRejected(t *testing.T) {
	client, dynamicClient := newStartedClient(t, served)
	router, v1 := newRouter()
	v1.POST("/namespaces/:namespace/models", NewModelsHandler(client, zaptest.NewLogger(t)).CreateBaseModel)
	ctx := context.Background()
	secrets := client.Clientset.CoreV1().Secrets("team-a")

	rejectNext := true
	dynamicClient.PrependReactor("create", "basemodels", func(k8stesting.Action) (bool, runtime.Object, error) {
		if !rejectNext {
			return false, nil, nil
		}
		rejectNext = false
		return true, nil, apierrors.NewInvalid(schema.GroupKind{Group: "ome.io", Kind: "BaseModel"}, "llama",
			field.ErrorList{field.Required(field.NewPath("spec", "storage", "storageUri"), "")})
	})

	body := []byte(`{"model": {"metadata": {"name": "llama"}}, "huggingfaceToken": "hf_secret"}`)
	expectError(t, do(t, router, http.MethodPost, "/api/v1/namespaces/team-a/models", body, "application/json"),
		http.StatusUnprocessableEntity, "INVALID")
	if _, err := secrets.Get(ctx, "llama-hf-token", metav1.GetOptions{}); !apierrors.IsNotFound(err) {
		t.Fatalf("token secret should be removed with the rejected model, got %v", err)
	}

	// The corrected request is not blocked by a leftover Secret.
	if rec := do(t, router, http.MethodPost, "/api/v1/namespaces/team-a/models", body, "application/json"); rec.Code != http.StatusCreated {
		t.Fatalf("retry: expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	// A Secret that existed before the request stays, even when the model is rejected.
	kept := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "kept-hf-token"},
		Data:       map[string][]byte{"token": []byte("hf_secret")},
	}
	if _, err := secrets.Create(ctx, kept, metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	rejectNext = true
	expectError(t, do(t, router, http.MethodPost, "/api/v1/namespaces/team-a/models",
		[]byte(`{"model": {"metadata": {"name": "kept"}}, "huggingfaceToken": "hf_secret"}`), "application/json"),
		http.StatusUnprocessableEntity, "INVALID")
	if _, err := secrets.Get(ctx, "kept-hf-token", metav1.GetOptions{}); err != nil {
		t.Fatalf("a secret that existed before the request was removed: %v", err)
	}
}

func TestModelsHandler_CreateWithAnExistingTokenSecret(t *testing.T) {
	client, _ := newStartedClient(t, served, newObject("BaseModel", "team-a", "existing", nil))
	router, v1 := newRouter()
	v1.POST("/namespaces/:namespace/models", NewModelsHandler(client, zaptest.NewLogger(t)).CreateBaseModel)
	ctx := context.Background()
	secrets := client.Clientset.CoreV1().Secrets("team-a")

	create := func(name string) *httptest.ResponseRecorder {
		return do(t, router, http.MethodPost, "/api/v1/namespaces/team-a/models",
			[]byte(`{"model": {"metadata": {"name": "`+name+`"}}, "huggingfaceToken": "new"}`), "application/json")
	}
	get := func(name string) *corev1.Secret {
		t.Helper()
		secret, err := secrets.Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			t.Fatalf("secret %s: %v", name, err)
		}
		return secret
	}
	// handMade adds a Secret the console did not create, as the API server returns it.
	handMade := func(name, token string) {
		t.Helper()
		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: name},
			Data:       map[string][]byte{"token": []byte(token)},
		}
		if _, err := secrets.Create(ctx, secret, metav1.CreateOptions{}); err != nil {
			t.Fatal(err)
		}
	}

	// Any Secret that already holds the token is used as it is.
	handMade("same-hf-token", "new")
	if rec := create("same"); rec.Code != http.StatusCreated {
		t.Fatalf("same: expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if secret := get("same-hf-token"); len(secret.Labels) != 0 || secret.StringData != nil {
		t.Fatalf("same: secret was written to: %+v", secret)
	}

	// A token Secret the console left behind, e.g. for a deleted model, gets the new token.
	if _, err := client.EnsureHuggingFaceTokenSecret(ctx, "orphan-hf-token", "team-a", "old"); err != nil {
		t.Fatal(err)
	}
	if rec := create("orphan"); rec.Code != http.StatusCreated {
		t.Fatalf("orphan: expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if got := get("orphan-hf-token").StringData["token"]; got != "new" {
		t.Fatalf("orphan: token = %q, want the new one", got)
	}

	// A Secret the console did not create that holds another token is left alone.
	handMade("theirs-hf-token", "theirs")
	body := expectError(t, create("theirs"), http.StatusConflict, "CONFLICT")
	if msg, _ := body["message"].(string); !strings.Contains(msg, "spec.storage.key") {
		t.Fatalf("theirs: the message should say how to use the secret, got %q", msg)
	}
	if got := string(get("theirs-hf-token").Data["token"]); got != "theirs" {
		t.Fatalf("theirs: token = %q, want it unchanged", got)
	}

	// An existing model keeps its token Secret.
	if _, err := client.EnsureHuggingFaceTokenSecret(ctx, "existing-hf-token", "team-a", "old"); err != nil {
		t.Fatal(err)
	}
	expectError(t, create("existing"), http.StatusConflict, "ALREADY_EXISTS")
	if got := get("existing-hf-token").StringData["token"]; got != "old" {
		t.Fatalf("existing: token = %q, want it unchanged", got)
	}
}
