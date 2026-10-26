package k8s

import (
	"context"
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

// EnsureHuggingFaceTokenSecret stores a HuggingFace token in the named Secret. It creates the
// Secret, or updates a token Secret the console created earlier, such as one left behind by a
// model create that failed or by a deleted model. A Secret the console did not create is never
// changed; its AlreadyExists error is returned instead. created reports whether this call
// created the Secret.
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
	for key, value := range huggingFaceTokenLabels {
		if existing.Labels[key] != value {
			return false, createErr
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
