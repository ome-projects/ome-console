package k8s

import (
	"context"
	"io"
	"sort"
	"strconv"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
)

// Labels OME puts on the pods of an InferenceService. They mirror pkg/constants and
// pkg/controller/v1beta1/workload/query/labels.go in OME; `kubectl ome logs` selects on them.
const (
	InferenceServiceLabel = "ome.io/inferenceservice"
	ComponentLabel        = "component"
	ManagedByLabel        = "ome.io/managed-by"
	ManagedByOMENative    = "OMENative"
	InstanceIndexLabel    = "ome.io/instance-index"
	RevisionHashLabel     = "ome.io/revision-hash"
	// MainContainerName is the container OME runs the model server in.
	MainContainerName = "ome-container"
	// MaxLogPods bounds how many pods one log request streams.
	MaxLogPods = 20
)

// PodSelector names the pods of one InferenceService, narrowed the way `kubectl ome logs` does.
type PodSelector struct {
	Service string
	// Component is engine, decoder or router; empty selects every component.
	Component string
	// Instance is an OMENative instance index; setting it also requires OMENative-managed pods.
	Instance *int64
	// Revision is the revision hash pods carry in the ome.io/revision-hash label.
	Revision string
}

// LabelSelector renders the selector for the pod list.
func (s PodSelector) LabelSelector() string {
	set := labels.Set{InferenceServiceLabel: s.Service}
	if s.Component != "" {
		set[ComponentLabel] = s.Component
	}
	if s.Instance != nil {
		set[ManagedByLabel] = ManagedByOMENative
		set[InstanceIndexLabel] = strconv.FormatInt(*s.Instance, 10)
	}
	if s.Revision != "" {
		set[RevisionHashLabel] = s.Revision
	}
	return set.AsSelector().String()
}

// ListServicePods lists the pods matching sel, sorted by name, at most limit of them (no limit
// when limit is 0). The bool reports whether more pods matched than were returned.
func (c *Client) ListServicePods(ctx context.Context, namespace string, sel PodSelector, limit int) ([]corev1.Pod, bool, error) {
	list, err := c.Clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{LabelSelector: sel.LabelSelector()})
	if err != nil {
		return nil, false, err
	}
	pods := list.Items
	sort.Slice(pods, func(i, j int) bool { return pods[i].Name < pods[j].Name })
	if limit > 0 && len(pods) > limit {
		return pods[:limit], true, nil
	}
	return pods, false, nil
}

// StreamPodLogs opens the log stream of one container. Cancelling ctx ends the stream.
func (c *Client) StreamPodLogs(ctx context.Context, namespace, pod string, opts *corev1.PodLogOptions) (io.ReadCloser, error) {
	return c.Clientset.CoreV1().Pods(namespace).GetLogs(pod, opts).Stream(ctx)
}

// ListObjectEvents returns the Kubernetes events recorded for one object in a namespace.
func (c *Client) ListObjectEvents(ctx context.Context, namespace, kind, name string) (*corev1.EventList, error) {
	return c.Clientset.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		FieldSelector: "involvedObject.kind=" + kind + ",involvedObject.name=" + name,
	})
}
