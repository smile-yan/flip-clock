# Release Checklist

End-to-end procedure for shipping a new `flip-clock` release. Follow top-to-bottom
in order — each step assumes the previous one has finished.

## 0. Pre-flight

- [ ] `git status` is clean on `main`
- [ ] Local `main` is in sync with `origin/main` (`git fetch origin && git status`)
- [ ] All open PRs are merged (no draft PRs blocking the tag)
- [ ] Decide the version bump:
  - **patch** (`1.0.x` → `1.0.x+1`): bugfixes, internal cleanup, no user-visible
    features
  - **minor** (`1.x.y` → `1.(x+1).0`): new user-visible feature, behavior change,
    or a silent bug fix that affected shipped artifacts (e.g. release pipeline
    fixes like the macOS `lipo -create` switch)
  - **major**: breaking config migration, removed API, or `tauri` major upgrade

## 1. Bump the version

Three places to update — `Cargo.lock` is `.gitignore`d so just keep these two in sync:

- [ ] `src-tauri/tauri.conf.json` → `"version": "<NEW>"`
- [ ] `src-tauri/Cargo.toml` → `version = "<NEW>"`

Sanity check before committing:

```bash
grep '"version"' src-tauri/tauri.conf.json
grep '^version =' src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml   # confirms the build picks it up
```

## 2. Validate locally

- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` clean
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` clean
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` — all pass
- [ ] `node --check frontend/clock.js` clean
- [ ] `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); yaml.safe_load(open('.github/workflows/ci.yml'))"` clean

## 3. Push the version bump

- [ ] `git add src-tauri/tauri.conf.json src-tauri/Cargo.toml`
- [ ] Commit: `chore(release): bump version to <NEW>`
- [ ] `git push origin main`
- [ ] CI on `main` is green (lint / test / build-check linux+windows+macOS)

## 4. Dry-run the release pipeline (recommended)

> macOS universal DMG now uses `lipo -create` (added in the v1.0.10 cleanup).
> First run with the new step is worth a `workflow_dispatch` dry-run before
> tagging, so any lipo / codesign surprises surface without burning the tag.

- [ ] Open https://github.com/smile-yan/flip-clock/actions/workflows/release.yml
- [ ] Click **Run workflow** → branch `main`
- [ ] Wait for all four jobs: `build` (linux / windows / macOS×2) +
      `package-macos` + `release`
- [ ] Inspect the macOS `package-macos` step output — `lipo -info` should report
      `arm64 x86_64` for the universal binary
- [ ] The `release` job will create a **draft** GitHub Release because
      `softprops/action-gh-release` runs unconditionally — **delete the draft
      release after the dry-run** so the real tag isn't shadowed

## 5. Tag

- [ ] `git tag -a v<NEW> -m "Release v<NEW>"`
- [ ] `git push origin v<NEW>` — this triggers the real `Release` workflow

The push MUST be a **tag push** (`refs/tags/v*`); only then does
`.github/workflows/release.yml` actually publish artifacts and upload them as a
draft release.

## 6. Watch the release pipeline

- [ ] https://github.com/smile-yan/flip-clock/actions/workflows/release.yml
  shows a new run on the tag
- [ ] All matrix builds succeed:
  - `Build linux-x86_64-unknown-linux-gnu`
  - `Build windows-x86_64-pc-windows-msvc`
  - `Build aarch64-apple-darwin`
  - `Build x86_64-apple-darwin`
- [ ] `Render update.json` step ran on every matrix leg (only on tag pushes)
- [ ] `package-macos` finishes and uploads the universal DMG
- [ ] `release` job publishes a **draft** release with these assets:
  - `flip-clock-v<NEW>-linux-x86_64.deb` (and `.AppImage`)
  - `flip-clock-v<NEW>-windows-x86_64.exe` (NSIS)
  - `flip-clock-v<NEW>-macos-arm64.dmg`
  - `flip-clock-v<NEW>-macos-x86_64.dmg`
  - `flip-clock-v<NEW>-macos-universal.dmg`
  - `update.json` (rendered with the real version + build date)

## 7. Verify the artifacts

- [ ] Open the draft release and click through each asset to confirm the
      download URLs work
- [ ] On the macOS universal DMG: `lipo -info Flip\ Clock.app/Contents/MacOS/flip-clock`
      should report `arm64 x86_64`. If only one arch appears, lipo silently
      dropped an arch — fix and re-tag (do **not** delete the v<NEW> tag in
      place; bump to v<NEW>.1 or v<NEW+1> instead).
- [ ] On Windows: confirm the `.exe` installer is NSIS (not MSI — we don't
      ship MSI even though `bundle.targets: "all"` could produce them)
- [ ] On Linux: confirm the `.deb` installs and the AppImage is executable

## 8. Publish

- [ ] Edit the draft release on GitHub
- [ ] Trim the auto-generated release notes if they're noisy; add a "Highlights"
      section listing the user-visible changes since the previous release
- [ ] **Publish release**

## 9. Post-release sanity

- [ ] Inside the app, run **Menu → 检查更新** — the in-app updater should
      detect the new version via the rendered `update.json`
- [ ] On at least one platform, do a clean install of the released artifact
      (not the dev binary) and confirm the version string in **Menu → 关于**
      matches `v<NEW>`
- [ ] Update any pinned docs / links that referenced the previous version

## Recovery / rollback

If the release pipeline breaks after the tag is pushed:

- **Don't delete the v<NEW> tag** — rewriting history on a pushed tag breaks
  clones and CI caches. Instead:
- [ ] Fix the issue on a new branch, merge to main, and cut `v<NEW+1>`
- [ ] Mark the broken draft release as "Pre-release" with a note, or
      unpublish + replace after `v<NEW+1>` ships