# Tooltician – Post-deploy checklist

Run this list after every production deployment to `https://www.tooltician.com/`.

## 1. Verify redirects and TLS
```bash
curl -I http://tooltician.com
curl -I http://www.tooltician.com
curl -I https://tooltician.com
curl -I https://www.tooltician.com
```
All responses must terminate at `https://www.tooltician.com/` with HTTP 301s for the first three commands and HTTP 200 for the final command.

## 2. Confirm SPA deep-link fallback
```bash
curl -I https://www.tooltician.com/admin || true
curl -I https://www.tooltician.com/dashboard || true
```
The response should serve HTML and the page should hydrate in a browser without a 404 screen.

## 3. Run Lighthouse (desktop + mobile)
```bash
npx lighthouse https://www.tooltician.com/ --quiet --chrome-flags="--headless" \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output-path=./lighthouse-www.tooltician.com.json
```
Attach the generated JSON summary to the deployment log.

## 4. Check for broken links
```bash
npx linkinator https://www.tooltician.com/
```
Resolve or suppress any non-2xx responses.

## 5. Inspect console and network
Open DevTools against the live site and reload:
- **Console:** no warnings or errors.
- **Network:** all requests served via HTTPS; no mixed-content or blocked CSP violations.

## 6. Validate robots & sitemap
```bash
curl https://www.tooltician.com/robots.txt
curl https://www.tooltician.com/sitemap.xml
```
Ensure `robots.txt` references the sitemap and that `sitemap.xml` lists the expected routes.

## 7. Cache & header spot check
```bash
curl -I https://www.tooltician.com/assets/index-*.js
curl -I https://www.tooltician.com/
```
Confirm hashed assets are immutable (`cache-control: public, max-age=31536000, immutable`) and HTML responses have a short TTL (`max-age<=600`).

## 8. Security headers (if Cloudflare/CDN managed)
Using your CDN dashboard or `curl -I`, verify:
- `Content-Security-Policy`
- `Referrer-Policy`
- `X-Content-Type-Options`
- `Permissions-Policy`

## 9. Document results
Update the deployment ticket/PR with:
- Redirect command output.
- Lighthouse scores (desktop + mobile).
- Linkinator summary.
- Any remediation items.

---

**Reminder:** If DNS or CDN changes are pending, call them out explicitly so operators can finish the rollout.
