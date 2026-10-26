package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
	"sigs.k8s.io/ome/ome-console/backend/internal/services"
)

// apiError is the body of every error response. The frontend reads message, code and details.
type apiError struct {
	// Error is a short description of what failed, e.g. "Failed to create service".
	Error string `json:"error"`
	// Code is a stable machine-readable classification.
	Code string `json:"code"`
	// Message is the detailed, human-readable cause.
	Message string `json:"message"`
	// Details carries structured causes when the API server provides them (field paths for
	// validation failures) or the raw error text otherwise.
	Details interface{} `json:"details,omitempty"`
}

// errorCause is one entry of apiError.Details for validation failures.
type errorCause struct {
	Field   string `json:"field,omitempty"`
	Reason  string `json:"reason,omitempty"`
	Message string `json:"message"`
}

// writeError classifies an error from the Kubernetes layer and writes the matching HTTP response.
// action is the short description shown as the error title.
func writeError(c *gin.Context, logger *zap.Logger, action string, err error) {
	status, code, details := classifyError(err)
	body := apiError{Error: action, Code: code, Message: err.Error(), Details: details}

	fields := []zap.Field{
		zap.Int("status", status),
		zap.String("code", code),
		zap.String("path", c.FullPath()),
		zap.Error(err),
	}
	if status >= http.StatusInternalServerError {
		logger.Error(action, fields...)
	} else {
		logger.Warn(action, fields...)
	}
	c.JSON(status, body)
}

// writeBadRequest writes a 400 for a request the handler could not parse or that fails a check
// made before talking to Kubernetes.
func writeBadRequest(c *gin.Context, logger *zap.Logger, action string, err error) {
	logger.Warn(action, zap.String("path", c.FullPath()), zap.Error(err))
	c.JSON(http.StatusBadRequest, apiError{
		Error:   action,
		Code:    "BAD_REQUEST",
		Message: err.Error(),
	})
}

// rejected reports whether the API server refused a request with a 4xx status, in which case
// it stored nothing.
func rejected(err error) bool {
	var status apierrors.APIStatus
	if !errors.As(err, &status) {
		return false
	}
	code := status.Status().Code
	return code >= http.StatusBadRequest && code < http.StatusInternalServerError
}

// classifyError maps an error to an HTTP status, a stable code and optional structured details.
func classifyError(err error) (int, string, interface{}) {
	if errors.Is(err, k8s.ErrNotSupported) {
		return http.StatusNotFound, "CAPABILITY_MISSING", nil
	}
	if errors.Is(err, services.ErrNoCompatibleRuntime) {
		return http.StatusNotFound, "NOT_FOUND", nil
	}

	var details interface{}
	if statusErr, ok := err.(apierrors.APIStatus); ok || errors.As(err, &statusErr) {
		if st := statusErr.Status(); st.Details != nil && len(st.Details.Causes) > 0 {
			causes := make([]errorCause, 0, len(st.Details.Causes))
			for _, cause := range st.Details.Causes {
				causes = append(causes, errorCause{
					Field:   cause.Field,
					Reason:  string(cause.Type),
					Message: cause.Message,
				})
			}
			details = causes
		}
	}

	switch {
	case apierrors.IsNotFound(err):
		return http.StatusNotFound, "NOT_FOUND", details
	case apierrors.IsAlreadyExists(err):
		return http.StatusConflict, "ALREADY_EXISTS", details
	case apierrors.IsConflict(err):
		return http.StatusConflict, "CONFLICT", details
	case apierrors.IsInvalid(err):
		return http.StatusUnprocessableEntity, "INVALID", details
	case apierrors.IsBadRequest(err):
		return http.StatusBadRequest, "BAD_REQUEST", details
	case apierrors.IsUnauthorized(err):
		return http.StatusUnauthorized, "UNAUTHORIZED", details
	case apierrors.IsForbidden(err):
		return http.StatusForbidden, "FORBIDDEN", details
	case apierrors.IsTooManyRequests(err):
		return http.StatusTooManyRequests, "TOO_MANY_REQUESTS", details
	case apierrors.IsServiceUnavailable(err), apierrors.IsServerTimeout(err), apierrors.IsTimeout(err):
		return http.StatusServiceUnavailable, "UNAVAILABLE", details
	default:
		return http.StatusInternalServerError, "INTERNAL", details
	}
}
