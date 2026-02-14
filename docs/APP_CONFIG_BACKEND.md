# Backend: App config (min supported version)

The mobile app calls **GET /api/app-config** (no auth) to decide if the user must update from the store.  
Store the minimum supported version in **Render environment variables** and expose them via this endpoint.

**Implementation:** `manager-francis/backend/app.py` — route `@app.route('/api/app-config', methods=['GET'])` reads from `os.environ` and returns the JSON below.

## Render environment variables

Add these in your Render service → Environment:

| Variable | Example | Description |
|----------|---------|-------------|
| `MIN_SUPPORTED_APP_VERSION` | `1.0.6` | Semver; app version below this → "Update required". **iOS uses only this** (build number is not checked). |
| `MIN_SUPPORTED_BUILD_IOS` | `2` | Optional; **not used by the app** (iOS gate is version-only). Kept for reference or future use. |
| `MIN_SUPPORTED_VERSION_CODE_ANDROID` | `32` | (Optional) Android versionCode; app below → "Update required" |
| `LATEST_APP_VERSION` | `1.0.7` | Latest version for soft update prompts. **Set by deploy.ps1** on production deploy. |
| `UPDATE_REASON` | `feature` | `security` \| `breaking` \| `feature`. Defaults to `feature` if empty. **Set by deploy.ps1**. |

You can use only `MIN_SUPPORTED_APP_VERSION`, or add the build/code fields for stricter control. `LATEST_APP_VERSION` and `UPDATE_REASON` are updated automatically when running `scripts/deploy.ps1` for production.

## Response shape

**GET /api/app-config** must return JSON:

```json
{
  "minSupportedVersion": "1.0.6",
  "minSupportedBuildNumber": 2,
  "minSupportedVersionCode": 32
}
```

- Omit any field you don’t use (e.g. only `minSupportedVersion`).
- **iOS:** The app compares only `version` (semver) to `minSupportedVersion`; iOS build number is not used.
- **Android:** The app compares `version` (semver) and, if set, `versionCode` to `minSupportedVersionCode`. Shows full-screen "Update required" with store link when behind.

The Flask backend in `manager-francis/backend/app.py` already implements this route; it reads the same env vars and returns the JSON above. Change the minimum anytime in Render → Environment; no app release needed.
