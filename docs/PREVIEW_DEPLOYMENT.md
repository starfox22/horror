# Codex apartment preview deployment

Development branch: `codex/apartment-lighting-pass`.

`.github/workflows/pages-preview.yml` builds two independent checkouts with Node 22 and `npm ci`: the current `main` commit and the exact development commit that triggered the workflow. It uploads one GitHub Pages artifact containing:

| Path | Build |
| --- | --- |
| `/horror/` | Original game, built from `main` |
| `/horror/codex/` | Codex environment and lighting pass |
| `/horror/codex/build-info.json` | Full original and preview commit SHAs |

The intended preview address is **https://starfox22.github.io/horror/codex/**. Treat it as an intended address until a successful deployment and a browser check confirm it is live. No changes to `main` or repository visibility are required by this workflow. Apartment assets are already committed; neither build regenerates them or downloads the source model.

## Prerequisites and current access limitation

In repository **Settings → Pages**, select **GitHub Actions** as the source. A private repository needs a GitHub plan that supports Pages for private repositories. The `github-pages` environment's deployment branch policy must permit `codex/apartment-lighting-pass`; required environment reviewers, if configured, must approve the deployment in GitHub.

During development, native Git reads through the cloud environment's existing Git authentication worked. Requests to `api.github.com` failed at the network proxy with `CONNECT 403 Forbidden`, before GitHub authentication could be checked. `api.github.com` and `starfox22.github.io` were requested as additional environment network destinations. Until those settings are applied, the agent cannot inspect Pages eligibility/settings, watch deployment status, or verify the hosted game. This failure does not establish that a replacement GitHub token is needed.

## Publish and verify

1. Complete the documented local build, browser and interaction checks, and commit the preview changes on `codex/apartment-lighting-pass`.
2. Push that branch to `origin`. Its push event runs **Pages · Codex apartment preview**. The workflow also declares `workflow_dispatch`, but GitHub's manual-run control may be unavailable while this workflow exists only on a non-default branch; pushing is the normal trigger.
3. Inspect the workflow run and resolve any Pages setup, environment branch-policy or reviewer requirement in GitHub. Build success alone does not establish deployment success.
4. Verify that both `/horror/` and `/horror/codex/` load, then inspect `/horror/codex/build-info.json` to confirm the expected commit. Test a representative interaction and movement in the deployed preview, not just an HTTP response.

Once API network access works, useful read-only checks are:

```sh
gh api repos/starfox22/horror/pages
gh run list --repo starfox22/horror --branch codex/apartment-lighting-pass --workflow pages-preview.yml
```

The preview is a subdirectory of the **same Pages site**. Both workflows use the `pages` concurrency group. The existing `pages.yml` workflow still publishes only `main` at the root: **a later `main` deployment will remove `/codex/`**. Run the preview workflow again after that deployment to restore both builds. Keeping previews across all future `main` deployments would require a separately reviewed change to the original workflow or a separate hosting repository.

To restore just the original game, run the existing `Pages` workflow for `main`. This replaces the site's artifact with the original build. The preview workflow never commits generated assets or modifies either source checkout.
