# casekit

CLI for curating the evaluation benchmark dataset. Allows mining candidate commits from repositories, injecting synthetic defects, and validating cases through quality gates.

## Commands

| Command       | Description                                           |
| ------------- | ----------------------------------------------------- |
| `repos sync`  | Sync local git mirrors of target repositories         |
| `screen`      | Screen GitHub repositories against selection criteria |
| `mine`        | Mine qualifying commits from git history              |
| `inject`      | Generate synthetic findings (defects + clean) via LLM |
| `plan`        | Create iterations mapping                             |
| `build`       | Materialize case files from injection metadata        |
| `gate`        | Run acceptance quality gates (G1–G7)                  |
| `materialize` | Write a specific iteration state to disk to inspect   |
| `typecheck`   | Standalone typecheck for debugging                    |

## Usage

Build the CLI once, then run it from the `code-review-eval/` directory:

```bash
cd code-review-eval-tools
pnpm build
node apps/casekit/dist/cli.js --help
```

Requires a `.env` file at the repo root with `GITHUB_TOKEN` and LLM provider keys. See `.env.example`.

## Examples

### Inspect a case without touching it

`materialize` allows to inspect the working tree of a specific iteration.

```bash
node apps/casekit/dist/cli.js materialize \
  --dataset-dir ../dataset --case case-001 --state i1 --out /tmp/case-001-i1
```

Add `--with-deps` to also run the repo's install command in the output directory.

### Rebuild cases from their injections

`plan` freezes which findings are active in which iteration, `build` derives `pr/meta.json` and `pr/files/**` from `injections/<id>.json`.

```bash
node apps/casekit/dist/cli.js plan  --dataset-dir ../dataset --case case-001
node apps/casekit/dist/cli.js build --dataset-dir ../dataset --case case-001
```

```
info: case-001: revert plan F4@i1, F1@i2
info: case-001: plan frozen (i0, i1, i2, i3)
info: case-001: replaying i0..i1..i2..i3
info: case-001: built (i0: 4 active, i1: 3 active, i2: 2 active, i3: 3 active)
```

### Run the acceptance gates

`gate` materializes every iteration, runs G1–G7, and writes the boolean map back into `MANIFEST.json`.

```bash
node apps/casekit/dist/cli.js gate --dataset-dir ../dataset --case case-003
```

```
info: gating case-003...
info: case-003: materializing every iteration for content-match gates
info: G1: typechecking base
info: G1: typechecking i0
info: G1: typechecking i1
info: G1: typechecking i2
info: G1: typechecking i3
info:   case-003: all gates pass
```

### Repo registry, screening, mining

`repos sync` updates the repo mirrors under `~/.cache/casekit/repos/` and writes the new `syncedAt`/`syncedRef` back into `config/repos.yaml`.

```bash
node apps/casekit/dist/cli.js repos sync --dataset-dir ../dataset --repo repomix
```

```
info: syncing repomix...
info: repomix: updating existing mirror at ~/.cache/casekit/repos/repomix
info:   repomix @ 85e3969b010c (2026-09-06)
```

`screen` checks repositories against the defined selection criteria. Passing `--repo owner/name` (repeatable) screens pre-selected repos instead of taking a snapshot of the top 400 starred matches.

```bash
node apps/casekit/dist/cli.js screen \
  --dataset-dir ../dataset --repo yamadashy/repomix --repo graphql/graphql-js --out /tmp/screen.json
```

```
info: github: authenticated, 5000/5000 core and 30/30 search requests left
info: screen: yamadashy/repomix passes the mechanical screen
info: screen: graphql/graphql-js passes the mechanical screen
info: screened 2 of 2 matching repos
info: survivors: 2
info:   yamadashy/repomix: 28219 stars, MIT, 28.2 MB, 40/40 PR-linked, 15 merge commits
info:   graphql/graphql-js: 20344 stars, MIT, 33.5 MB, 30/40 PR-linked, 0 merge commits
info: wrote /tmp/screen.json
```

`mine` walks a synced repo's post-cutoff history for case candidates. `--count-only` reports the results without running the heavy install/typecheck operations.

```bash
node apps/casekit/dist/cli.js mine --dataset-dir ../dataset --repo repomix --count-only
```

```
info: mine: repomix: 1756 commit(s) authored since 2026-01-01
info: mine: repomix: [197/1756] 15d3e1368cbe passed every cheap filter
...
info: mine: repomix: 21/1756 qualify (typecheck not verified, count-only)
info:   merge: 573 rejected
info:   band: 689 rejected
info:   fileCount: 569 rejected
info:   chore: 351 rejected
info:   docs: 115 rejected
info:   revert: 4 rejected
info:   noParent: 1 rejected
```

Drop `--count-only` to typecheck every candidate and output the qualifying to a file for manual review.

### Typecheck a single commit

`typecheck` runs the install/typecheck command which `mine` and `inject` use internally.Useful for initally confirming a repo's `typecheckCommand` in `config/repos.yaml` still works.

```bash
node apps/casekit/dist/cli.js typecheck \
  --dataset-dir ../dataset --repo repomix --ref e3b15a406ed78d8a463620a032a059ce911bfc0e
```

```
Preparing worktree (detached HEAD e3b15a40)
HEAD is now at e3b15a40 Merge pull request #1800 from yamadashy/chore/biome-ignore-browser-output
info: repomix@e3b15a406ed7: typechecks
```

### Injection

`inject` uses a model to generate synthetic findings using a predefined templated prompt.

```bash
node apps/casekit/dist/cli.js inject \
  --dataset-dir ../dataset --case case-003 --provider google --model gemini-3.6-flash
```

It rejects any case that already has findings present to avoid overwriting them.
```
error: case-003 already has 5 finding(s), pass --slot to replace one, or clear injections/case-003.json's "findings" by hand first
```
