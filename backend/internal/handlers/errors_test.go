package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/validation/field"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
	"sigs.k8s.io/ome/ome-console/backend/internal/services"
)

func TestClassifyError(t *testing.T) {
	gr := schema.GroupResource{Group: "ome.io", Resource: "inferenceservices"}
	invalid := apierrors.NewInvalid(schema.GroupKind{Group: "ome.io", Kind: "InferenceService"}, "x",
		field.ErrorList{field.Required(field.NewPath("spec", "engine"), "engine is required")})

	cases := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"not supported", fmt.Errorf("rolloutpolicies: %w", k8s.ErrNotSupported), http.StatusNotFound, "CAPABILITY_MISSING"},
		{"no compatible runtime", fmt.Errorf("recommend: %w", services.ErrNoCompatibleRuntime), http.StatusNotFound, "NOT_FOUND"},
		{"not found", apierrors.NewNotFound(gr, "x"), http.StatusNotFound, "NOT_FOUND"},
		{"already exists", apierrors.NewAlreadyExists(gr, "x"), http.StatusConflict, "ALREADY_EXISTS"},
		{"conflict", apierrors.NewConflict(gr, "x", errors.New("stale")), http.StatusConflict, "CONFLICT"},
		{"invalid", invalid, http.StatusUnprocessableEntity, "INVALID"},
		{"bad request", apierrors.NewBadRequest("nope"), http.StatusBadRequest, "BAD_REQUEST"},
		{"unauthorized", apierrors.NewUnauthorized("who"), http.StatusUnauthorized, "UNAUTHORIZED"},
		{"forbidden", apierrors.NewForbidden(gr, "x", errors.New("rbac")), http.StatusForbidden, "FORBIDDEN"},
		{"too many requests", apierrors.NewTooManyRequests("slow down", 1), http.StatusTooManyRequests, "TOO_MANY_REQUESTS"},
		{"unavailable", apierrors.NewServiceUnavailable("down"), http.StatusServiceUnavailable, "UNAVAILABLE"},
		{"timeout", apierrors.NewTimeoutError("slow", 1), http.StatusServiceUnavailable, "UNAVAILABLE"},
		{"wrapped status error", fmt.Errorf("get: %w", apierrors.NewNotFound(gr, "x")), http.StatusNotFound, "NOT_FOUND"},
		{"plain error", errors.New("boom"), http.StatusInternalServerError, "INTERNAL"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, code, _ := classifyError(tc.err)
			if status != tc.status || code != tc.code {
				t.Fatalf("got %d %s, want %d %s", status, code, tc.status, tc.code)
			}
		})
	}

	_, _, details := classifyError(invalid)
	causes, ok := details.([]errorCause)
	if !ok || len(causes) != 1 || causes[0].Field != "spec.engine" || causes[0].Reason != "FieldValueRequired" {
		t.Fatalf("expected the validation cause with its field path, got %#v", details)
	}
}
