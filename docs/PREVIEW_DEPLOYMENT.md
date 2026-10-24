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

The branch was pushed successfully. [Deployment run 40055781528](https://github.com/starfox22/horror/actions/runs/40055781528) built both games and passed the preview checks, then failed at `actions/configure-pages@v5` because Pages was not enabled.

The owner has since made the repository public. The current repository API reports `private: false` and `has_pages: false`. Creating the Pages site through this integration still returns `403 Resource not accessible by integration`; the Pages read endpoint returns 404 because no site exists. The `github-pages` deployment environment has no required reviewers or branch restrictions, so no environment-policy change is needed.

To unblock publication, the owner must open [Settings → Pages](https://github.com/starfox22/horror/settings/pages) and select **GitHub Actions** under **Build and deployment → Source**. Then rerun the existing workflow. Its normal GITHUB_TOKEN has the required permissions to deploy after the site is enabled, but cannot bootstrap Pages itself. Do not ask for a replacement token or change repository visibility again to work around the integration's missing Pages settings permission.

The documentation-only follow-up commits skip CI and do not alter the tested game; rerunning the linked deployment publishes the tested game revision.

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
