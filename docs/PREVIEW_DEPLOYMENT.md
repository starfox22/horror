# Playable builds and deployment

All Codex development continues on `codex-review`. The owner must explicitly request any push or merge to `main`. Claude's source branch is `claude/pensive-volta-et0etl`; do not commit or push Codex work there.

## Current baseline and paths

On 2026-10-26, a fresh fetch confirmed `main` and Claude's branch were exactly the same build 0.15 commit, `c5a619f1e75881f46edbcf392f6c7f1e27e7a47e`. Codex was fast-forwarded to that entire history; the 0.16 bug pass continues from it. See [REVIEW_16.md](REVIEW_16.md) and [HANDOFF.md](HANDOFF.md).

| Path | Source |
| --- | --- |
| https://starfox22.github.io/horror/ | Production, read-only checkout of `main` |
| https://starfox22.github.io/horror/codex/ | Exact `codex-review` commit that triggers the Codex workflow |
| https://starfox22.github.io/horror/claude/ | Read-only checkout of `claude/pensive-volta-et0etl` |
| `/horror/codex/build-info.json` | `original`, `preview`, `claude` full source SHAs |
| `/horror/claude/build-info.json` | `main`, `claude`, `codex` full source SHAs |

`.github/workflows/pages-preview.yml` now preserves all three games in one Pages artifact. Each source has a separate checkout and Node 22 / `npm ci` build; generated files are never committed. Codex runs all actual `tools/check-*.mjs` regressions, including the newer story, power, phone, intruder and normal tests. `check-collision.mjs` is excluded because it is a picture generator that writes into `assets-src/`. The workflow has both a push filter and a job guard restricting it to `codex-review`.

No gameplay source is written to `main` or Claude's branch by this deployment. The imported application assets are already committed; publication needs no model regeneration or external model download.

## Configuration

The repository is public, Pages uses **GitHub Actions**, and the owner has selected **No restriction** for deployment branches in the `github-pages` environment. A later restriction must permit `codex-review`. Do not work around a deployment permission error by pushing to `main`.

All three workflows share the `pages` concurrency group because GitHub Pages accepts one site artifact. The original `pages.yml` workflow publishes production alone and will remove both preview subdirectories if it runs later; rerun the Codex workflow from `codex-review` to restore all three. Claude's workflow already preserves all three outputs. Never dispatch the production or Claude workflow from the Codex ref: those workflows lack an equivalent ref guard and can label the wrong source as a different build.

## Publish and verify

1. Complete the regression suite, production build and appropriate browser checks on `codex-review`.
2. Commit and push explicitly with `git push origin HEAD:refs/heads/codex-review`. The push triggers **Pages · Codex review**. Do not use `[skip ci]` for an application release.
3. Inspect that exact run through deployment success; a successful build alone is insufficient.
4. Verify all three HTML roots, decoder/model assets and each preview's build-info against the expected source SHAs. Inspect representative hosted behavior for application/path changes.
5. Record the run, release SHA, results and screenshots. Documentation-only follow-ups may use `[skip ci]`; distinguish their branch HEAD from the deployed game revision.

```sh
gh run list --repo starfox22/horror --branch codex-review --workflow pages-preview.yml
gh api repos/starfox22/horror/pages
```

Keep the managed HTTP(S) proxy and its CA trust, including in Chromium; never disable TLS verification. Hosted browser tooling uses the inherited proxy. Chromium may need certificate-store filesystem access in a managed workspace; local checks do not use the network proxy. CPU SwiftShader rendering verifies behavior, not desktop GPU throughput.

## Publication record

The 0.16 run and final source SHAs are added after deployment. Historical 0.11 promotion/deployment records are preserved in [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) and [REVIEW_11.md](REVIEW_11.md); 0.10 records are in [REVIEW_10.md](REVIEW_10.md). The old guide's two-output workflow and 0.11 production claim are superseded by the paths and baseline above.
