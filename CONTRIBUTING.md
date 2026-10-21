# Contributing

Thanks for helping. This project is MIT licensed; by contributing you agree your changes are released under the same license.

## Set up

```bash
git clone <repo-url>
cd <repo>/src/web-resources
npm ci
npm run typecheck && npm test && npm run build
```

Node 22 or newer. The Power Platform CLI (`pac`) is only needed to pack or import the solution.

## Where things live

| Path | What |
|------|------|
| `src/web-resources/src` | TypeScript: recorder, player, store, command library and the React/Fluent UI |
| `src/web-resources/tests` | Unit tests (Vitest) |
| `src/solution` | Unpacked Dataverse solution (tables, roles, command, web resources) |
| `scripts` | Version check and bundle sync used by CI |

## Rules of thumb

- Keep the engine (`recorder.ts`, `player.ts`, `value-codec.ts`) free of direct Xrm calls so it stays unit-testable.
- Every user-visible string goes into `src/web-resources/src/i18n.ts` in both Dutch and English; a test fails when the two differ.
- Use the `bassllab_` prefix for all Dataverse components and never hard-code org URLs, IDs or customer names.
- Change tables and roles in a development environment, then `pac solution export` and `pac solution unpack` into `src/solution`. Do not hand-edit table XML.
- Update `CHANGELOG.md` and keep the version identical in `package.json`, the solution and the changelog (`node scripts/check-version.mjs`).

## Releasing

Tag `vX.Y.Z` on main. The release workflow builds the bundles, packs the managed and unmanaged solution and attaches both to a GitHub release.
