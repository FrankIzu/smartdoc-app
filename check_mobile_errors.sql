-- Query to check recent mobile errors from error_logs table
-- Run this in your database client (pgAdmin, DBeaver, etc.)

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
    notes,
    error_traceback
FROM error_logs 
WHERE environment LIKE 'mobile-%' 
    AND created_at >= NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC 
LIMIT 20;

-- For more details on a specific error, use:
-- SELECT * FROM error_logs WHERE id = <error_id>;


