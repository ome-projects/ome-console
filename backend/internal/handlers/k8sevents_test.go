package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"go.uber.org/zap/zaptest"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

func TestObjectEvents_ListsNewestFirst(t *testing.T) {
	client, _ := newStartedClient(t, nil)
	cs := client.Clientset.(*k8sfake.Clientset)

	base := time.Date(2026, 10, 26, 12, 0, 0, 0, time.UTC)
	var gotSelector string
	cs.PrependReactor("list", "events", func(action k8stesting.Action) (bool, runtime.Object, error) {
		gotSelector = action.(k8stesting.ListAction).GetListRestrictions().Fields.String()
		return true, &corev1.EventList{Items: []corev1.Event{
			{
				Type: "Warning", Reason: "Unschedulable", Message: "older, legacy fields",
				FirstTimestamp: metav1.NewTime(base), LastTimestamp: metav1.NewTime(base.Add(time.Minute)),
				Count: 2, Source: corev1.EventSource{Component: "default-scheduler"},
			},
			{
				Type: "Normal", Reason: "Created", Message: "newer, events.k8s.io fields",
				EventTime:           metav1.NewMicroTime(base.Add(2 * time.Minute)),
				Series:              &corev1.EventSeries{Count: 3, LastObservedTime: metav1.NewMicroTime(base.Add(5 * time.Minute))},
				ReportingController: "ome-controller",
			},
			{
				// Same second as the previous event's last observation, 400ms later: it must
				// come first although the formatted timestamps are equal.
				Type: "Normal", Reason: "Scheduled", Message: "newest, within the same second",
				EventTime:           metav1.NewMicroTime(base.Add(5*time.Minute + 400*time.Millisecond)),
				ReportingController: "default-scheduler",
			},
		}}, nil
	})

	router, v1 := newRouter()
	v1.GET("/namespaces/:namespace/events", NewObjectEventsHandler(client, zaptest.NewLogger(t)).List)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/namespaces/team-a/events?kind=InferenceService&name=llama", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	if want := "involvedObject.kind=InferenceService,involvedObject.name=llama"; gotSelector != want {
		t.Fatalf("field selector %q, want %q", gotSelector, want)
	}

	var body struct {
		Events []ModelEvent `json:"events"`
		Total  int          `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Total != 3 || len(body.Events) != 3 {
		t.Fatalf("got %d events: %+v", body.Total, body.Events)
	}
	if body.Events[0].Reason != "Scheduled" {
		t.Fatalf("sub-second ordering lost: %+v", body.Events)
	}
	newest, older := body.Events[1], body.Events[2]
	if newest.Reason != "Created" || newest.Count != 3 || newest.Source != "ome-controller" ||
		newest.FirstTimestamp != "2026-10-26T12:02:00Z" || newest.LastTimestamp != "2026-10-26T12:05:00Z" {
		t.Fatalf("events.k8s.io style event not converted: %+v", newest)
	}
	if older.Reason != "Unschedulable" || older.Count != 2 || older.Source != "default-scheduler" ||
		older.LastTimestamp != "2026-10-26T12:01:00Z" {
		t.Fatalf("legacy event not converted: %+v", older)
	}
}

func TestObjectEvents_RequiresKindAndName(t *testing.T) {
	client, _ := newStartedClient(t, nil)
	router, v1 := newRouter()
	v1.GET("/namespaces/:namespace/events", NewObjectEventsHandler(client, zaptest.NewLogger(t)).List)

	for _, query := range []string{"", "?kind=InferenceService", "?name=llama"} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/namespaces/team-a/events"+query, nil))
		if w.Code != http.StatusBadRequest {
			t.Fatalf("query %q: status %d, want 400", query, w.Code)
		}
	}
}
