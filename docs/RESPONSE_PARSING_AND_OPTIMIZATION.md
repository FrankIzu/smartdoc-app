# Response Parsing & Optimization Audit

## Summary

Audit of response format mismatches (similar to `workspace-users`), N+1 risks, and load-time optimizations across the mobile app.

---

## 1. Response Parsing Issues (Fixed / Verified)

### ✅ Fixed: `workspace-users` (chats.tsx)

**Issue:** Backend returns `{ data: { users: [...] } }` but client checked `response.users` and `response.data` (as array). This caused `usersCount: 0` and triggered Strategy 2 (7 parallel `getWorkspaceMembers` calls), overloading the backend.

**Fix:** Parse `response.data.users` first in `loadUsers()`.

### ✅ Hardened: Strategy 3 fallback `searchUsersForChat` (chats.tsx)

**Issue:** Fallback only checked `response.users` and `response.data` (array). If backend ever returns `{ data: { users: [...] } }`, it would fail.

**Fix:** Added `response.data.users` parsing so all common response shapes are handled.

---

### ✅ Verified: Other endpoints

| Endpoint | Backend returns | Client expects | Status |
|----------|-----------------|----------------|--------|
| **workspaces** | `{ data: [...] }` (array) | `response.data` or `response.data.workspaces` | OK |
| **bookmarks** | `{ data: [...] }` (array) | `response.data` or `response.data.bookmarks` | OK |
| **workspace members** | `{ data: { members, invitations } }` | `response.data.members` | OK |
| **documents/files** | `{ success, data: [...], files: [...] }` | `response.files` or `response.data` | OK |
| **chats/messages** | `{ success, messages: [...] }` | `response.messages` | OK |

---

## 2. Frontend Optimizations Applied

### Workspace request deduplication (chats.tsx)

When `loadUsers` runs Strategy 2 (fallback) and workspaces are not in state yet, it now **reuses** `workspaceRequestRef.current` if `loadWorkspaces` is already in flight, instead of calling `getMobileWorkspaces()` again. This avoids duplicate workspace fetches when both run in parallel.

---

## 3. Backend Optimizations (Already Present)

The backend already uses:

- **Batch loading** for workspace member counts (no N+1)
- **Batch loading** for bookmark file counts (no N+1)
- **Batch loading** for workspace members (users loaded via `User.id.in_(user_ids)`)
- **load_only** on User/Workspace to avoid loading JSON columns
- **Pagination** on workspaces, bookmarks, workspace members

---

## 4. Remaining Backend Optimization Opportunities

If load times are still slow, consider:

### Mobile files endpoint (`GET /api/v1/mobile/files`)

- Uses complex unions and subqueries for FileWorkspaceVisibility, InternalFileShare, etc.
- Consider caching accessible workspace IDs per user
- Add indexes on `File.workspace_id`, `FileWorkspaceVisibility.workspace_id`, `InternalFileShare.workspace_id`

### Workspace members endpoint (`GET /api/v1/mobile/workspaces/<id>/members`)

- Already batched; if still slow, check:
  - Index on `WorkspaceMember(workspace_id, user_id)`
  - Index on `WorkspaceInvitation(workspace_id)`

### Workspace-users endpoint (`GET /api/v1/mobile/workspace-users`)

- Single optimized query with `load_only`; should be fast
- If slow, add index on `WorkspaceMember(user_id, workspace_id)`

### Bookmarks endpoint (`GET /api/v1/mobile/bookmarks`)

- Already uses batch file count; likely fine
- Index on `Bookmark(user_id, company_id, is_active)`

---

## 5. Load Sequence (Chats Tab)

The chats tab runs in parallel:

- `loadChats()`
- `loadWorkspaces()`
- `loadDocuments()`
- `loadUsers()`
- `loadBookmarks()`

With the `workspace-users` fix, `loadUsers` should usually succeed on the first try and avoid Strategy 2. When Strategy 2 does run, it now reuses the workspace request when possible.

---

## 6. Strategy 2 Fallback (When workspace-users Returns Empty)

If `getWorkspaceUsers` returns 0 users (e.g. new user, or backend issue), Strategy 2:

1. Fetches workspaces (or reuses in-flight request)
2. Calls `getWorkspaceMembers(workspace.id)` for each workspace in parallel

The 5-second `Promise.race` per workspace prevents one slow workspace from blocking the whole load. If the backend is consistently slow, focus on backend performance rather than increasing this timeout.
