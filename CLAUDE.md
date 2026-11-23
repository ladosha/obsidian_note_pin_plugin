# Note Pin (Obsidian plugin)

Repo `ladosha/obsidian_note_pin_plugin`, default branch `master`. The Android companion app is in `../android` (repo `ladosha/obsidian_note_pin_android`) and has its own release flow.

## Commits

- Write a short imperative subject. A release commit is `Release X.Y.Z`.
- Commit or push only when the owner asks.
- Before committing code, run `npm run build` (tsc and esbuild) and `npm test`. `main.js` is a build output; it is gitignored and only appears on releases.

## Obsidian community review rules

The review bot (eslint-plugin-obsidianmd) rejected these before, so avoid them:
- No `<style>` elements. CSS goes in `styles.css`; set colors with `el.setCssProps({"--var": value})`.
- No unnecessary type assertions.
- Settings use `getSettingDefinitions()` (Obsidian 1.13+) and keep the `display()` fallback, because `minAppVersion` is 1.10.0.
- Prefer `activeDocument`, `.instanceOf()`, and non-deprecated APIs.

## Releasing a new version

The community listing shows the latest release, and it renders `README.md` from `master` HEAD. README images must be PNG/JPG, because SVGs are dropped.

1. **Bump the version** to `X.Y.Z` in `manifest.json` and `package.json`.
   - Add `"X.Y.Z": "<minAppVersion>"` to `versions.json` (currently `"1.10.0"`). Keep tab indentation.
   - Run `npm install --package-lock-only` to update `package-lock.json`.
2. **Commit** the four files as `Release X.Y.Z`, then push `master`.
3. **Tag without a "v".** The tag must equal `manifest.json`'s version:
   ```sh
   git tag -a X.Y.Z -m "X.Y.Z" && git push origin X.Y.Z
   ```
   `.github/workflows/release.yml` builds, tests, attests, and creates a **draft** release with `main.js`, `manifest.json` and `styles.css`.
4. **Publish the draft** once the workflow finishes. Check it with `gh run list` and `gh release view X.Y.Z`. Write short user-facing notes:
   ```sh
   gh release edit X.Y.Z --draft=false --latest --notes "- <change>"
   ```
   Don't create the release with `gh release create` as well, because that makes a duplicate. If a duplicate draft appears, delete it by its id with `gh api -X DELETE repos/ladosha/obsidian_note_pin_plugin/releases/<id>`.

## Screenshots

`art/screenshots/` contains the tooling for the community-page screenshots: `make_vault.py` and `frame.py`. Desktop screenshots are 1200x800 and mobile ones 900x1600. The `raw/` and `out/` folders are gitignored.
