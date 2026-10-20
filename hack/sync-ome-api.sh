#!/usr/bin/env bash
#
# Re-sync the vendored OME API snapshot in api/ome/ from an OME commit.
#
# Usage: OME_REF=<sha|tag|branch> [OME_SRC=/path/to/ome/checkout] hack/sync-ome-api.sh
#
# Produces api/ome/swagger.json (verbatim pkg/openapi/swagger.json),
# api/ome/crd-meta.json (extracted from config/crd/full by
# frontend/scripts/extract-crd-meta.mjs) and api/ome/OME_VERSION.
set -euo pipefail

OME_REPO_URL=https://github.com/ome-projects/ome

usage() {
  cat <<'EOF'
Usage: OME_REF=<sha|tag|branch> [OME_SRC=/path/to/ome/checkout] hack/sync-ome-api.sh

Re-syncs the vendored OME API snapshot in api/ome/ (swagger.json, crd-meta.json,
OME_VERSION) and prints the resulting diff stat.

  OME_REF  ome-projects/ome ref to sync from. Defaults to the sha on line 1 of
           api/ome/OME_VERSION, so a bare run re-generates the pinned snapshot.
  OME_SRC  local OME git checkout to read from. Without it the ref is resolved
           with `git ls-remote` and a source tarball is downloaded from GitHub.
EOF
}

die() {
  echo "sync-ome-api: $*" >&2
  exit 1
}

case "${1:-}" in
  -h | --help) usage; exit 0 ;;
  '') ;;
  *) usage >&2; exit 2 ;;
esac

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
api_dir=$repo_root/api/ome
extractor=$repo_root/frontend/scripts/extract-crd-meta.mjs
ome_src=${OME_SRC:-}
ome_src=${ome_src/#\~/$HOME} # zsh passes `OME_SRC=~/ome` through unexpanded
ome_ref=${OME_REF:-}
if [[ -z $ome_ref ]]; then
  [[ -f $api_dir/OME_VERSION ]] || die "OME_REF is not set and $api_dir/OME_VERSION does not exist"
  ome_ref=$(head -n 1 "$api_dir/OME_VERSION")
fi

command -v node >/dev/null || die "node is required"
[[ -d $repo_root/frontend/node_modules/js-yaml ]] ||
  die "frontend/node_modules is missing; run 'make install-frontend' first"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if [[ -n $ome_src ]]; then
  sha=$(git -C "$ome_src" rev-parse --verify -q "$ome_ref^{commit}") ||
    die "ref '$ome_ref' not found in $ome_src (try: git -C $ome_src fetch)"
  echo "Reading OME $sha from $ome_src"
  git -C "$ome_src" show "$sha:pkg/openapi/swagger.json" >"$tmp/swagger.json"
  git -C "$ome_src" archive "$sha" config/crd/full | tar -x -C "$tmp"
  crd_dir=$tmp/config/crd/full
else
  if [[ $ome_ref =~ ^[0-9a-f]{40}$ ]]; then
    sha=$ome_ref
  else
    # For an annotated tag ls-remote prints the tag object first and the
    # peeled commit (^{}) last, so the last line is always the commit.
    sha=$(git ls-remote "$OME_REPO_URL.git" "$ome_ref" | awk 'END { print $1 }')
    [[ -n $sha ]] || die "ref '$ome_ref' not found in $OME_REPO_URL (use a tag, branch or full sha)"
  fi
  echo "Downloading OME $sha from $OME_REPO_URL"
  curl -fsSL "$OME_REPO_URL/archive/$sha.tar.gz" -o "$tmp/ome.tar.gz"
  tar -xzf "$tmp/ome.tar.gz" -C "$tmp" "ome-$sha/pkg/openapi/swagger.json" "ome-$sha/config/crd/full"
  mv "$tmp/ome-$sha/pkg/openapi/swagger.json" "$tmp/swagger.json"
  crd_dir=$tmp/ome-$sha/config/crd/full
fi

mkdir -p "$api_dir"
cp "$tmp/swagger.json" "$api_dir/swagger.json"
node "$extractor" "$crd_dir" "$api_dir/crd-meta.json"

# Re-running at the already pinned sha keeps its sync date, so the result is
# byte-identical and `git diff --exit-code api/ome` can verify the snapshot.
synced=$(date -u +%Y-%m-%d)
if [[ -f $api_dir/OME_VERSION && $(head -n 1 "$api_dir/OME_VERSION") == "$sha" ]]; then
  synced=$(awk 'NR == 2 { print $2 }' "$api_dir/OME_VERSION")
fi
printf '%s\nsynced %s from ome-projects/ome\n' "$sha" "$synced" >"$api_dir/OME_VERSION"

echo "api/ome now tracks ome-projects/ome@$sha"
git -C "$repo_root" diff --stat -- api/ome
