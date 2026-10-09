# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A GitHub Action (TypeScript, Node 24 runtime) that posts workflow status notifications to a Slack incoming webhook. It's Fifthsun's fork (`origin` = `fifthsun/notify-slack-action`) of `ravsamhq/notify-slack-action`. The README and `action.yml` still point at upstream (`ravsamhq/notify-slack-action@v2`).

## Commands

```bash
npm ci
npm run typecheck      # tsc --noEmit (TS only type-checks; ncc does the emitting)
npm run lint           # eslint on src, __tests__, root configs (flat config: eslint.config.mjs)
npm run format         # prettier on **/*.ts; format-check to verify
npm test               # vitest run
npx vitest run -t "expanded workflow"   # single test by name
npm run package        # ncc bundles src/main.ts -> dist/index.js + dist/licenses.txt
npm run all            # typecheck, format, lint, test, package
```

Toolchain: Node 24 (`.nvmrc`), TypeScript 6.0 (pinned `~6.0` because `typescript-eslint` caps TS at <6.1; TS 7 is the native port), ESLint 9 (`eslint-plugin-github` has a transitive dep that blocks ESLint 10), Vitest.

### Module format

`@actions/core` 3.x and `@actions/github` 9.x are **ESM-only**. The source is written as ESM and resolved with `module: preserve` / `moduleResolution: bundler`. ncc then bundles everything into a **CommonJS** `dist/index.js`, which is what `action.yml` loads. There is no `"type": "module"` in package.json and no `lib/` output. After changing anything that affects the bundle, smoke-test the real artifact (`node dist/index.js` with `INPUT_*`/`GITHUB_*` env vars and `SLACK_WEBHOOK_URL` pointed at a local listener), because the tests exercise `src/` and never touch the bundle.

## Architecture

All logic lives in `src/main.ts`:

- `run()` runs **when the module is imported**. It checks `notify_when`, calls `buildPayload()`, and POSTs to `process.env.SLACK_WEBHOOK_URL`.
- `buildPayload()` (the only export) reads `@actions/github` `context` to build a map of template variables (`{repo}`, `{branch}`, `{commit_sha}`, `{run_url}`, `{workflow_url}`, `{emoji}`, `{status_message}`, …). It substitutes them into `notification_title`, `message_format` and `footer` with `replaceAll`, then returns a JSON string holding a single legacy Slack `attachments` entry. It does not use Block Kit.
- HTTP uses Node's global `fetch`; there's no node-fetch. `notifySlack()` awaits the POST and throws on a non-2xx response, and `run()` turns that into `setFailed`, which fails the step.
- `{workflow_url}` costs an extra GitHub API call (`/repos/{repo}/actions/workflows`) that needs the `token` input. It short-circuits to `"test-workflow-url"` when `NODE_ENV === "test"`.
- Adding a template variable means updating `patterns` in `buildPayload()` and the variable list in README.md. Adding an input means updating both `action.yml` and the README "Inputs" block, which duplicates it.

### dist/ is what actually runs

`action.yml` runs `dist/index.js`, the ncc bundle that is committed to the repo. Changes to `src/` or dependencies do nothing for consumers until `dist/` is regenerated (`npm run package`) and committed. CI (`.github/workflows/test-and-update.yml`) re-packages and **fails if `dist/` differs** from what's committed. It does not auto-commit, so always commit `dist/` together with source and dependency changes.

### Tests

Tests drive the action entirely through env vars. Each test sets `INPUT_*` (how `@actions/core` `getInput` reads inputs) and `GITHUB_*` (read by `@actions/github` `context`). It then calls `vi.resetModules()` and `await import("../src/main")` again, because `context` is captured at import time. Vitest sets `NODE_ENV=test`, which the workflow-URL stub depends on. `run()` also fires on every import, but it no-ops because `INPUT_NOTIFY_WHEN` is unset.

## Known quirks (don't "fix" silently; they affect behavior)

- The `JobStatus` type says `"warning"`, but inputs and docs use `"warnings"`. `notify_when` uses an exact list match (`parseStatusList`). `mention_*_when` use a substring `.includes()` on the raw input string.
- `{branch}` is the full ref (`refs/heads/foo`). Only `{branch_url}` strips the `refs/heads/` prefix.

## Releases

`.github/workflows/release.yml` runs on push to `master` only when the head commit message is exactly `do-production-release` **and** the commit author's GitHub username is listed in `.github/admins.txt`. It runs semantic-release in dry-run mode to compute the next version from conventional commits (`feat:`, `fix:`, …), creates the GitHub release, and force-moves the `vN` major tag. Use conventional commit messages so the version bump is computed correctly. Only plain-semver tags (`2.5.0`) count as "last version". Hand-made tags like `v2.5.0-node24` and the floating `v1`/`v2` major tags are ignored. Third-party actions are pinned by commit SHA with a version comment, and Dependabot (`.github/dependabot.yml`) keeps both them and the npm packages current.
