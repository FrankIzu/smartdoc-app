# Backend: App config (min supported version)

The mobile app calls **GET /api/app-config** (no auth) to decide if the user must update from the store.  
Store the minimum supported version in **Render environment variables** and expose them via this endpoint.

**Implementation:** `manager-francis/backend/app.py` — route `@app.route('/api/app-config', methods=['GET'])` reads from `os.environ` and returns the JSON below.

## Render environment variables

Add these in your Render service → Environment:

| Variable | Example | Description |
|----------|---------|-------------|
| `LATEST_APP_VERSION` | `1.0.7` | Latest semver; also used as **min supported** (iOS and Android semver gate) when `MIN_SUPPORTED_APP_VERSION` is not set. **Set by deploy.ps1**. |
| `LATEST_APP_VERSION_CODE_ANDROID` | `47` | Android versionCode from app.json; used as **min versionCode** when `MIN_SUPPORTED_VERSION_CODE_ANDROID` is not set so Android updates are enforced by versionCode. **Set by deploy.ps1** from app.json on production deploy. |
| `UPDATE_REASON` | `feature` | `security` \| `breaking` \| `feature`. **Set by deploy.ps1**. |
| `MIN_SUPPORTED_APP_VERSION` | `1.0.6` | Optional override. If not set, backend uses `LATEST_APP_VERSION` as min. |
| `MIN_SUPPORTED_VERSION_CODE_ANDROID` | `32` | Optional override. If not set, backend uses `LATEST_APP_VERSION_CODE_ANDROID` as min Android versionCode. |
| `MIN_SUPPORTED_BUILD_IOS` | `2` | Optional; app uses only semver for iOS, so not needed. |

You do **not** maintain any MIN_* in Render. deploy.ps1 updates **LATEST_APP_VERSION**, **LATEST_APP_VERSION_CODE_ANDROID** (from app.json), and **UPDATE_REASON**; the backend derives min supported from these.

## How deploy.ps1 ties in

When you run `.\scripts\deploy.ps1` for a production deploy, it automatically:

1. Updates `app.versions.json` with the new version and build number
2. Calls `Update-RenderAppConfig`, which updates `manager-francis/render.yaml` with `LATEST_APP_VERSION`, `LATEST_APP_VERSION_CODE_ANDROID`, and `UPDATE_REASON`
3. When Render deploys the backend, these env vars are set
4. The backend reads them and returns the app-config JSON

**No manual steps needed** — deploy.ps1 keeps the backend in sync with each mobile release.

## Response shape

**GET /api/app-config** must return JSON:

```json
{
  "minSupportedVersion": "1.0.6",
  "minSupportedBuildNumber": 2,
  "minSupportedVersionCode": 32,
  "latestVersion": "1.0.7",
  "storeUrls": { "ios": "...", "android": "..." },
  "updateReason": "feature"
}
```

- **`latestVersion`** (required for soft update banner): Must come from `LATEST_APP_VERSION` env var. Without it, the mobile soft update banner will never show.
- **`storeUrls`**, **`updateReason`**: Used for "Update" button and update reason.

- Omit any field you don’t use (e.g. only `minSupportedVersion`).
- **iOS:** The app compares only `version` (semver) to `minSupportedVersion`; iOS build number is not used.
- **Android:** The app compares `version` (semver) and, if set, `versionCode` to `minSupportedVersionCode`. Shows full-screen "Update required" with store link when behind.

## Backend implementation

The app-config route must include `latestVersion` in the response so the mobile soft update banner works. Add to the route:

```python
latest_version = os.environ.get('LATEST_APP_VERSION', '').strip()
response['latestVersion'] = latest_version if latest_version else None
```

The Flask backend in `manager-francis/backend/app.py` implements this route. **Without `latestVersion` in the response, the mobile app's soft update banner will never show.**
