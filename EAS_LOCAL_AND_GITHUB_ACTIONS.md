# EAS Local Builds & GitHub Actions

This project supports **free** Android and iOS builds via:

1. **EAS local** – run builds on your machine (no EAS cloud charge).
2. **GitHub Actions** – run EAS local in CI (Android on Linux, iOS on macOS).

## 1. EAS local (your machine)

### Android (macOS or Linux only; not supported on Windows)

**On Windows:** EAS local does not run on Windows. Use **GitHub Actions** (e.g. `gh workflow run "Build Android (EAS local)"`) or **WSL** and run the build inside Linux.

- On **macOS or Linux**: Install [Android Studio](https://developer.android.com/studio) and the Android SDK/NDK.
- From the project root:

```powershell
# Interactive (script will prompt for platform, environment, and "Build locally?")
.\scripts\deploy.ps1

# Or with parameters + local
.\scripts\deploy.ps1 -Platform android -Environment prod -Local
```

Or call EAS directly:

```bash
npx eas-cli build --platform android --profile production --local --non-interactive
```

### iOS (macOS only)

- Install Xcode and accept the license.
- From the project root:

```powershell
.\scripts\deploy.ps1 -Platform ios -Environment prod -Local
```

Or:

```bash
npx eas-cli build --platform ios --profile production --local --non-interactive
```

You must be logged in: `eas login` or set `EXPO_TOKEN` in your environment.

---

## 2. GitHub Actions (CI)

Workflows run **EAS local** on GitHub’s runners so builds are free (no EAS cloud usage).

### One-time setup

1. **Expo access token**  
   Create a token at [expo.dev → Account → Access Tokens](https://expo.dev/accounts/[account]/settings/access-tokens).

2. **GitHub secret**  
   In your repo: **Settings → Secrets and variables → Actions** → **New repository secret**  
   - Name: `EXPO_TOKEN`  
   - Value: your Expo access token  

3. **Credentials**  
   Use either:
   - **EAS-managed credentials** (recommended): run at least one EAS build or `eas credentials` so EAS has your Android keystore and/or iOS certs. The same credentials are used when running `eas build --local` in CI with `EXPO_TOKEN`.  
   - **Local credentials**: [Local credentials](https://docs.expo.dev/app-signing/local-credentials/) in the repo (e.g. `credentials.json`). Do **not** commit real keystores or keys; use encrypted secrets and inject them in the workflow if needed.

### Workflows

| Workflow file              | Platform | Trigger                    | Runner        |
|---------------------------|----------|----------------------------|---------------|
| `.github/workflows/build-android.yml` | Android  | Manual or push to `main`   | `ubuntu-latest` |
| `.github/workflows/build-ios.yml`     | iOS      | Manual or push to `main`   | `macos-latest`  |

- **Manual run**: Actions → **Build Android (EAS local)** or **Build iOS (EAS local)** → **Run workflow** (optionally choose profile: production / preview / development).
- **On push to `main`**: same workflows run automatically (unless only docs/ignored paths changed).

Artifacts (e.g. `.aab`, `.apk`, `.ipa`) are uploaded to the run; download them from the **Summary** page of the workflow run.

### Optional: disable automatic builds on push

To run only manually, remove the `push:` block from each workflow file under `on:`.

---

## 3. Android: two ways to build

You can use either:

- **EAS local on your PC**: `.\scripts\deploy.ps1 -Platform android -Environment prod -Local` (or the `eas build --local` command above).
- **GitHub Actions**: trigger **Build Android (EAS local)** (manual or on push to `main`).

Both use the same EAS config and credentials and do not use paid EAS cloud builds.

---

## 4. FAQ

### Where do I set “run on push to repo”?

In the **workflow file** itself. Open `.github/workflows/build-android.yml` or `build-ios.yml` and look at the `on:` section:

```yaml
on:
  workflow_dispatch:   # manual trigger
    inputs: ...
  push:
    branches: [main]    # ← runs when you push to main
    paths-ignore:      # ← skip if only these paths changed
      - '**.md'
      - 'manager-francis/**'
      - '.github/**'
```

- **Change the branch:** e.g. `branches: [main, release]` or `branches: [main]` only.
- **Turn off push entirely:** delete the whole `push:` block (workflow will only run via “Run workflow” or CLI).
- **Different paths:** edit `paths-ignore` so the workflow only runs when relevant app code changes.

So: **push-to-run is configured in the workflow YAML**, not in GitHub repo Settings.

---

### Where are the run artifacts stored?

- **Location:** On **GitHub**, attached to that **workflow run** (not in your repo as files).
- **How to get there:** Repo → **Actions** → click the workflow (e.g. “Build Android (EAS local)”) → click a **run** (e.g. the top one) → scroll to **Artifacts** at the bottom of the run page.
- **Download:** Click the artifact name (e.g. `android-build` or `ios-build`) to download a zip with the build output (e.g. `.aab`, `.apk`, `.ipa`).
- **Retention:** GitHub keeps artifacts for a limited time (default 90 days for private repos, 90 days for public). You can change it under **Settings → Actions → General → Artifact and log retention**.

So: **artifacts are stored on the run’s Artifacts section**; download from there.

---

### Where do I find workflow runs in GitHub?

1. Open your repo on GitHub.
2. Click the **Actions** tab (top bar, next to Pull requests).
3. In the left sidebar, click the workflow name (e.g. **Build Android (EAS local)** or **Build iOS (EAS local)**).
4. The list you see is **all runs** of that workflow (triggered by push or manually). Click a run to see logs and **Artifacts**.

So: **Actions → [workflow name] → click a run**.

---

### How do I trigger a build from the CLI? Does deploy.ps1 trigger GitHub Actions?

- **deploy.ps1 does not trigger GitHub Actions.** It only runs **EAS local** on your machine (and optionally EAS cloud). Use it for local builds.
- **To trigger the GitHub Actions workflow from the CLI**, use the **GitHub CLI** (`gh`):

  ```bash
  # List workflows to get the exact name
  gh workflow list

  # Run Android build (uses default profile: production)
  gh workflow run "Build Android (EAS local)"

  # Run iOS build
  gh workflow run "Build iOS (EAS local)"

  # With input (e.g. profile)
  gh workflow run "Build Android (EAS local)" -f profile=preview
  ```

  You need [GitHub CLI](https://cli.github.com/) installed and authenticated (`gh auth login`). This **starts** the run; to download artifacts you still go to **Actions** in the browser (or use `gh run list` / `gh run download`).

**Summary:**

| Goal                         | Use |
|-----------------------------|-----|
| Build on your PC (no EAS $) | `.\scripts\deploy.ps1 -Platform android -Environment prod -Local` |
| Build on your Mac (iOS)      | `.\scripts\deploy.ps1 -Platform ios -Environment prod -Local` |
| Trigger GH Actions build    | GitHub UI: Actions → Run workflow, or CLI: `gh workflow run "Build Android (EAS local)"` |
| Get the built file from CI  | Actions → workflow → run → **Artifacts** → download |
