# Codex apartment preview deployment

Ongoing Codex development and review branch: `codex-review` (Git branch names cannot contain spaces). The branch was renamed from `codex/apartment-lighting-pass`; keep subsequent review passes on this same branch. Claude uses a separate branch. Merge into or push to `main` only when explicitly requested by the owner.

The owner authorized promotion of 0.11 to `main` on 2026-10-24. [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) records the production publication and current continuation baseline. Production deployment [40111353532](https://github.com/starfox22/horror/actions/runs/40111353532) succeeded from `73f66df26830f888c3c17869543f6df25a9ec844`; the preview workflow was then rerun to restore both URLs.

`.github/workflows/pages-preview.yml` builds two independent checkouts with Node 22 and `npm ci`: the current `main` commit and the exact development commit that triggered the workflow. It uploads one GitHub Pages artifact containing:

| Path | Build |
| --- | --- |
| `/horror/` | Production game, built from `main` |
| `/horror/codex/` | Codex environment and lighting pass |
| `/horror/codex/build-info.json` | Full original and preview commit SHAs |

The published preview is **https://starfox22.github.io/horror/codex/**. [Workflow run 40109659758, attempt 2](https://github.com/starfox22/horror/actions/runs/40109659758/attempts/2) restored build 0.11 at both production and review URLs after the main promotion. No changes to `main` or repository visibility are required by this workflow. Apartment assets are already committed; neither build regenerates them or downloads the source model.

## Deployment configuration and current publication

The repository is public. GitHub Pages uses **GitHub Actions** as its source. The owner selected **No restriction** for deployment branches in the `github-pages` environment; the previously blocking main-only rule is gone. If restrictions are reintroduced later, they must permit `codex-review` for its preview workflow.

Deployment run **40109659758**, attempt 2, completed successfully after the main Pages deployment. Its published provenance at [`/horror/codex/build-info.json`](https://starfox22.github.io/horror/codex/build-info.json) records:

- Preview commit: `259e12e6ade8d6ad97fcd6af81be4d2e95e453a4`.
- Main production source (`original`): `73f66df26830f888c3c17869543f6df25a9ec844`.

The initial review publication (attempt 1) preserved main 0.7; that historical record is in REVIEW_11.md. Main is now owner-approved 0.11. Later documentation-only branch heads can differ from the deployed source without changing the game.

Both site roots load, and the preview HTML identifies build 0.11. The hosted hand SHA256 matches the final adapted asset; both drinking recordings and the hand license return HTTP 200. All 90 local Node regressions, eight room destinations, graphics UI/persistence, native WebGL drinking and full WebGPU gameplay checks pass. The final hosted HTTPS WebGPU check passed default 60 FPS, native fridge opening/second-E drinking, loaded hand/audio, pause/resume and hidden-tab freeze, glass return, control handoff and native refrigerator closing, with no unexpected page, console or HTTP failures. See [REVIEW_11.md](REVIEW_11.md) and its validation JSON for the precise inspection method. CPU rendering does not establish desktop hardware throughput. Documentation-only follow-ups skip CI and do not change the deployed game revision. Future code changes should trigger and verify a new deployment on `codex-review`.

The agent integration could read deployment status and rerun Actions, but attempts to enable Pages or edit environment branch policies returned HTTP 403. The owner resolved those settings in GitHub. Do not change `main` to work around a future deployment permission failure.

The hosted browser checker uses the session's configured HTTP(S) proxy for remote URLs. In a managed cloud machine, Chromium must trust the provided session proxy CA and have access to its certificate store; keep TLS verification enabled. Localhost checks do not use that proxy.

## Publish and verify

1. Complete the documented local build, browser and interaction checks, and commit the preview changes on `codex-review`.
2. Push that branch to `origin`. Its push event runs **Pages · Codex review**. The workflow also declares `workflow_dispatch`, but GitHub's manual-run control may be unavailable while this workflow exists only on a non-default branch; pushing is the normal trigger.
3. Inspect the workflow run and resolve any Pages setup, environment branch-policy or reviewer requirement in GitHub. Build success alone does not establish deployment success.
4. Verify that both `/horror/` and `/horror/codex/` load, then inspect `/horror/codex/build-info.json` to confirm the expected commit. Test a representative interaction and movement in the deployed preview, not just an HTTP response.

Useful read-only deployment checks are:

```sh
gh api repos/starfox22/horror/pages
gh run list --repo starfox22/horror --branch codex-review --workflow pages-preview.yml
```

The preview is a subdirectory of the **same Pages site**. Both workflows use the `pages` concurrency group. The existing `pages.yml` workflow still publishes only `main` at the root: **a later `main` deployment will remove `/codex/`**. Run the preview workflow again after that deployment to restore both builds. Keeping previews across all future `main` deployments would require a separately reviewed change to the original workflow or a separate hosting repository.

To publish only current production, run the existing `Pages` workflow for `main`. This replaces the site's artifact with the current main build. The preview workflow never commits generated assets or modifies either source checkout.
