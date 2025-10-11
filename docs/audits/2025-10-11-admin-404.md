# Admin SPA fallback regression analysis (2025-10-11)

## Summary
- `https://tooltician.com/admin` still responds with GitHub's default 404 document instead of the custom SPA fallback shipped in [`public/404.html`](../../public/404.html).【071991†L1-L12】【898171†L1-L80】
- The production host is missing `redirect-spa.js` and `spa-404.js`, confirming that the latest fallback bundle was never published to GitHub Pages.【39af22†L1-L12】【db1748†L1-L12】
- GitHub Actions job `Verify production routing` was introduced in commit [`99ad552`](https://github.com/cortega26/portfolio-manager-server/commit/99ad55285556f36276b375d3d08b66fd992665ea) and amended in [`c0e8614`](https://github.com/cortega26/portfolio-manager-server/commit/c0e8614593e94f8cdd729054c767db78b35ca661). It now gates the entire workflow on `curl https://www.tooltician.com/admin | grep -q "tooltician:spa:redirect"`.【85cb18†L8-L12】
- Because production is still serving the legacy 404, that step always exits with status 1,【a6b12e†L1-L3】 causing `ci.yml` to fail. The deploy workflow (`deploy.yml`) is configured with `needs: [ci]`, so Pages never receives the new fallback build.【38151a†L18-L47】

## Root cause
The regression is not in the fallback implementation itself; the new assets simply never reached the CDN. By asserting the *current* production response before the deployment step runs, CI deadlocks: the health check requires the new 404 to be live, but the deploy job that would publish that file is skipped whenever the check fails.

## Recommended fix
1. **Move routing verification to the artifact stage.** Serve the freshly built `dist/` folder in CI (for example with `npx http-server dist -p 4173`) and reuse the existing Playwright suite (`e2e/admin-routing.spec.ts`) against that local origin. This validates the fallback without depending on the stale production state.
2. **Add a post-deploy smoke check.** After `actions/deploy-pages`, poll `${{ steps.deployment.outputs.page_url }}/admin` until it returns the storage-key marker. This ensures the Pages rollout succeeded while keeping deployment unblockable.
3. **Trigger a fresh deployment.** Once the workflow is reordered, the next push to `main` will publish the current `dist/` (which already contains `404.html`, `redirect-spa.js`, and `spa-404.js`) and resolve the 404 observed at `/admin`.

Following this sequence adheres to best SWE practices: tests run against the code under review, production checks verify the outcome of a deployment rather than gate it, and the pipeline avoids self-inflicted outages.

## Remediation status
- ✅ CI now runs `npx http-server dist -p 4173` and executes the Playwright admin routing spec against the freshly built artifact, decoupling verification from the production host. See [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) and [`playwright.admin-static.config.ts`](../../playwright.admin-static.config.ts).
- ✅ The deploy workflow polls `${{ steps.deployment.outputs.page_url }}/admin` for the `tooltician:spa:redirect` marker immediately after `actions/deploy-pages`, guaranteeing the fallback is live before the job succeeds. Refer to [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml).
- 🔄 Next production deployment will automatically ship the existing fallback assets (`404.html`, `redirect-spa.js`, `spa-404.js`) resolving the `/admin` 404 once the workflow runs on `main`.
