# How to Check Mobile Errors in Database

Since the `/api/v1/mobile/error-log` endpoint returns 405 (not deployed yet), and DATABASE_URL isn't set locally, here are your options:

## Option 1: Query Production Database Directly (RECOMMENDED)

Connect to your production PostgreSQL database and run:

```sql
SELECT 
    id,
    error_type,
    LEFT(error_message, 200) as error_message,
    severity,
    environment,
    request_data->>'platform' as platform,
    request_data->>'screenName' as screen_name,
    request_data->>'userAction' as user_action,
    request_data->>'appVersion' as app_version,
    user_id,
    created_at,
    notes
FROM error_logs 
WHERE environment LIKE 'mobile-%' 
    AND created_at >= NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC 
LIMIT 20;
```

**Look for errors with:**
- `error_type` containing `HMSInitializationTimeout`
- `error_type` containing `HMSTokenGenerationFailed`
- `error_type` containing `HMSPermissionsDenied`
- `screenName` = `HMSMeetingInterface`

## Option 2: Check via API (After Deployment)

Once the `/api/v1/mobile/error-logs` endpoint is deployed, you can query via:

```bash
curl "https://api.grabdocs.com/api/v1/mobile/error-logs?limit=20&platform=ios&hours=2"
```

## Option 3: Check Backend Logs

The backend logs at `api.grabdocs.com` might show the errors being logged. Look for:
- Lines containing `Mobile error logged: ID`
- Lines with `[Mobile-IOS]` or `[Mobile-ANDROID]`

## What to Look For

The "Initializing 100ms Prebuilt Interface..." hang is likely caused by one of these:

1. **Permissions Denied** - Check for `HMSPermissionsDenied` errors
2. **Token Generation Failed** - Check for `HMSTokenGenerationFailed` errors  
3. **HMS Timeout** - Check for `HMSInitializationTimeout` errors (after 15 seconds)
4. **HMS Join Diagnostic** - Check for `HMSJoinDiagnostic` errors with diagnostic info

## Expected Diagnostic Log

You should see a "warning" level error with:
- `error_type`: `[Mobile-IOS] HMSJoinDiagnostic`
- `screenName`: `HMSMeetingInterface`
- `userAction`: `HMS Join Attempt`

This log contains all the diagnostic information (token length, room ID, permissions status, etc.) that was captured when you tried to join.

## Run the Query

Please run the SQL query above in your database client and share the results, especially:
- The `error_type`
- The `error_message`  
- The `notes` field
- Any `error_traceback`

This will tell us exactly why the HMS initialization is hanging.


