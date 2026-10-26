package runtimeselect

import (
	"fmt"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// MaxInheritanceDepth is the longest inherit-from chain OME resolves, the runtime included.
const MaxInheritanceDepth = 5

// Lookup finds a runtime object for Resolve. kind is KindServingRuntime, with its namespace, or
// KindClusterServingRuntime. found is false when no such runtime exists; any other failure is an
// error.
type Lookup func(kind, namespace, name string) (obj *unstructured.Unstructured, found bool, err error)

// Resolve returns a copy of the runtime object whose spec is the one OME uses when an
// InferenceService names the runtime: the specs of its ome.io/inherit-from chain laid over one
// another from the root down, the runtime's own spec last. A ServingRuntime's parent is looked
// up in its namespace first, then among the ClusterServingRuntimes; a ClusterServingRuntime's
// parent is a ClusterServingRuntime. The chain comes back root first. A missing parent, a cycle
// and a chain longer than MaxInheritanceDepth are errors, as they are for OME.
//
// Objects merge field by field with the child's value winning, lists are replaced by the child's
// and a null in the child keeps the parent's value. That is how OME merges every field selection
// reads; the by-name merge OME applies to pod fields such as env and ports is not reproduced.
func Resolve(u *unstructured.Unstructured, lookup Lookup) (*unstructured.Unstructured, []string, error) {
	kind, namespace := u.GetKind(), u.GetNamespace()
	if kind == "" {
		kind = KindClusterServingRuntime
		if namespace != "" {
			kind = KindServingRuntime
		}
	}
	chain := []*unstructured.Unstructured{u}
	names := []string{u.GetName()}
	visited := map[string]bool{u.GetName(): true}
	for current := u; ; {
		parentName := current.GetAnnotations()[AnnotationInheritFrom]
		if parentName == "" {
			break
		}
		if len(chain) >= MaxInheritanceDepth {
			return nil, nil, fmt.Errorf("inheritance chain exceeds max depth %d (chain: %v)", MaxInheritanceDepth, names)
		}
		if visited[parentName] {
			return nil, nil, fmt.Errorf("inheritance cycle detected: %v", append(names, parentName))
		}
		parent, err := findParent(lookup, kind, namespace, parentName)
		if err != nil {
			return nil, nil, err
		}
		if parent == nil {
			return nil, nil, fmt.Errorf("inherit-from parent %q not found (chain so far: %v)", parentName, names)
		}
		visited[parentName] = true
		chain = append(chain, parent)
		names = append(names, parentName)
		current = parent
	}

	merged := nestedMap(chain[len(chain)-1].Object, "spec")
	for i := len(chain) - 2; i >= 0; i-- {
		merged = merge(merged, nestedMap(chain[i].Object, "spec"))
	}
	if merged == nil {
		merged = map[string]any{}
	}
	out := u.DeepCopy()
	if err := unstructured.SetNestedMap(out.Object, merged, "spec"); err != nil {
		return nil, nil, err
	}
	rootFirst := make([]string, len(names))
	for i, name := range names {
		rootFirst[len(names)-1-i] = name
	}
	return out, rootFirst, nil
}

// findParent looks the parent up in the scopes a runtime of the given kind inherits from. It
// returns nil when the parent exists in none of them.
func findParent(lookup Lookup, kind, namespace, name string) (*unstructured.Unstructured, error) {
	if kind == KindServingRuntime {
		parent, found, err := lookup(KindServingRuntime, namespace, name)
		if err != nil || found {
			return parent, err
		}
	}
	parent, found, err := lookup(KindClusterServingRuntime, "", name)
	if err != nil || !found {
		return nil, err
	}
	return parent, nil
}

// merge lays child over parent: maps merge field by field with the child's values winning, any
// other value is replaced by the child's, and a nil in the child leaves the parent's value. Both
// arguments are read only.
func merge(parent, child map[string]any) map[string]any {
	out := make(map[string]any, len(parent)+len(child))
	for k, v := range parent {
		out[k] = v
	}
	for k, v := range child {
		if v == nil {
			continue
		}
		if childMap, ok := v.(map[string]any); ok {
			if parentMap, ok := out[k].(map[string]any); ok {
				out[k] = merge(parentMap, childMap)
				continue
			}
		}
		out[k] = v
	}
	return out
}
