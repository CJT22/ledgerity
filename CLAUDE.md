# CLAUDE.md

## Versioning and changelog (required for every change)

Every change that affects the app in any way must, in the same change:

1. **Bump the version** in `package.json` and `package-lock.json`.
   Use `npm version <major|minor|patch> --no-git-tag-version` so both files stay in sync.
   The version is shown in the UI (`__APP_VERSION__`, injected by `vite.config.ts`) and in the
   server startup banner (`server/src/config.ts`), so it must always be accurate.
2. **Add an entry to `CHANGELOG.md`** under a new heading `## [X.Y.Z] - YYYY-MM-DD`
   (today's date), placed above the previous release. Follow the existing
   [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) style: group items under
   `### Added`, `### Changed`, `### Fixed`, `### Removed`, `### Security`, and add an
   `### Upgrading` section whenever users need to know about migrations, export/import
   compatibility, or manual steps. Write entries for users, in plain language, not as code notes.

### Released versions are final

A version is **set and final once it is committed and pushed** to the remote. Never bump past,
reword, or re-file a pushed version's changes. Anything that shipped in a pushed commit belongs
to that commit's version, even if the changelog filed it elsewhere (e.g. under `[Unreleased]`).

Before choosing a version, compare the working tree with the remote:

```sh
git fetch
git show origin/main:package.json | grep '"version"'   # last released version
grep '"version"' package.json                           # current version
```

- **Same version** → the current version is already released. Bump to a new version for this change.
- **Local version is higher** → that version is still pending (only bumped locally or in unpushed
  commits). Don't bump again. Add this change to that version's changelog entry, and raise
  the pending version only if this change needs a higher level than it has (e.g. pending
  1.0.1 plus a new feature → 1.1.0, relative to the released 1.0.0).

Don't use an `[Unreleased]` section. Every entry gets a concrete version number.

"Affects the app" means anything a user could notice or that changes what ships: features,
UI, behavior, bug fixes, performance, data/database schema, API, import/export formats,
dependencies, and build or startup scripts. Changes that do **not** need a bump: tests only,
docs/README only, `CLAUDE.md`, editor or CI config, and refactors with no behavior change.

### Choosing the version number (Semantic Versioning)

Pick the highest level that applies to the change:

- **MAJOR (X.0.0)** — breaking for existing users or their data:
  - removing a feature, page, setting, or data field;
  - a database migration that drops or irreversibly transforms user data;
  - older JSON exports can no longer be imported, or export/CSV columns are removed or renamed;
  - API changes that break existing clients.
- **MINOR (x.Y.0)** — backward-compatible additions or noticeable changes:
  - new features, pages, settings, options, or export fields;
  - changed behavior or UI that doesn't break existing data or workflows;
  - additive database migrations (new tables/columns with safe defaults);
  - deprecating something (without removing it yet).
- **PATCH (x.y.Z)** — backward-compatible fixes and small adjustments:
  - bug fixes, wording/style tweaks, performance improvements;
  - dependency updates with no user-visible change;
  - security fixes that don't change behavior.

Reset lower numbers when bumping (e.g. 1.4.2 → 1.5.0, 1.5.0 → 2.0.0).
If you are unsure between two levels, choose the higher one and say why in your summary.
When several changes are made together in one task, bump once using the highest level among them
and list every change in that single changelog entry.

Note: the app version is separate from the database schema version
(`server/src/db/migrations.ts`) and the JSON export format version
(`server/src/models/index.ts`, `client/src/api/mockApi.ts`). Bump those only when the schema or
export format actually changes, and mention it in the changelog's `### Upgrading` section.
