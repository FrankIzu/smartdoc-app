# Optimization & N+1 Review

Summary of findings and fixes from a codebase review for optimization and N+1 issues.

---

## Fixes applied

### 1. ChatGD chat history (already done earlier)
- **GET /api/v1/mobile/chat/history** (list): Was returning full `conversation_data` for every chat → now returns only last message per chat (lightweight list). Single-chat **GET /api/v1/mobile/chat/history/<id>** added for opening a conversation with full messages.
- **fetchChatConversation(id)** in app: Now calls `getChatConversation(id)` (single-chat endpoint) first instead of loading full history list and finding match.

### 2. Analytics dashboard – oversized requests
- **File:** `app/analytics/dashboard.tsx`
- **Issue:** `getDocuments(1, 10000, ...)` for receipts and again for invoices. Requesting 10,000 items is unnecessary for “recent” lists and the backend caps `per_page` at 100 anyway.
- **Fix:** Changed to `getDocuments(1, 100, ...)` for both receipts and invoices fallback. If more than 100 are needed, add pagination.

### 3. Dashboard stats fallback – wrong total and over-fetch
- **File:** `app/(tabs)/index.tsx`
- **Issue:** When dashboard stats API failed, fallback called `getFiles()` (default 20 items) and used `response.data.length` as `totalDocuments`, which underreported and fetched 20 files unnecessarily.
- **Fix:** Fallback now calls `getFiles(1, 1)` and uses `pagination.total` for document count so the total is correct with minimal data transfer.

### 4. getDrafts – over-fetch and client-side filter
- **File:** `services/api.ts` + backend `mobile_routes.py`
- **Issue:** `getDrafts()` called `getFiles(1, 200)` and filtered client-side to drafts, fetching up to 200 files when only drafts are needed.
- **Fix:** Backend mobile GET `/files` now accepts optional `category` (maps to `file_kind`). `getDrafts()` now calls `getFiles(1, 100, undefined, 'Draft')` so the server returns only drafts; client still filters as safeguard.

---

## Already optimized (no change needed)

Backend already uses batch/eager loading in many places:

- **Bookmarks:** Batch file counts (`BookmarkFile.bookmark_id.in_()`), `joinedload(BookmarkFile.bookmark)` / `joinedload(BookmarkFile.file)` where needed.
- **Workspaces:** `joinedload(WorkspaceMember.user)`, batch member counts, `load_only` for columns.
- **User chats:** `joinedload(UserChatParticipant.chat).selectinload(UserChat.participants).joinedload(UserChatParticipant.user)`, batch latest messages and unread counts.
- **User chat messages:** `joinedload(UserChatMessage.sender)`.
- **Forms:** Batch load templates by ID to avoid N+1.
- **Video/meetings:** Batch load sessions, participants, recordings, transcripts, files; `joinedload(VideoCall.creator)` and similar.

---

## Optional / future improvements

### 1. GET /api/v1/mobile/chats (AI chat list alternate)
- **File:** `manager-francis/backend/routes/mobile_routes.py` – `mobile_get_chats()`
- **Issue:** Loads full `conversation_data` from DB for every row (same over-fetch as the old chat history list), but only uses last message in the response.
- **Note:** The app uses **GET /api/v1/mobile/chat/history** for the ChatGD list (via `getChatHistory()`), not **GET /chats**. If something else calls **GET /chats**, consider applying the same “lightweight list + last message only” approach as for **GET /chat/history** (or reuse that endpoint).

### 2. Count + list as one query (minor)
- **Pattern:** Several endpoints run `count()` and then the main query (e.g. chat history, bookmarks).
- **Option:** For list endpoints, “has_more” can be inferred by fetching `limit + 1` rows and returning only `limit`, avoiding a separate count when exact total is not required.

### 3. Analysis dashboard backend – many separate count() queries
- **File:** `manager-francis/backend/routes/mobile_routes.py` – `mobile_analysis_dashboard` (around line 3650).
- **Issue:** Runs 8+ separate DB queries: total_files, total_drafts, today_uploads, week_uploads, month_uploads, file_types, file_categories, recent_files, total_storage.
- **Option:** Combine into 2–3 queries using conditional aggregation (e.g. one with CASE WHEN for time-bucketed counts, one for file_types/file_categories, one for recent_activity and sum).

### 4. ChatGD screen – parallel vs. waterfall
- **File:** `app/(tabs)/chats.tsx`
- **Current:** `Promise.all([loadUserProfile, loadChats, loadFavorites, loadWorkspaces, loadDocuments, loadUsers, loadBookmarks])` – 7 requests in parallel. Good.
- **Note:** `loadChats()` internally does `fetchChatHistories()` + `getChats()` (user chats). Still only 2 calls; no change needed unless you add request coalescing later.

### 5. Documents list caching (no change)
- **File:** `app/(tabs)/documents.tsx`
- **Current:** Cache with `CACHE_DURATION`, `apiCache`, and focus-based refresh. Looks reasonable; ensure `lastUploadTime` and focus effect don’t refresh too often.

---

## N+1 patterns to avoid

When adding or changing backend list endpoints:

1. **Loop + relationship access:** If you loop over `items` and use `item.relation` (e.g. `item.user`, `item.workspace`), use `joinedload()` or `selectinload()` on the main query so each access doesn’t trigger a query.
2. **Loop + per-item query:** If you loop and run a query per item (e.g. “file count per bookmark”), batch it: one query with ` .filter(BookmarkFile.bookmark_id.in_(ids)).group_by(...)` and then use a map in the loop.
3. **Large JSON in list:** For list endpoints, avoid returning huge columns (e.g. full `conversation_data`). Return only what the list UI needs (e.g. last message or a small preview) and use a separate “get by id” endpoint for full detail.

---

## Summary

| Area              | Status | Action taken / note |
|-------------------|--------|----------------------|
| Chat history list | Fixed  | Lightweight list + single-chat endpoint; store uses new API. |
| Analytics dashboard | Fixed | getDocuments limit 10000 → 100 for receipts/invoices. |
| Dashboard stats fallback | Fixed | getFiles(1,1) + pagination.total for document count. |
| getDrafts | Fixed | Backend category filter; getFiles(1, 100, undefined, 'Draft'). |
| Bookmarks         | OK     | Batch file counts, eager load where needed. |
| User chats        | OK     | Eager load participants, batch messages/unread. |
| Workspaces        | OK     | Eager load, batch counts, load_only. |
| GET /chats (AI)   | Optional | Same over-fetch as old history list; optimize if endpoint is used. |
| Count + list      | Optional | Use limit+1 for “has_more” to avoid extra count query. |
