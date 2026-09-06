# evalkit

CLI for running LLM code review evaluations against benchmark cases using the Reviewer interface.

`evalkit` executes the review evaluation harness against the curated dataset, persisting structured JSON results for later analysis.

## Commands

- **`run`**: Run a single evaluation across specified cases, states, and arms (`baseline` | `middleware` | `both`).

## Usage

Build the CLI once, then run it from the `code-review-eval/` directory:

```bash
cd code-review-eval-tools
pnpm build
node apps/evalkit/dist/cli.js run --help
```

Provider API keys are loaded from the root `.env` file. See `.env.example`.

## Examples

### Both arms over a state

`--arm both` runs `baseline` and `middleware` on the same states, in the given state order.

```bash
node apps/evalkit/dist/cli.js run \
  --dataset-dir ../dataset \
  --case case-003 --states i0,i1 --arm both --runs 1 \
  --provider openrouter --model openai/gpt-5.6-luna --effort medium \
  --run-id smoke
```

### Resume

Cells that already have an applicable result are skipped, so reusing a `--run-id` continues an interrupted run.

```bash
node apps/evalkit/dist/cli.js run \
  --dataset-dir ../dataset \
  --case case-003 --states i0,i1 --arm both --runs 1 \
  --provider openrouter --model openai/gpt-5.6-luna --effort medium \
  --run-id smoke -v
```

```
debug: case-003/i0/baseline/r1: already done, skipping
debug: case-003/i1/baseline/r1: already done, skipping
debug: case-003/i0/middleware/r1: already done, skipping
debug: case-003/i1/middleware/r1: already done, skipping
```

### Result layout

```
dataset/results/runs/<run-id>/
├── <case>/<state>/<arm>/r<run>.json    one artifact per cell
└── state/<case>/r<run>/<state>.json    middleware state store, one chain per case and trial
```
