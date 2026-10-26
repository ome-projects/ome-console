package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap/zaptest"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"sigs.k8s.io/ome/ome-console/backend/internal/k8s"
)

func TestRuntimesHandler_RecommendationWithoutMatchIsNotFound(t *testing.T) {
	client, _ := newStartedClient(t, served)
	router, v1 := newRouter()
	v1.GET("/runtimes/recommend", NewRuntimesHandler(client, zaptest.NewLogger(t)).GetRecommendation)

	expectError(t, do(t, router, http.MethodGet, "/api/v1/runtimes/recommend?format=safetensors", nil, ""),
		http.StatusNotFound, "NOT_FOUND")
}

// llamaEntry is a supportedModelFormats entry that matches the llama model of the fixtures.
// Numbers are int64, as the API server's objects carry them.
func llamaEntry(autoSelect bool, priority, formatWeight int64) map[string]interface{} {
	return map[string]interface{}{
		"modelFormat":       map[string]interface{}{"name": "safetensors", "version": "1.0.0", "weight": formatWeight},
		"modelFramework":    map[string]interface{}{"name": "transformers", "version": "4.45.0.dev0", "weight": int64(1)},
		"modelArchitecture": "LlamaForCausalLM",
		"autoSelect":        autoSelect,
		"priority":          priority,
	}
}

func runtimeSpec(entries ...map[string]interface{}) map[string]interface{} {
	list := make([]interface{}, 0, len(entries))
	for _, e := range entries {
		list = append(list, e)
	}
	return map[string]interface{}{"supportedModelFormats": list}
}

func withSizeRange(spec map[string]interface{}, minSize, maxSize string) map[string]interface{} {
	spec["modelSizeRange"] = map[string]interface{}{"min": minSize, "max": maxSize}
	return spec
}

// llamaSpec is the BaseModel llama-3-2-3b-instruct of the OME docs.
func llamaSpec() map[string]interface{} {
	return map[string]interface{}{
		"modelFormat":        map[string]interface{}{"name": "safetensors", "version": "1.0.0"},
		"modelFramework":     map[string]interface{}{"name": "transformers", "version": "4.45.0.dev0"},
		"modelArchitecture":  "LlamaForCausalLM",
		"modelParameterSize": "3.21B",
	}
}

// selectionFixtures is the cluster of the worked example in the OME scoring docs, the model as a
// BaseModel in llama-demo and as a ClusterBaseModel, and runtimes that selection excludes or
// treats specially.
func selectionFixtures() []runtime.Object {
	multinode := newObject("ClusterServingRuntime", "", "srt-llama-multinode", runtimeSpec(llamaEntry(true, 2, 1)))
	multinode.Object["spec"].(map[string]interface{})["engineConfig"] = map[string]interface{}{
		"annotations": map[string]interface{}{"ome.io/deploymentMode": "MultiNode"},
	}
	hopper := newObject("ClusterServingRuntime", "", "hopper-llama", runtimeSpec(llamaEntry(true, 1, 1)))
	hopper.Object["spec"].(map[string]interface{})["acceleratorRequirements"] = map[string]interface{}{
		"acceleratorClasses": []interface{}{"nvidia-h100", "nvidia-h200"},
	}
	disabled := newObject("ClusterServingRuntime", "", "disabled-llama", runtimeSpec(llamaEntry(true, 9, 1)))
	disabled.Object["spec"].(map[string]interface{})["disabled"] = true

	profile := newObject("ClusterServingRuntime", "", "sglang-profile", runtimeSpec(llamaEntry(false, 1, 1)))
	profile.Object["spec"].(map[string]interface{})["disabled"] = true
	child := newObject("ClusterServingRuntime", "", "llama-child", map[string]interface{}{"disabled": false})
	child.SetAnnotations(map[string]string{"ome.io/inherit-from": "sglang-profile"})
	namespacedChild := newObject("ServingRuntime", "llama-demo", "team-child", map[string]interface{}{"disabled": false})
	namespacedChild.SetAnnotations(map[string]string{"ome.io/inherit-from": "sglang-profile"})
	orphan := newObject("ClusterServingRuntime", "", "orphan", map[string]interface{}{})
	orphan.SetAnnotations(map[string]string{"ome.io/inherit-from": "gone"})

	return []runtime.Object{
		newObject("BaseModel", "llama-demo", "llama-3-2-3b-instruct", llamaSpec()),
		newObject("ClusterBaseModel", "", "llama-3-2-3b-instruct", llamaSpec()),
		newObject("ServingRuntime", "llama-demo", "team-llama", runtimeSpec(llamaEntry(true, 1, 1))),
		newObject("ClusterServingRuntime", "", "vllm-llama", runtimeSpec(llamaEntry(true, 2, 2))),
		newObject("ClusterServingRuntime", "", "srt-llama-small", withSizeRange(runtimeSpec(llamaEntry(true, 3, 1)), "1B", "8B")),
		newObject("ClusterServingRuntime", "", "srt-llama-large", withSizeRange(runtimeSpec(llamaEntry(true, 3, 1)), "1B", "70B")),
		newObject("ClusterServingRuntime", "", "srt-llama-3-2-1b-instruct", withSizeRange(runtimeSpec(llamaEntry(false, 1, 1)), "500M", "2B")),
		multinode, hopper, disabled, profile, child, namespacedChild, orphan,
	}
}

func runtimesRouter(t *testing.T, objs ...runtime.Object) *gin.Engine {
	t.Helper()
	client, _ := newStartedClient(t, served, objs...)
	router, v1 := newRouter()
	h := NewRuntimesHandler(client, zaptest.NewLogger(t))
	v1.GET("/runtimes/compatible", h.FindCompatibleRuntimes)
	v1.GET("/runtimes/recommend", h.GetRecommendation)
	v1.POST("/runtimes/explain", h.Explain)
	v1.POST("/runtimes/validate", h.ValidateConfiguration)
	v1.GET("/runtimes/:name/compatibility", h.CheckCompatibility)
	return router
}

func mustJSON(t *testing.T, v interface{}) string {
	t.Helper()
	out, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(out)
}

// items decodes a 200 response whose body carries a list under key.
func items(t *testing.T, rec *httptest.ResponseRecorder, key string) []map[string]interface{} {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("%d: %s", rec.Code, rec.Body.String())
	}
	raw, ok := decode(t, rec)[key].([]interface{})
	if !ok {
		t.Fatalf("no %s list in %s", key, rec.Body.String())
	}
	out := make([]map[string]interface{}, len(raw))
	for i, item := range raw {
		out[i] = item.(map[string]interface{})
	}
	return out
}

func candidateNames(candidates []map[string]interface{}) []string {
	names := make([]string, len(candidates))
	for i, c := range candidates {
		names[i] = c["runtime"].(map[string]interface{})["name"].(string)
	}
	return names
}

func matchNames(matches []map[string]interface{}) []string {
	names := make([]string, len(matches))
	for i, m := range matches {
		names[i] = m["runtime"].(map[string]interface{})["metadata"].(map[string]interface{})["name"].(string)
	}
	return names
}

func expectNames(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestRuntimesHandler_Explain(t *testing.T) {
	router := runtimesRouter(t, selectionFixtures()...)
	explain := func(body string) *httptest.ResponseRecorder {
		return do(t, router, http.MethodPost, "/api/v1/runtimes/explain", []byte(body), "application/json")
	}
	byName := func(candidates []map[string]interface{}, name string) map[string]interface{} {
		for _, c := range candidates {
			if c["runtime"].(map[string]interface{})["name"] == name {
				return c
			}
		}
		t.Fatalf("no candidate %s", name)
		return nil
	}
	ranking := []string{
		"team-llama", "vllm-llama", "srt-llama-small", "srt-llama-large", "srt-llama-multinode", "hopper-llama",
		"team-child", "disabled-llama", "llama-child", "orphan", "sglang-profile", "srt-llama-3-2-1b-instruct",
	}

	t.Run("ranks the worked example for a model spec", func(t *testing.T) {
		got := items(t, explain(`{"namespace":"llama-demo","model":`+mustJSON(t, llamaSpec())+`}`), "items")
		expectNames(t, candidateNames(got), ranking)
		first := got[0]
		ref := first["runtime"].(map[string]interface{})
		if ref["kind"] != "ServingRuntime" || ref["namespace"] != "llama-demo" {
			t.Fatalf("unexpected first runtime %v", ref)
		}
		if first["compatible"] != true || first["autoSelect"] != true || first["score"].(float64) != 2 || first["exclusion"] != nil {
			t.Fatalf("unexpected first candidate %v", first)
		}
		if reasons := first["reasons"].([]interface{}); len(reasons) != 2 || reasons[1] != "score 2 = (1 + 1) * 1 from supportedModelFormats[0]" {
			t.Fatalf("unexpected reasons %v", reasons)
		}
		if c := byName(got, "vllm-llama"); c["score"].(float64) != 6 {
			t.Fatalf("vllm-llama should score 6: %v", c)
		}
		if c := byName(got, "srt-llama-3-2-1b-instruct"); c["compatible"] != false || c["exclusion"] != "model size 3.21B is outside supported range [500M, 2B]" {
			t.Fatalf("unexpected candidate %v", c)
		}
		if c := byName(got, "disabled-llama"); c["exclusion"] != "runtime is disabled" {
			t.Fatalf("unexpected candidate %v", c)
		}
		// Auto-selection reads the child's own spec, which inherits nothing.
		if c := byName(got, "llama-child"); c["exclusion"] != "model format 'mt:safetensors:1.0.0:LlamaForCausalLM:transformers:4.45.0.dev0' not in supported formats: no supported formats defined" {
			t.Fatalf("unexpected candidate %v", c)
		}
	})
	t.Run("without a namespace only cluster runtimes count", func(t *testing.T) {
		got := items(t, explain(`{"model":`+mustJSON(t, llamaSpec())+`}`), "items")
		expectNames(t, candidateNames(got), []string{
			"vllm-llama", "srt-llama-small", "srt-llama-large", "srt-llama-multinode", "hopper-llama",
			"disabled-llama", "llama-child", "orphan", "sglang-profile", "srt-llama-3-2-1b-instruct",
		})
	})
	t.Run("takes the model by name", func(t *testing.T) {
		got := items(t, explain(`{"namespace":"llama-demo","model":{"name":"llama-3-2-3b-instruct","kind":"BaseModel"}}`), "items")
		expectNames(t, candidateNames(got), ranking)
		got = items(t, explain(`{"namespace":"llama-demo","model":{"name":"llama-3-2-3b-instruct"}}`), "items")
		expectNames(t, candidateNames(got), ranking)
		got = items(t, explain(`{"model":{"name":"llama-3-2-3b-instruct","kind":"ClusterBaseModel"}}`), "items")
		if candidateNames(got)[0] != "vllm-llama" {
			t.Fatalf("unexpected ranking %v", candidateNames(got))
		}
	})
	t.Run("a missing model is a 404", func(t *testing.T) {
		expectError(t, explain(`{"model":{"name":"missing"}}`), http.StatusNotFound, "NOT_FOUND")
		expectError(t, explain(`{"namespace":"llama-demo","model":{"name":"missing","kind":"BaseModel"}}`), http.StatusNotFound, "NOT_FOUND")
	})
	t.Run("a bad request is a 400", func(t *testing.T) {
		for _, body := range []string{
			`not json`,
			`{"namespace":"llama-demo"}`,
			`{"model":{}}`,
			`{"model":{"modelFormat":{}}}`,
			`{"model":{"name":"llama-3-2-3b-instruct","kind":"BaseModel"}}`,
			`{"model":{"name":"llama-3-2-3b-instruct","kind":"InferenceService"}}`,
			`{"model":` + mustJSON(t, llamaSpec()) + `,"deploymentMode":"Bogus"}`,
		} {
			expectError(t, explain(body), http.StatusBadRequest, "BAD_REQUEST")
		}
	})
	t.Run("applies the deployment mode", func(t *testing.T) {
		got := items(t, explain(`{"namespace":"llama-demo","model":`+mustJSON(t, llamaSpec())+`,"deploymentMode":"OMENative"}`), "items")
		if candidateNames(got)[0] != "team-llama" {
			t.Fatalf("unexpected ranking %v", candidateNames(got))
		}
		c := byName(got, "srt-llama-multinode")
		if c["compatible"] != false || c["exclusion"] != "runtime engine deployment mode MultiNode does not match requested engine deployment mode OMENative" {
			t.Fatalf("unexpected candidate %v", c)
		}
	})
	t.Run("applies the accelerator classes", func(t *testing.T) {
		got := items(t, explain(`{"namespace":"llama-demo","model":`+mustJSON(t, llamaSpec())+`,"acceleratorClasses":["nvidia-h100"]}`), "items")
		if names := candidateNames(got); names[0] != "hopper-llama" || got[0]["autoSelect"] != true {
			t.Fatalf("unexpected ranking %v", names)
		}
		if c := byName(got, "team-llama"); c["exclusion"] != "runtime does not support the required accelerator class" {
			t.Fatalf("unexpected candidate %v", c)
		}
		got = items(t, explain(`{"model":`+mustJSON(t, llamaSpec())+`,"acceleratorClasses":["nvidia-a100"]}`), "items")
		for _, c := range got {
			if c["compatible"] != false {
				t.Fatalf("nothing lists nvidia-a100: %v", c)
			}
		}
	})
}

func TestRuntimesHandler_LegacyEndpoints(t *testing.T) {
	router := runtimesRouter(t, selectionFixtures()...)
	get := func(path string) *httptest.ResponseRecorder { return do(t, router, http.MethodGet, path, nil, "") }

	t.Run("compatible matches on names and keeps the response shape", func(t *testing.T) {
		rec := get("/api/v1/runtimes/compatible?format=safetensors&framework=transformers")
		matches := items(t, rec, "matches")
		// Without a size the ranges do not break ties, so the three runtimes that score 6 come
		// by name. The child runtimes inherit nothing for auto-selection.
		expectNames(t, matchNames(matches), []string{
			"srt-llama-large", "srt-llama-small", "vllm-llama", "srt-llama-multinode", "hopper-llama", "srt-llama-3-2-1b-instruct",
		})
		if decode(t, rec)["total"].(float64) != 6 {
			t.Fatalf("unexpected total in %s", rec.Body.String())
		}
		best := matches[0]
		if best["score"].(float64) != 6 || best["recommendation"] == "" || len(best["reasons"].([]interface{})) == 0 || best["warnings"] != nil {
			t.Fatalf("unexpected best match %v", best)
		}
		if _, hasKind := best["runtime"].(map[string]interface{})["kind"]; !hasKind {
			t.Fatalf("the match must carry the whole runtime object: %v", best["runtime"])
		}
		namedOnly := matches[5]
		if namedOnly["score"].(float64) != 0 || len(namedOnly["warnings"].([]interface{})) != 1 {
			t.Fatalf("a runtime without autoSelect is compatible but warned about: %v", namedOnly)
		}
	})
	t.Run("compatible without a framework matches the format alone", func(t *testing.T) {
		if got := items(t, get("/api/v1/runtimes/compatible?format=safetensors"), "matches"); len(got) != 6 {
			t.Fatalf("unexpected matches %v", matchNames(got))
		}
		if got := items(t, get("/api/v1/runtimes/compatible?format=SafeTensors"), "matches"); len(got) != 0 {
			t.Fatalf("names are case-sensitive: %v", matchNames(got))
		}
		if got := items(t, get("/api/v1/runtimes/compatible?format=safetensors&framework=diffusers"), "matches"); len(got) != 0 {
			t.Fatalf("the framework name must match: %v", matchNames(got))
		}
		expectError(t, get("/api/v1/runtimes/compatible"), http.StatusBadRequest, "BAD_REQUEST")
	})
	t.Run("recommend answers the first auto-selectable match", func(t *testing.T) {
		rec := get("/api/v1/runtimes/recommend?format=safetensors&framework=transformers")
		if rec.Code != http.StatusOK {
			t.Fatalf("%d: %s", rec.Code, rec.Body.String())
		}
		body := decode(t, rec)
		if matchNames([]map[string]interface{}{body})[0] != "srt-llama-large" || body["recommendation"] != "Best match: the runtime OME would auto-select for the model" {
			t.Fatalf("unexpected recommendation %v", body)
		}
		expectError(t, get("/api/v1/runtimes/recommend?format=gguf"), http.StatusNotFound, "NOT_FOUND")
		expectError(t, get("/api/v1/runtimes/recommend"), http.StatusBadRequest, "BAD_REQUEST")
	})
	t.Run("compatibility checks a named runtime with its inherited spec", func(t *testing.T) {
		check := func(path string) map[string]interface{} {
			rec := get(path)
			if rec.Code != http.StatusOK {
				t.Fatalf("%d: %s", rec.Code, rec.Body.String())
			}
			return decode(t, rec)
		}
		body := check("/api/v1/runtimes/vllm-llama/compatibility?format=safetensors&framework=transformers")
		if body["compatible"] != true || body["score"].(float64) != 6 || body["warnings"] != nil {
			t.Fatalf("unexpected check %v", body)
		}
		body = check("/api/v1/runtimes/disabled-llama/compatibility?format=safetensors")
		if body["compatible"] != false || body["score"].(float64) != 0 || body["warnings"].([]interface{})[0] != "runtime is disabled" {
			t.Fatalf("unexpected check %v", body)
		}
		// The child inherits the profile's entries and overrides its disabled: true.
		body = check("/api/v1/runtimes/llama-child/compatibility?format=safetensors")
		if body["compatible"] != true || body["score"].(float64) != 0 {
			t.Fatalf("unexpected check %v", body)
		}
		body = check("/api/v1/runtimes/sglang-profile/compatibility?format=safetensors")
		if body["compatible"] != false {
			t.Fatalf("the profile itself is disabled: %v", body)
		}
		// A ServingRuntime's parent is found among the ClusterServingRuntimes.
		body = check("/api/v1/runtimes/team-child/compatibility?format=safetensors&namespace=llama-demo")
		if body["compatible"] != true {
			t.Fatalf("unexpected check %v", body)
		}
		body = check("/api/v1/runtimes/orphan/compatibility?format=safetensors")
		if body["compatible"] != false || len(body["warnings"].([]interface{})) != 1 {
			t.Fatalf("a broken chain makes the runtime unusable: %v", body)
		}
		expectError(t, get("/api/v1/runtimes/missing/compatibility?format=safetensors"), http.StatusNotFound, "NOT_FOUND")
		expectError(t, get("/api/v1/runtimes/team-child/compatibility?format=safetensors"), http.StatusNotFound, "NOT_FOUND")
		expectError(t, get("/api/v1/runtimes/vllm-llama/compatibility"), http.StatusBadRequest, "BAD_REQUEST")
	})
}

func TestRuntimesHandler_ValidateConfiguration(t *testing.T) {
	router := runtimesRouter(t)
	validate := func(body interface{}) map[string]interface{} {
		rec := do(t, router, http.MethodPost, "/api/v1/runtimes/validate", []byte(mustJSON(t, body)), "application/json")
		if rec.Code != http.StatusOK {
			t.Fatalf("%d: %s", rec.Code, rec.Body.String())
		}
		return decode(t, rec)
	}
	good := validate(map[string]interface{}{"spec": withSizeRange(runtimeSpec(llamaEntry(false, 1, 1)), "2B", "4B")})
	if good["valid"] != true || len(good["errors"].([]interface{})) != 0 || len(good["warnings"].([]interface{})) != 1 {
		t.Fatalf("unexpected result %v", good)
	}
	bad := validate(map[string]interface{}{"spec": map[string]interface{}{
		"supportedModelFormats": []interface{}{map[string]interface{}{"modelFormat": map[string]interface{}{"name": "safetensors"}, "priority": 0}},
		"modelSizeRange":        map[string]interface{}{"max": "4b"},
	}})
	errs := bad["errors"].([]interface{})
	if bad["valid"] != false || len(errs) != 2 || errs[0] != "supportedModelFormats[0]: modelFramework.name is required" {
		t.Fatalf("unexpected result %v", bad)
	}
	if warnings := bad["warnings"].([]interface{}); len(warnings) != 2 {
		t.Fatalf("expected the autoSelect and the size warnings, got %v", warnings)
	}
	if noSpec := validate(map[string]interface{}{"metadata": map[string]interface{}{"name": "x"}}); noSpec["valid"] != false || noSpec["errors"].([]interface{})[0] != "spec is required" {
		t.Fatalf("unexpected result %v", noSpec)
	}
	expectError(t, do(t, router, http.MethodPost, "/api/v1/runtimes/validate", []byte(`not json`), "application/json"),
		http.StatusBadRequest, "BAD_REQUEST")
}

// recordingDynamic wraps the fake dynamic client to observe the write options a handler sends,
// which the fake drops, and to answer a dry run without storing anything, as the API server does.
type recordingDynamic struct {
	dynamic.Interface
	dryRuns *[]bool
}

func (r recordingDynamic) Resource(gvr schema.GroupVersionResource) dynamic.NamespaceableResourceInterface {
	return recordingResource{NamespaceableResourceInterface: r.Interface.Resource(gvr), dryRuns: r.dryRuns}
}

type recordingResource struct {
	dynamic.NamespaceableResourceInterface
	dryRuns *[]bool
}

func (r recordingResource) Create(ctx context.Context, obj *unstructured.Unstructured, opts metav1.CreateOptions, subresources ...string) (*unstructured.Unstructured, error) {
	dryRun := len(opts.DryRun) > 0
	*r.dryRuns = append(*r.dryRuns, dryRun)
	if dryRun {
		return obj, nil
	}
	return r.NamespaceableResourceInterface.Create(ctx, obj, opts, subresources...)
}

func (r recordingResource) Update(ctx context.Context, obj *unstructured.Unstructured, opts metav1.UpdateOptions, subresources ...string) (*unstructured.Unstructured, error) {
	dryRun := len(opts.DryRun) > 0
	*r.dryRuns = append(*r.dryRuns, dryRun)
	if dryRun {
		return obj, nil
	}
	return r.NamespaceableResourceInterface.Update(ctx, obj, opts, subresources...)
}

// The cluster-scoped runtime writes honour ?dryRun= like the generic resource routes: the
// option reaches the API server, a dry run stores nothing, and an invalid value never writes.
func TestRuntimesHandler_WritesHonourDryRun(t *testing.T) {
	client, dynamicClient := newStartedClient(t, served)
	var dryRuns []bool
	client.DynamicClient = recordingDynamic{Interface: dynamicClient, dryRuns: &dryRuns}

	router, v1 := newRouter()
	handler := NewRuntimesHandler(client, zaptest.NewLogger(t))
	v1.POST("/runtimes", handler.Create)
	v1.PUT("/runtimes/:name", handler.Update)

	gvr := k8s.ClusterServingRuntimeResource.GVR()
	body := []byte(`{"metadata":{"name":"vllm"},"spec":{"supportedModelFormats":[{"modelFormat":{"name":"safetensors"},"modelFramework":{"name":"transformers"}}]}}`)

	rec := do(t, router, http.MethodPost, "/api/v1/runtimes?dryRun=true", body, "application/json")
	if rec.Code != http.StatusCreated {
		t.Fatalf("dry-run create: %d %s", rec.Code, rec.Body.String())
	}
	created := decode(t, rec)
	if created["apiVersion"] != k8s.OMEGroupVersion || created["kind"] != "ClusterServingRuntime" {
		t.Fatalf("apiVersion/kind not stamped: %v", created)
	}
	if _, err := dynamicClient.Tracker().Get(gvr, "", "vllm"); err == nil {
		t.Fatal("dry-run create persisted the runtime")
	}

	rec = do(t, router, http.MethodPost, "/api/v1/runtimes", body, "application/json")
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body.String())
	}
	if _, err := dynamicClient.Tracker().Get(gvr, "", "vllm"); err != nil {
		t.Fatalf("create did not persist the runtime: %v", err)
	}

	rec = do(t, router, http.MethodPut, "/api/v1/runtimes/vllm?dryRun=true", body, "application/json")
	if rec.Code != http.StatusOK {
		t.Fatalf("dry-run update: %d %s", rec.Code, rec.Body.String())
	}

	expectError(t, do(t, router, http.MethodPost, "/api/v1/runtimes?dryRun=1", body, "application/json"),
		http.StatusBadRequest, "BAD_REQUEST")
	expectError(t, do(t, router, http.MethodPut, "/api/v1/runtimes/vllm?dryRun=True", body, "application/json"),
		http.StatusBadRequest, "BAD_REQUEST")
	expectError(t, do(t, router, http.MethodPost, "/api/v1/runtimes",
		[]byte(`{"metadata":{"name":"vllm","namespace":"team-a"},"spec":{}}`), "application/json"),
		http.StatusBadRequest, "BAD_REQUEST")

	if want := []bool{true, false, true}; !reflect.DeepEqual(dryRuns, want) {
		t.Fatalf("dry runs sent to the API server: got %v, want %v", dryRuns, want)
	}
}
