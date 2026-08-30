# evalkit

CLI for running LLM code review evaluations against benchmark cases using the Reviewer interface.

`evalkit` executes the review evaluation harness against the curated dataset, persisting structured JSON results for later analysis.

## Commands

- **`run`**: Run a single evaluation across specified cases, states, and arms (`baseline` | `middleware` | `both`).

## Example

```bash
evalkit run --dataset-dir <path> --case <ids> --arm both --runs 5 --model <id>
```

## Usage

Run from the monorepo root:

```bash
pnpm --filter evalkit build  # build CLI
```

Provider API keys are loaded from the root `.env` file. See `.env.example`.
