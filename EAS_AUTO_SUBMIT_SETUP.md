# Auto-submit to App Store / Play Store from GitHub Actions

After a successful build, the workflow runs **EAS Submit** to upload the IPA/AAB to the store. The submit steps are already in `.github/workflows/build-android.yml` and `build-ios.yml`; they run only when the right secrets are set. **Add the secrets below** and the next build will submit automatically.

---

## 1. Android (Google Play)

### 1.1 Create a Google Play service account

1. Open [Google Play Console](https://play.google.com/console) → your app (or All apps).
2. Go to **Setup** → **API access** (or **Users and permissions** → **API access**).
3. If needed, link a Google Cloud project, then **Create new service account** (or use existing). Follow the link to Google Cloud Console.
4. In Google Cloud Console: create a service account (e.g. name “GitHub Actions”). Skip granting roles there; we only need the key.
5. Create a **JSON key** for that service account (Keys → Add key → JSON). Download the JSON file.
6. Back in Play Console → **API access**: find the service account and **Grant access** (or **Invite user**). Give it at least:
   - **Release to production, exclude devices, and use Play App Signing** (or **Release apps to production**), or
   - **Release to testing** if you only want internal/testing.
7. Accept the invite in the service account’s email if needed.

### 1.2 Add secret in GitHub

1. Repo → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**.
3. Name: **`ANDROID_SERVICE_ACCOUNT_JSON`** (must match the workflow).
4. Value: paste the **entire contents** of the JSON key file (one line is fine).

The workflow writes this to a temp file and passes it to `eas submit`. Do not commit the JSON file.

---

## 2. iOS (App Store Connect)

You can use either **App Store Connect API key** (recommended) or **Apple ID + app-specific password**.

### Option A: App Store Connect API key (recommended)

1. Go to [App Store Connect](https://appstoreconnect.apple.com) → **Users and Access** → **Integrations** → **App Store Connect API** (or **Keys**).
2. Create a key with role **Admin** or **App Manager** (and **Developer** if you need to submit).
3. Download the `.p8` key **once** (you can’t download it again). Note:
   - **Key ID** (e.g. `ABC123XYZ`)
   - **Issuer ID** (top of the App Store Connect API page)
   - **Key file** (`.p8`)
4. In GitHub → **Settings** → **Secrets and variables** → **Actions**, add three secrets:

   | Secret name       | Value                          |
   |-------------------|--------------------------------|
   | `ASC_KEY_ID`      | Key ID (e.g. `ABC123XYZ`)      |
   | `ASC_ISSUER_ID`   | Issuer ID (UUID)               |
   | `ASC_KEY_P8_BASE64` | Base64 of the `.p8` file content (see below) |

   To get base64 of the key (PowerShell):

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_ABC123XYZ.p8"))
   ```

   Or (Bash):

   ```bash
   base64 -i AuthKey_ABC123XYZ.p8 | tr -d '\n'
   ```

   Paste the output into the `ASC_KEY_P8_BASE64` secret.

Your **eas.json** already has `submit.production.ios.appleId`, `ascAppId`, and `appleTeamId`; with the API key, EAS can submit without an app-specific password.

### Option B: Apple ID + app-specific password

1. Go to [appleid.apple.com](https://appleid.apple.com) → **Sign-In and Security** → **App-Specific Passwords**.
2. Create a new app-specific password (e.g. “EAS GitHub Actions”). Copy the password.
3. In GitHub Actions secrets, add:
   - **`EXPO_APPLE_APP_SPECIFIC_PASSWORD`** = the app-specific password.

Your **eas.json** already has `appleId`; EAS will use that + this password for submit. No ASC key secrets needed.

---

## 3. Enabling auto-submit in the workflows

- **Android:** The workflow runs submit when the secret **`ANDROID_SERVICE_ACCOUNT_JSON`** is present. If the secret is missing, the submit step is skipped.
- **iOS:** The workflow runs submit when **either** the API key set (**`ASC_KEY_ID`**, **`ASC_ISSUER_ID`**, **`ASC_KEY_P8_BASE64`**) **or** **`EXPO_APPLE_APP_SPECIFIC_PASSWORD`** is present. If none are set, the submit step is skipped.

So: add the secrets for the store(s) you want, and the next build run will submit after a successful build. No code change needed once the workflow steps are in place.

---

## 4. What the workflow does

- **Android:** After “Upload Android artifact”, it writes the secret to a temp JSON file and runs:
  `eas submit --platform android --path <path-to-.aab> --non-interactive --track <play_track>`
  with the service account key path set to that file. The **Play track** workflow input (default **production**) chooses the release track; use **internal** if production fails with "Precondition check failed".
- **iOS:** After “Upload iOS artifact”, it either:
  - Writes the base64-decoded `.p8` to a temp file and runs submit with `--asc-api-key-path`, **or**
  - Uses `EXPO_APPLE_APP_SPECIFIC_PASSWORD` and the existing **eas.json** Apple ID config.

The built file path is whatever EAS local leaves in the workspace (e.g. `*.ipa` / `*.aab` in the project root or the path EAS prints).

---

## 5. Android: "Precondition check failed" (Google Play)

If the workflow fails with **`Google Api Error: Invalid request - Precondition check failed`** when submitting to the **production** track, try:

1. **Submit to internal testing first**  
   When running the **Build Android** workflow, set the input **Play track** to **`internal`** instead of **`production`**. After the build succeeds and is on the internal track, you can promote it to production from Play Console, or switch back to **`production`** for the next run.

2. **Check service account permissions**  
   In Play Console → **Users and permissions** → **API access** → your service account: ensure it has at least **Release to production** (or **Release apps to production**). For internal-only use, **Release to testing** is enough.

3. **Check app and track setup**  
   - The app must exist in Play Console and have completed required setup (e.g. store listing, content rating, privacy policy if required).  
   - If this is the first release, the production track may not be ready until you’ve done at least one release (e.g. to internal), so prefer **Play track: internal** for the first submission.

4. **Confirm package name**  
   The **package** in your app (e.g. `com.grabdocs.mobile`) must match the app created in Play Console.

---

## 6. Security

- Never commit the Android JSON key or the `.p8` file.
- Use the minimum Play Console permissions needed for the service account.
- Prefer App Store Connect API key over app-specific password so you can revoke the key without changing your Apple ID password.
