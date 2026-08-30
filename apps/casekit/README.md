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

## Example

```bash
# Mine candidate commits from a repo
casekit mine --dataset-dir <dir> --repo next.js --limit 20

# Inject synthetic defects into a case and run quality gates
casekit inject --dataset-dir <dir>  --case case-042 --provider google --model gemini-3.6-flash
# Note: every injection needs to be reviewed first and accepted
casekit gate --dataset-dir <dir> --case case-042
```

## Usage

Run from the monorepo root:

```bash
pnpm --filter casekit build  # build CLI
```

Requires a `.env` file at the repo root with `GITHUB_TOKEN` and LLM provider keys. See `.env.example`.
