# Contribution Guidelines

Thank you for your interest in contributing to the OME Web Console! This repository is open to everyone and welcomes all kinds of contributions, no matter how small or large. There are several ways you can contribute to the project:

* Identify and report any issues or bugs.
* Suggest or implement new features.

This document explains the contribution process. For environment setup, local development, and the API reference, see the [README](README.md).

> This console is developed independently of the [OME](https://github.com/ome-projects/ome) operator. It depends on OME only at runtime, through the `ome.io/v1beta1` CRD contract — so changes here do not require a matching OME release. Issues about the operator, CRDs, or controllers belong in the [OME repository](https://github.com/ome-projects/ome/issues).

## Repository Layout

```
ome-console/
├── backend/     # Go backend-for-frontend (gin), module sigs.k8s.io/ome/ome-console/backend
├── frontend/    # Next.js 14 App Router, TypeScript
├── go.work      # Go workspace so tooling resolves the backend module from the repo root
└── Makefile     # Orchestrates both; run `make help` to list targets
```

The frontend never talks to the Kubernetes API directly — it calls the backend, which uses a `client-go` dynamic client. When adding a feature that reads or writes a new OME resource, you will usually touch both sides.

## Contributing Guidelines

### Coding Style Guide

* **Go** — we adhere to the [Golang Style Guide](https://google.github.io/styleguide/go/). Format with `make format-backend` (gofmt).
* **TypeScript / React** — formatting is enforced by Prettier and linting by ESLint (`next lint`). Format with `make format-frontend`.

Run `make format` to format both, and `make lint` to lint both.

### Pull Requests

When submitting a pull request:

1. Make sure your code has been rebased on top of the latest commit on the main branch.
2. Ensure the code is formatted and passes checks: `make format`, `make lint`, `make typecheck`, and `make test`.
3. Add new test cases. In the case of a bug fix, the tests should fail without your code changes. For new features, try to cover as many variants as reasonably possible.
4. Modify the documentation as necessary — including the README's API Reference if you add or change a backend route.
5. Fill out the pull request template completely.
6. Link any related issues using the "Fixes #123" syntax to automatically close them when the PR is merged.

Direct commits to `main` are blocked; please work on a branch and open a PR.

#### Pre-commit check

**Pre-commit hooks** run these checks automatically. Fast checks run on every commit; slower ones run on push.

On commit:
- **General checks**: trailing whitespace, end-of-file fixing, YAML validation, merge conflict detection, large file prevention, private key detection, mixed line endings, and protection against committing to `main`
- **Spell checking**: `codespell` for catching typos across text files
- **Backend**: `go-fmt`, `go-vet`
- **Frontend**: `prettier-check`, and `npm-lockfile-sync` to keep `frontend/package-lock.json` in sync with `package.json` so CI's `npm ci` stays reproducible

On push (slower, so they stay out of the commit loop):
- **Backend**: `go-build`, `go-mod-tidy`
- **Frontend**: `eslint`, `typescript typecheck`

To set up:

```bash
pip install pre-commit
pre-commit install
pre-commit install --hook-type pre-push   # required: some hooks run only on push
```

To run it:
```bash
pre-commit run --all-files                      # run all commit-stage hooks on all files
pre-commit run --all-files --hook-stage pre-push  # include the push-stage hooks
pre-commit run go-fmt --all-files               # run a single hook
```

> **Note:** The `npm-lockfile-sync` hook regenerates the lockfile via `npm install --package-lock-only`, whose output can vary slightly across npm versions. To avoid spurious lockfile diffs, use the same Node.js major version as CI — **Node 23** (e.g. `nvm use 23`).

### PR Template

It is required to classify your PR and make the commit message concise and useful. Prefix the PR title appropriately to indicate the type of change. Please use one of the following:

* `[Frontend]` for changes to the Next.js application — pages, components, hooks, styling.
* `[Backend]` for changes to the Go API server — handlers, Kubernetes clients, informers.
* `[Bugfix]` for bug fixes.
* `[Docs]` for changes related to documentation.
* `[CI/Tests]` for unit tests, integration tests, and CI workflows.
* `[Misc]` for PRs that do not fit the above categories, such as dependency bumps. Please use this sparingly.

Open source community also recommends keeping the commit message title within 52 characters and each line in the message content within 72 characters.

### Testing

```bash
make test            # backend (go test) and frontend (vitest)
make test-backend
make test-frontend
```

* **Backend** — table-driven Go tests alongside the code under test. Kubernetes interactions should be tested against a fake or dynamic fake client rather than a live cluster.
* **Frontend** — Vitest with React Testing Library. Prefer testing user-visible behavior over implementation details.

Changes that affect how the console reads cluster state are worth a manual smoke test against a cluster with OME installed: run `make dev`, then confirm the affected page loads and renders real data.

### Code Reviews

All submissions, including submissions by project members, require a code review. To make the review process as smooth as possible, please:

1. Keep your changes as concise as possible. If your pull request involves multiple unrelated changes, consider splitting it into separate pull requests.
2. Respond to all comments within a reasonable time frame. If a comment isn't clear, or you disagree with a suggestion, feel free to ask for clarification or discuss the suggestion.
3. Provide constructive feedback and meaningful comments. Focus on specific improvements and suggestions that can enhance the code quality or functionality. Remember to acknowledge and respect the work the author has already put into the submission.

## Dependencies

* **Go** — add imports and run `go mod tidy` from `backend/`. To upgrade, use `go get example.com/pkg` for the latest version or `go get example.com/pkg@v1.2.3` for a specific one. The `go-mod-tidy` hook verifies `go.mod` and `go.sum` stay tidy.
* **npm** — install from `frontend/` so `package-lock.json` is updated alongside `package.json`; commit both. The `npm-lockfile-sync` hook verifies they agree.

## Proposing Substantial Changes

For significant changes — a new major view, a change to how the console authenticates to the cluster, or anything that alters the contract with OME's CRDs — please open an issue describing the motivation and approach before sending a large PR. This saves rework if the direction needs discussion.
