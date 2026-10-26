package k8s

import (
	"context"
	"fmt"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"
)

func TestPodSelector_LabelSelector(t *testing.T) {
	three := int64(3)
	cases := map[string]struct {
		sel  PodSelector
		want string
	}{
		"service only": {
			sel:  PodSelector{Service: "llama"},
			want: "ome.io/inferenceservice=llama",
		},
		"component": {
			sel:  PodSelector{Service: "llama", Component: "engine"},
			want: "component=engine,ome.io/inferenceservice=llama",
		},
		"instance implies OMENative": {
			sel:  PodSelector{Service: "llama", Instance: &three},
			want: "ome.io/inferenceservice=llama,ome.io/instance-index=3,ome.io/managed-by=OMENative",
		},
		"revision": {
			sel:  PodSelector{Service: "llama", Component: "decoder", Revision: "a1b2c3d4"},
			want: "component=decoder,ome.io/inferenceservice=llama,ome.io/revision-hash=a1b2c3d4",
		},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if got := tc.sel.LabelSelector(); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestListServicePods_FiltersSortsAndLimits(t *testing.T) {
	c, _ := newTestClient(t, nil)
	cs := c.Clientset.(*k8sfake.Clientset)
	for i := 4; i >= 0; i-- {
		pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("llama-engine-%d", i),
			Namespace: "team-a",
			Labels:    map[string]string{InferenceServiceLabel: "llama", ComponentLabel: "engine"},
		}}
		if _, err := cs.CoreV1().Pods("team-a").Create(context.Background(), pod, metav1.CreateOptions{}); err != nil {
			t.Fatal(err)
		}
	}
	other := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{
		Name: "mistral-engine-0", Namespace: "team-a",
		Labels: map[string]string{InferenceServiceLabel: "mistral"},
	}}
	if _, err := cs.CoreV1().Pods("team-a").Create(context.Background(), other, metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}

	pods, truncated, err := c.ListServicePods(context.Background(), "team-a", PodSelector{Service: "llama"}, 3)
	if err != nil {
		t.Fatal(err)
	}
	if !truncated || len(pods) != 3 {
		t.Fatalf("got %d pods, truncated=%v; want 3, true", len(pods), truncated)
	}
	for i, pod := range pods {
		if want := fmt.Sprintf("llama-engine-%d", i); pod.Name != want {
			t.Fatalf("pod %d is %q, want %q (sorted by name)", i, pod.Name, want)
		}
	}

	pods, truncated, err = c.ListServicePods(context.Background(), "team-a", PodSelector{Service: "llama"}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if truncated || len(pods) != 5 {
		t.Fatalf("got %d pods, truncated=%v; want 5, false", len(pods), truncated)
	}
}
