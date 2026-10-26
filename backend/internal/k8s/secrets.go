package k8s

import (
	"context"
	"fmt"
	"maps"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// huggingFaceTokenLabels mark a Secret as a HuggingFace token Secret the console created.
var huggingFaceTokenLabels = map[string]string{
	"app.kubernetes.io/managed-by": "ome-web-console",
	"ome.io/secret-type":           "huggingface-token",
}

// EnsureHuggingFaceTokenSecret stores a HuggingFace token in the named Secret and reports whether
// this call created it. An existing Secret that already holds the token is used as it is,
// whoever created it. One holding another token is updated only if the console created it, such
// as one left behind by a model create that failed or by a deleted model; any other Secret is
// never changed, and a Conflict error says how to use it instead.
func (c *Client) EnsureHuggingFaceTokenSecret(ctx context.Context, secretName, namespace, token string) (created bool, err error) {
	secrets := c.Clientset.CoreV1().Secrets(namespace)
	_, createErr := secrets.Create(ctx, &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      secretName,
			Namespace: namespace,
			Labels:    maps.Clone(huggingFaceTokenLabels),
		},
		Type: corev1.SecretTypeOpaque,
		StringData: map[string]string{
			"token": token,
		},
	}, metav1.CreateOptions{})
	if !apierrors.IsAlreadyExists(createErr) {
		return createErr == nil, createErr
	}

	existing, err := secrets.Get(ctx, secretName, metav1.GetOptions{})
	if err != nil {
		return false, err
	}
	if string(existing.Data["token"]) == token {
		return false, nil
	}
	for key, value := range huggingFaceTokenLabels {
		if existing.Labels[key] != value {
			return false, apierrors.NewConflict(corev1.Resource("secrets"), secretName, fmt.Errorf(
				"it holds a different token and was not created by the console, so it is left unchanged; "+
					"to use it, create the model without a token and with spec.storage.key set to %q", secretName))
		}
	}
	existing.StringData = map[string]string{"token": token}
	_, err = secrets.Update(ctx, existing, metav1.UpdateOptions{})
	return false, err
}

// DeleteSecret deletes a Secret.
func (c *Client) DeleteSecret(ctx context.Context, name, namespace string) error {
	return c.Clientset.CoreV1().Secrets(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}
