# Codex apartment preview deployment

Ongoing Codex development and review branch: `codex-review` (Git branch names cannot contain spaces). The branch was renamed from `codex/apartment-lighting-pass`; keep subsequent review passes on this same branch. Claude uses a separate branch. Merge into or push to `main` only when explicitly requested by the owner.

`.github/workflows/pages-preview.yml` builds two independent checkouts with Node 22 and `npm ci`: the current `main` commit and the exact development commit that triggered the workflow. It uploads one GitHub Pages artifact containing:

| Path | Build |
| --- | --- |
| `/horror/` | Original game, built from `main` |
| `/horror/codex/` | Codex environment and lighting pass |
| `/horror/codex/build-info.json` | Full original and preview commit SHAs |

The intended preview address is **https://starfox22.github.io/horror/codex/**. Treat it as an intended address until a successful deployment and a browser check confirm it is live. No changes to `main` or repository visibility are required by this workflow. Apartment assets are already committed; neither build regenerates them or downloads the source model.

## Prerequisites and confirmed deployment blocker

In repository **Settings → Pages**, select **GitHub Actions** as the source. A private repository needs a GitHub plan that supports Pages for private repositories. The `github-pages` environment's deployment branch policy must permit `codex-review`; required environment reviewers, if configured, must approve the deployment in GitHub.

The owner made the repository public and enabled Pages with the GitHub Actions source. The rerun of [deployment 40055781528](https://github.com/starfox22/horror/actions/runs/40055781528) built both games, configured Pages, and uploaded the complete site artifact successfully.

Enabling Pages created a custom `github-pages` environment policy that permits only `main`. Deployment of `codex/apartment-lighting-pass` was rejected before its job started. The integration's attempt to add that one branch alongside main returned `403 Resource not accessible by integration`; existing protections were left intact.

To unblock publication, open [Settings → Environments](https://github.com/starfox22/horror/settings/environments), choose **github-pages**, and add **codex-review** under **Deployment branches and tags**, keeping **main**. The linked historical run belongs to the former branch name. Use a new push on `codex-review` to trigger the updated workflow, then rerun a `codex-review` deployment after its branch rule is permitted. Documentation-only follow-up commits skip CI and do not alter the tested game.

The hosted browser checker uses the session's configured HTTP(S) proxy for remote URLs. In a managed cloud machine, Chromium must trust the provided session proxy CA through its certificate store; keep TLS verification enabled. Localhost checks do not use that proxy.

## Publish and verify

1. Complete the documented local build, browser and interaction checks, and commit the preview changes on `codex-review`.
2. Push that branch to `origin`. Its push event runs **Pages · Codex review**. The workflow also declares `workflow_dispatch`, but GitHub's manual-run control may be unavailable while this workflow exists only on a non-default branch; pushing is the normal trigger.
3. Inspect the workflow run and resolve any Pages setup, environment branch-policy or reviewer requirement in GitHub. Build success alone does not establish deployment success.
4. Verify that both `/horror/` and `/horror/codex/` load, then inspect `/horror/codex/build-info.json` to confirm the expected commit. Test a representative interaction and movement in the deployed preview, not just an HTTP response.

Useful read-only checks after enabling Pages are:

```sh
gh api repos/starfox22/horror/pages
gh run list --repo starfox22/horror --branch codex-review --workflow pages-preview.yml
```

The preview is a subdirectory of the **same Pages site**. Both workflows use the `pages` concurrency group. The existing `pages.yml` workflow still publishes only `main` at the root: **a later `main` deployment will remove `/codex/`**. Run the preview workflow again after that deployment to restore both builds. Keeping previews across all future `main` deployments would require a separately reviewed change to the original workflow or a separate hosting repository.

To restore just the original game, run the existing `Pages` workflow for `main`. This replaces the site's artifact with the original build. The preview workflow never commits generated assets or modifies either source checkout.
