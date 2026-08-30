# code-review-eval

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Tooling and evaluation suite for the bachelor's thesis:

> **Mitigating Flakiness and Moving Goalposts in LLM-based Code Reviews: Evaluating Stateful Context Management**

This monorepo contains the review bot under evaluation, the evaluation harness that runs it, and the CLI that curates the benchmark dataset.

## Structure

```
.
├── apps/
│   ├── casekit/          # dataset pipeline (CLI)
│   └── evalkit/          # evaluation harness (CLI)
├── packages/
│   ├── reviewbot/        # the review artifact (baseline + middleware)
│   ├── casekit-core/     # shared case/repo loading utilities
│   ├── casekit-schema/   # zod schema definitions
│   ├── diffkit/          # in-memory unified diff + hunk-range parsing
│   ├── logger/           # shared logging utility
│   └── model-client/     # LLM provider client
```

## Dataset

Both CLIs read and write a benchmark dataset that is versioned separately, in
[code-review-eval-dataset](https://github.com/raah03/code-review-eval-dataset). Clone it anywhere and specify the `--dataset-dir` when calling commands.

```bash
git clone git@github.com:raah03/code-review-eval-dataset.git ../dataset
casekit gate --dataset-dir ../dataset --all
evalkit run --dataset-dir ../dataset
```

## Prerequisites

- **Node.js**: `>= 22`
- **pnpm**: `11.17.0`

## Setup

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Configure environment variables:**

   ```bash
   cp .env.example .env
   ```

   Set required LLM provider credentials (`OPENAI_API_KEY`, `GEMINI_API_KEY`, or `OPENROUTER_API_KEY`) and `GITHUB_TOKEN`.

3. **Build packages:**

   ```bash
   pnpm build
   ```

## Development

Run any individual package or app:

```bash
pnpm --filter <package> dev
```

Run workspace checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## License

Released under the [MIT License](LICENSE).
