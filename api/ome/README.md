# OME API snapshot

A pinned copy of the [OME](https://github.com/ome-projects/ome) API contract the
console is built against. The console takes no Go dependency on OME; everything it
needs to know about the `ome.io/v1beta1` resources is vendored here so TypeScript
types can be generated from it.

The console targets the **unreleased OME v1.3 API**, so the snapshot tracks a
commit on OME's `main` branch rather than a release tag.

| File            | Contents                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OME_VERSION`   | Line 1: the full sha of the OME commit the snapshot was taken from. Line 2: `synced <date> from ome-projects/ome`.                                                                                       |
| `swagger.json`  | Verbatim copy of OME's `pkg/openapi/swagger.json` (Swagger 2.0): the type definitions of every OME API object. Kept byte-identical and pretty-printed as upstream so diffs on a bump stay readable.    |
| `crd-meta.json` | What the swagger cannot express, extracted from OME's `config/crd/full/ome.io_*.yaml` by `frontend/scripts/extract-crd-meta.mjs`: per kind, the enums, required lists, defaults, int-or-string fields, CEL rules, printer columns, names, scope and subresources. The script's header documents the path conventions. |

The full CRD YAMLs (about 5 MB) are intentionally not vendored: `crd-meta.json`
carries the parts of them the console needs at a fraction of the size.

## Bumping the snapshot

```bash
make sync-ome-api OME_REF=<sha> OME_SRC=~/go/src/ome   # from a local OME checkout
make sync-ome-api OME_REF=<sha|tag|branch>              # or download from GitHub
make sync-ome-api                                       # re-generate the pinned snapshot (must be a no-op)
```

The script resolves the ref to a commit, copies `swagger.json`, re-runs the
extractor and rewrites `OME_VERSION`. Review the printed diff stat, then commit
`api/ome/` together with the regenerated TypeScript types once the generator
exists, so the vendored contract and the code that depends on it move in one
change. `OME_REF` may be a tag or branch, but pin a full commit sha in the commit
you send for review.
