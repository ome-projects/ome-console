package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"go.uber.org/zap/zaptest"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

// columnarReplica builds an InferenceReplica whose status carries ColumnarV2 rows: n instances,
// all Ready on one revision, instance 0 with a recorded failure.
func columnarReplica(namespace, name, service string, n int) *unstructured.Unstructured {
	u := newObject("InferenceReplica", namespace, name, nil)
	u.SetLabels(map[string]string{k8s.InferenceServiceLabel: service})
	all := "0"
	if n > 1 {
		all = "0-" + itoa(n-1)
	}
	raw := `{"replicas":` + itoa(n) + `,"readyReplicas":` + itoa(n) + `,"currentRevision":"` + name + `-rev-a1b2c3d4",` +
		`"instanceStatusEncoding":"ColumnarV2","instanceStatusColumns":{"members":"` + all + `",` +
		`"phases":[{"value":"Ready","indexes":"` + all + `"}],` +
		`"runningRevisions":[{"value":"` + name + `-rev-a1b2c3d4","indexes":"` + all + `"}],` +
		`"podCounts":[{"value":1,"indexes":"` + all + `"}],"admitted":"` + all + `",` +
		`"entries":[{"index":0,"lastFailure":{"podName":"` + name + `-0","containerName":"ome-container","reason":"Error","exitCode":143,"time":"2026-03-04T05:06:07Z"}}]},` +
		`"conditions":[{"type":"Ready","status":"True","lastTransitionTime":"2026-03-04T05:06:07Z","reason":"AllInstancesReady","message":"ready"}]}`
	var status map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &status); err != nil {
		panic(err)
	}
	u.Object["status"] = status
	return u
}

func itoa(n int) string { return strconv.Itoa(n) }

func newReplicasRouter(t *testing.T, maxInstances uint64, objs ...*unstructured.Unstructured) http.Handler {
	t.Helper()
	runtimeObjs := make([]runtime.Object, 0, len(objs))
	for _, o := range objs {
		runtimeObjs = append(runtimeObjs, o)
	}
	client, _ := newStartedClient(t, []string{"inferencereplicas"}, runtimeObjs...)
	router, v1 := newRouter()
	h := NewReplicasHandler(client, zaptest.NewLogger(t), maxInstances)
	v1.GET("/namespaces/:namespace/services/:name/replicas", h.ListForService)
	v1.GET("/namespaces/:namespace/replicas/:name/instances", h.Instances)
	return router
}

type decodedReplicaJSON struct {
	Replica     map[string]interface{}   `json:"replica"`
	Encoding    string                   `json:"encoding"`
	Instances   []map[string]interface{} `json:"instances"`
	DecodeError string                   `json:"decodeError"`
}

func TestReplicas_ListForServiceDecodesColumnar(t *testing.T) {
	router := newReplicasRouter(t, 0,
		columnarReplica("team-a", "llama-engine", "llama", 3),
		columnarReplica("team-a", "llama-decoder", "llama", 2),
		columnarReplica("team-a", "mistral-engine", "mistral", 1),
	)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/namespaces/team-a/services/llama/replicas", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	var body struct {
		Items []decodedReplicaJSON `json:"items"`
		Total int                  `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Total != 2 || len(body.Items) != 2 {
		t.Fatalf("want the two llama replicas, got %+v", body)
	}
	decoder, engine := body.Items[0], body.Items[1] // sorted by name
	if n, _, _ := unstructured.NestedString(engine.Replica, "metadata", "name"); n != "llama-engine" {
		t.Fatalf("items not sorted by name: %v", n)
	}
	if engine.Encoding != "ColumnarV2" || len(engine.Instances) != 3 || len(decoder.Instances) != 2 {
		t.Fatalf("rows not expanded: engine=%s/%d decoder=%d", engine.Encoding, len(engine.Instances), len(decoder.Instances))
	}
	first := engine.Instances[0]
	if first["phase"] != "Ready" || first["runningRevision"] != "llama-engine-rev-a1b2c3d4" || first["admitted"] != true {
		t.Fatalf("row 0 = %v", first)
	}
	if lf, ok := first["lastFailure"].(map[string]interface{}); !ok || lf["exitCode"] != float64(143) {
		t.Fatalf("row 0 lastFailure = %v", first["lastFailure"])
	}
	if _, ok := engine.Instances[1]["lastFailure"]; ok {
		t.Fatalf("row 1 must not carry row 0's failure: %v", engine.Instances[1])
	}
	status := engine.Replica["status"].(map[string]interface{})
	for _, f := range []string{"instanceStatusColumns", "instanceStatusEncoding", "instanceStatuses"} {
		if _, present := status[f]; present {
			t.Fatalf("%s must be stripped from the replica object", f)
		}
	}
	if status["currentRevision"] != "llama-engine-rev-a1b2c3d4" || status["replicas"] != float64(3) {
		t.Fatalf("other status fields must stay: %v", status)
	}
}

func TestReplicas_InstancesReportsDecodeErrorsAndBound(t *testing.T) {
	broken := columnarReplica("team-a", "llama-engine", "llama", 2)
	cols := broken.Object["status"].(map[string]interface{})["instanceStatusColumns"].(map[string]interface{})
	cols["phases"] = []interface{}{} // every member needs a phase
	router := newReplicasRouter(t, 1, broken, columnarReplica("team-a", "llama-router", "llama", 2))

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/namespaces/team-a/replicas/llama-engine/instances", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	var one decodedReplicaJSON
	if err := json.Unmarshal(w.Body.Bytes(), &one); err != nil {
		t.Fatal(err)
	}
	if one.DecodeError == "" || len(one.Instances) != 0 || one.Encoding != "ColumnarV2" {
		t.Fatalf("corrupt columns must yield decodeError and no rows: %+v", one)
	}

	// Two rows under a bound of one: the codec fails closed, the endpoint reports it.
	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/namespaces/team-a/replicas/llama-router/instances", nil))
	if err := json.Unmarshal(w.Body.Bytes(), &one); err != nil {
		t.Fatal(err)
	}
	if one.DecodeError == "" || len(one.Instances) != 0 {
		t.Fatalf("over the bound must yield decodeError and no rows: %+v", one)
	}

	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/namespaces/team-a/replicas/missing/instances", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("missing replica: status %d", w.Code)
	}
}

func TestReplicas_DenseV1AndParentRef(t *testing.T) {
	dense := newObject("InferenceReplica", "team-a", "standalone", map[string]interface{}{
		"parentRef": map[string]interface{}{"name": "llama"},
	})
	dense.Object["status"] = map[string]interface{}{
		"replicas": int64(1),
		"instanceStatuses": []interface{}{
			map[string]interface{}{"index": int64(0), "phase": "Creating", "targetRevision": "standalone-rev-1"},
		},
	}
	router := newReplicasRouter(t, 0, dense)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/namespaces/team-a/services/llama/replicas", nil))
	var body struct {
		Items []decodedReplicaJSON `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 1 || body.Items[0].Encoding != "DenseV1" || len(body.Items[0].Instances) != 1 {
		t.Fatalf("parentRef replica with dense rows: %+v", body.Items)
	}
	if row := body.Items[0].Instances[0]; row["phase"] != "Creating" || row["targetRevision"] != "standalone-rev-1" {
		t.Fatalf("dense row = %v", row)
	}
}

func TestReplicas_NotServedIsCapabilityMissing(t *testing.T) {
	client, _ := newStartedClient(t, nil)
	router, v1 := newRouter()
	h := NewReplicasHandler(client, zaptest.NewLogger(t), 0)
	v1.GET("/namespaces/:namespace/services/:name/replicas", h.ListForService)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/namespaces/team-a/services/llama/replicas", nil))
	if w.Code != http.StatusNotFound || !json.Valid(w.Body.Bytes()) {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	var body apiError
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.Code != "CAPABILITY_MISSING" {
		t.Fatalf("code %q", body.Code)
	}
}

func TestBelongsToService(t *testing.T) {
	replica := func(name, label, parent string) *unstructured.Unstructured {
		u := newObject("InferenceReplica", "team-a", name, nil)
		if label != "" {
			u.SetLabels(map[string]string{k8s.InferenceServiceLabel: label})
		}
		if parent != "" {
			_ = unstructured.SetNestedField(u.Object, parent, "spec", "parentRef", "name")
		}
		return u
	}
	for _, tc := range []struct {
		name  string
		u     *unstructured.Unstructured
		match bool
	}{
		{"labelled", replica("any", "llama", ""), true},
		{"parentRef", replica("any", "", "llama"), true},
		{"projected name without label or parentRef", replica("llama-engine", "", ""), true},
		{"other name without label or parentRef", replica("llama-proxy", "", ""), false},
		{"projected name labelled for another service", replica("llama-engine", "mistral", ""), false},
		{"projected name owned by another service", replica("llama-decoder", "", "mistral"), false},
	} {
		if got := belongsToService(tc.u, "llama"); got != tc.match {
			t.Errorf("%s: belongsToService = %v, want %v", tc.name, got, tc.match)
		}
	}
}
