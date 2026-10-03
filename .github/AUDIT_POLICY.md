# Dependency audit exception

CI runs the dependency audit twice for each package: once for production dependencies and once for all dependencies. Any high or critical production vulnerability fails the job. Other high or critical findings also fail unless they derive **only** from the exception below.

- Advisory: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) (`braces`)
- Scope: development-only transitive dependencies of Tailwind CSS 3 in `client` (and any other dev-only chain to this exact advisory). No production exception.
- Reason: the advisory has no patched `braces` release. Migrating to Tailwind CSS 4 is a separate major change that requires application testing.
- Expiry: **2026-11-03 00:00 UTC**. After that date, CI fails until the dependency is patched, replaced, or the exception is explicitly reviewed and renewed.

The policy is implemented and tested in `scripts/audit-dependencies.mjs` and `scripts/audit-dependencies.test.mjs`. It fails closed if the audit cannot run or returns invalid output, if a new advisory enters the dependency chain, or if the affected package becomes fixable. Recheck the advisory and Tailwind migration path before expiry; do not silently extend the date.
