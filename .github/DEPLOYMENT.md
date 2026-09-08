# CI/CD Operations

NUSHub uses GitHub Actions as its delivery gate and the existing Vercel and
Render Git integrations as its deployment mechanism. Provider-side deployment
must wait for the stable `CI / Required` check before production promotion.

## Delivery path

1. A pull request runs client and server verification in parallel, reviews new
   dependencies, scans commits for secrets, and performs CodeQL analysis.
2. `CI / Required` fails unless every required job succeeds. This is the one
   stable check that branch and deployment protection should require.
3. A merge to `main` repeats the complete gate and creates SHA-256 checksummed
   client and server build artifacts retained for 14 days.
4. Vercel and Render deploy the verified `main` revision through their Git
   integrations.
5. A successful Vercel production deployment triggers `Production
   verification`, which checks the frontend shell and, when configured, the
   backend readiness endpoint.

No production credentials are stored in the workflow. GitHub Actions has
read-only repository permissions by default, and every third-party action is
pinned to an immutable commit. Dependabot keeps those pins and both npm lock
files current.

## One-time GitHub configuration

Create or update the `main` branch ruleset in **Settings > Rules > Rulesets**:

- require a pull request before merging (zero approvals is practical for a
  sole maintainer);
- require `CI / Required` and `Security / CodeQL` to pass;
- require branches to be up to date before merging;
- block force pushes and branch deletion;
- require conversation resolution.

In **Settings > Environments > Production**, restrict deployments to `main`.
Add these repository variables in **Settings > Secrets and variables >
Actions > Variables**:

- `PRODUCTION_WEB_URL`: the canonical HTTPS frontend origin. This is optional
  for `*.vercel.app` deployments but required for a custom domain.
- `PRODUCTION_API_URL`: the canonical HTTPS backend origin. When present, the
  production workflow requires `GET /health/ready` to return
  `{ "status": "ready" }`.

These values are public origins, not secrets. Do not add credentials to either
variable.

Enable GitHub private vulnerability reporting under **Settings > Security >
Code security and analysis** so reports described in `SECURITY.md` remain
private.

## One-time Vercel configuration

In the Vercel project settings:

- keep `main` as the production branch and `client` as the root directory;
- add a Deployment Check that requires `CI / Required` before production
  promotion;
- keep `VITE_API_URL` and OAuth identifiers in Vercel environment settings;
- do not expose backend credentials through `VITE_` variables because Vite
  embeds them in public browser assets.

Vercel may build a candidate immediately, but the Deployment Check prevents a
failed revision from being promoted to production.

## One-time Render configuration

For the backend web service:

- keep `server` as the root directory;
- use `npm ci --omit=dev && npm run build` as the build command;
- use `npm start` as the start command;
- choose **After CI Checks Pass** for Auto-Deploy;
- set the health check path to `/health/ready`;
- store `DATABASE_URL`, `JWT_SECRET`, provider keys, and storage credentials
  only in Render's encrypted environment settings.

The server applies forward-only database migrations before opening its HTTP
listener. A failed migration therefore prevents an unhealthy release from
passing the readiness check.

## Rollback

Application rollback is performed in Vercel or Render by redeploying the last
known-good commit. Database migrations must remain forward-only: never edit or
delete an applied migration. If a schema change needs correction, add a new
numbered migration that is compatible with both the old and new application
revision before rolling application code back.

After a rollback, manually run **Production verification** with the canonical
frontend URL and confirm both smoke checks pass.
