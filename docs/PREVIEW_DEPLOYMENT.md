# Codex apartment preview deployment

Development branch: `codex/apartment-lighting-pass`.

`.github/workflows/pages-preview.yml` builds two independent checkouts with Node 22 and `npm ci`: the current `main` commit and the exact development commit that triggered the workflow. It uploads one GitHub Pages artifact containing:

| Path | Build |
| --- | --- |
| `/horror/` | Original game, built from `main` |
| `/horror/codex/` | Codex environment and lighting pass |
| `/horror/codex/build-info.json` | Full original and preview commit SHAs |

The intended preview address is **https://starfox22.github.io/horror/codex/**. Treat it as an intended address until a successful deployment and a browser check confirm it is live. No changes to `main` or repository visibility are required by this workflow. Apartment assets are already committed; neither build regenerates them or downloads the source model.

## Prerequisites and confirmed deployment blocker

In repository **Settings → Pages**, select **GitHub Actions** as the source. A private repository needs a GitHub plan that supports Pages for private repositories. The `github-pages` environment's deployment branch policy must permit `codex/apartment-lighting-pass`; required environment reviewers, if configured, must approve the deployment in GitHub.

The branch was pushed successfully. [Deployment run 40055781528](https://github.com/starfox22/horror/actions/runs/40055781528) built both games and passed the preview checks, then failed at `actions/configure-pages@v5` because Pages is not enabled. The repository API reports `private: true` and `has_pages: false`; both site URLs return GitHub Pages “Site not found” (HTTP 404).

Initial API network failures cleared during the task. The current blocker is repository configuration and authorization: the agent's integration receives `403 Resource not accessible by integration` from the Pages API. The configure-pages action documents that automatic enablement needs a separate token with administration and Pages write permissions; its normal GITHUB_TOKEN cannot enable the site. No credentials or repository visibility were changed.

The owner must enable **Settings → Pages → GitHub Actions** and allow the development branch in the `github-pages` environment. Then rerun the existing workflow. If the private repository's plan does not offer Pages, choose an eligible hosting arrangement with the owner rather than making the repository public automatically. The final documentation-only follow-up commit skips CI; it does not alter the tested game, so rerunning the linked deployment publishes the tested game revision.

## Publish and verify

1. Complete the documented local build, browser and interaction checks, and commit the preview changes on `codex/apartment-lighting-pass`.
2. Push that branch to `origin`. Its push event runs **Pages · Codex apartment preview**. The workflow also declares `workflow_dispatch`, but GitHub's manual-run control may be unavailable while this workflow exists only on a non-default branch; pushing is the normal trigger.
3. Inspect the workflow run and resolve any Pages setup, environment branch-policy or reviewer requirement in GitHub. Build success alone does not establish deployment success.
4. Verify that both `/horror/` and `/horror/codex/` load, then inspect `/horror/codex/build-info.json` to confirm the expected commit. Test a representative interaction and movement in the deployed preview, not just an HTTP response.

Useful read-only checks after enabling Pages are:

```sh
gh api repos/starfox22/horror/pages
gh run list --repo starfox22/horror --branch codex/apartment-lighting-pass --workflow pages-preview.yml
```

The preview is a subdirectory of the **same Pages site**. Both workflows use the `pages` concurrency group. The existing `pages.yml` workflow still publishes only `main` at the root: **a later `main` deployment will remove `/codex/`**. Run the preview workflow again after that deployment to restore both builds. Keeping previews across all future `main` deployments would require a separately reviewed change to the original workflow or a separate hosting repository.

To restore just the original game, run the existing `Pages` workflow for `main`. This replaces the site's artifact with the original build. The preview workflow never commits generated assets or modifies either source checkout.
