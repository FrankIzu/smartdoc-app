# Required Database Indexes for Performance Optimization

## Critical Indexes Needed

These indexes are **REQUIRED** for the optimized endpoints to perform well. Without them, the database will do full table scans which will cause timeouts.

### File Table Indexes

```sql
-- For ordering by created_at (used in all file queries)
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);

-- For filtering by user_id (user's own files)
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);

-- For filtering by workspace_id (workspace files)
CREATE INDEX IF NOT EXISTS idx_files_workspace_id ON files(workspace_id);

-- For company isolation
CREATE INDEX IF NOT EXISTS idx_files_company_id ON files(company_id);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_files_workspace_deleted ON files(workspace_id, is_deleted) WHERE is_deleted = false;
```

### FileWorkspaceVisibility Table Indexes

```sql
-- For joining files with workspace visibility
CREATE INDEX IF NOT EXISTS idx_fwv_file_id ON file_workspace_visibility(file_id);

-- For filtering by workspace
CREATE INDEX IF NOT EXISTS idx_fwv_workspace_id ON file_workspace_visibility(workspace_id);

-- Composite index for workspace visibility queries
CREATE INDEX IF NOT EXISTS idx_fwv_workspace_file ON file_workspace_visibility(workspace_id, file_id);
```

### WorkspaceMember Table Indexes

```sql
-- For finding user's workspaces
CREATE INDEX IF NOT EXISTS idx_workspace_member_user_id ON workspace_member(user_id);

-- For finding workspace members
CREATE INDEX IF NOT EXISTS idx_workspace_member_workspace_id ON workspace_member(workspace_id);

-- Composite index for user-workspace lookups
CREATE INDEX IF NOT EXISTS idx_workspace_member_user_workspace ON workspace_member(user_id, workspace_id);
```

### Workspace Table Indexes

```sql
-- For finding workspaces owned by user
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON workspaces(owner_id);
```

## How to Apply

### PostgreSQL

Run these SQL commands in your database:

```sql
-- Connect to your database
\c your_database_name

-- Run all the CREATE INDEX commands above
```

### MySQL

```sql
USE your_database_name;

-- Run all the CREATE INDEX commands above
```

### Via Flask-Migrate (Recommended)

If you're using Flask-Migrate, create a new migration:

```bash
flask db migrate -m "Add performance indexes for files and workspace queries"
flask db upgrade
```

Then edit the migration file to include all the indexes above.

## Verification

After creating indexes, verify they exist:

### PostgreSQL
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('files', 'file_workspace_visibility', 'workspace_member', 'workspaces')
ORDER BY tablename, indexname;
```

### MySQL
```sql
SHOW INDEXES FROM files;
SHOW INDEXES FROM file_workspace_visibility;
SHOW INDEXES FROM workspace_member;
SHOW INDEXES FROM workspaces;
```

## Performance Impact

**Before indexes:**
- Files endpoint: 30+ seconds (timeout)
- Workspace users endpoint: 30+ seconds (timeout)

**After indexes (expected):**
- Files endpoint: < 300ms
- Workspace users endpoint: < 200ms

## Notes

- Indexes will slightly slow down INSERT/UPDATE operations, but the performance gain on SELECT queries is massive
- The `IF NOT EXISTS` clause prevents errors if indexes already exist
- Partial indexes (WHERE clause) are PostgreSQL-specific - adjust for MySQL if needed
