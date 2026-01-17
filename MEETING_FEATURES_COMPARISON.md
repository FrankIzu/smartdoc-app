# Meeting Features: Web vs Mobile Implementation Comparison

## Overview
This document compares the meeting features available in the **Web** and **Mobile** implementations of GrabDocs.

---

## Feature Comparison Table

| Feature Category | Feature | Web Implementation | Mobile Implementation | Notes |
|-----------------|---------|-------------------|----------------------|-------|
| **Meeting Creation** | Instant Meeting | ✅ `/api/v1/video/room/create` | ✅ `/api/v1/mobile/meetings/create` | Both create meetings, mobile has simplified endpoint |
| | Scheduled Meeting | ✅ `/api/v1/video/room/schedule` | ✅ `/api/v1/mobile/meetings/schedule` | Both support scheduling with participants |
| | Meeting Templates | ✅ `/api/v1/video/room/templates` | ❌ Not Available | Web-only feature |
| | Fast Start Scheduled | ✅ `/api/v1/video/room/schedule/start` | ❌ Not Available | Web-only optimized start |
| **Meeting Joining** | Join by Room ID | ✅ `/api/v1/video/room/<id>/join` | ❌ Not Available | Web uses database room ID |
| | Join by Meeting ID | ✅ `/api/v1/video/room/join-by-id` | ✅ `/api/v1/mobile/meetings/join` | **Mobile proxies to web endpoint** - ensures ActiveParticipant table updated |
| | Check Requirements | ✅ `/api/v1/video/room/check-requirements` | ❌ Not Available | Web-only passcode check |
| | HMS Token Generation | ✅ Built into join endpoints | ✅ `/api/v1/mobile/meetings/hms-token` | Mobile has separate token endpoint |
| **Meeting Management** | Get Meetings List | ✅ `/api/v1/video/rooms` | ✅ `/api/v1/mobile/meetings` | Both return user's meetings |
| | Get Active Meetings | ✅ `/api/v1/video/rooms/active` | ❌ Not Available | Web-only active meeting check |
| | Get Meeting Info | ✅ `/api/v1/video/room/<id>` | ❌ Not Available | Web-only detailed info |
| | Update Scheduled Meeting | ✅ `/api/v1/video/room/<id>/update-schedule` | ❌ Not Available | Web-only feature |
| | Delete Meeting | ✅ `/api/v1/video/room/<id>/delete` | ✅ `/api/v1/mobile/meetings/<id>` | Both support deletion |
| | Delete Confirmed | ✅ `/api/v1/video/room/<id>/delete-confirmed` | ✅ Uses web endpoint | Mobile calls web endpoint |
| | End Meeting | ✅ `/api/v1/video/room/<id>/end` | ✅ Uses web endpoint | Mobile calls web endpoint directly |
| | Leave Meeting | ✅ `/api/v1/video/room/<id>/leave` | ❌ Not Available | **Mobile should use web endpoint** |
| **Participant Management** | Get Participants | ✅ `/api/v1/video/room/<id>/participants` | ❌ Not Available | Web-only feature |
| | Remove Participant | ✅ `/api/v1/video/room/<id>/participants/<id>/remove` | ❌ Not Available | Web-only feature |
| | Reinvite Participant | ✅ `/api/v1/video/room/<id>/participants/<id>/reinvite` | ❌ Not Available | Web-only feature |
| | Reinvite by Email | ✅ `/api/v1/video/room/<id>/reinvite` | ❌ Not Available | Web-only feature |
| | Transfer Host | ✅ `/api/v1/video/room/<id>/transfer-host` | ❌ Not Available | Web-only feature |
| | Make Guest Host | ✅ `/api/v1/video/room/<id>/make-host` | ❌ Not Available | Web-only multi-host feature |
| | Remove Host | ✅ `/api/v1/video/room/<id>/remove-host` | ❌ Not Available | Web-only feature |
| | Check Host Status | ✅ `/api/v1/video/room/<id>/host-status` | ❌ Not Available | Web-only feature |
| | Check Participant | ✅ `/api/v1/video/room/<id>/check-participant` | ❌ Not Available | Web-only feature |
| | Participant Heartbeat | ✅ `/api/v1/video/room/<id>/heartbeat` | ❌ Not Available | Web-only keep-alive |
| **Join Requests** | Get Join Requests | ✅ `/api/v1/video/room/<id>/join-requests` | ❌ Not Available | Web-only feature |
| | Approve Join Request | ✅ `/api/v1/video/room/<id>/join-requests/<id>/approve` | ❌ Not Available | Web-only feature |
| | Reject Join Request | ✅ `/api/v1/video/room/<id>/join-requests/<id>/reject` | ❌ Not Available | Web-only feature |
| | Bulk Join Request Action | ✅ `/api/v1/video/room/<id>/join-requests/<id>/bulk-action` | ❌ Not Available | Web-only feature |
| **Invitations** | Send Invitation | ✅ `/api/v1/video/room/<id>/invite` | ✅ `/api/v1/mobile/meetings/<id>/invite` | Both support email invitations |
| | Get Invite Link | ✅ `/api/v1/video/room/<id>/invite-link` | ❌ Not Available | Web-only feature |
| | Copy Invite Link | ✅ `/api/v1/video/room/<id>/copy-invite` | ❌ Not Available | Web-only feature |
| | Remove Invited Participant | ✅ `/api/v1/video/room/<id>/invited-participant` | ❌ Not Available | Web-only feature |
| | Get Invited Meetings | ✅ `/api/v1/video/invited-meetings` | ❌ Not Available | Web-only feature |
| **Meeting Assets** | Get Meeting Assets | ✅ `/api/v1/video/meeting-assets` | ✅ `/api/v1/mobile/meeting-assets` | Both return recordings, transcripts, etc. |
| | Delete Meeting Assets | ✅ `/api/v1/video/room/<id>/delete-assets` | ✅ Uses web endpoint | Mobile calls web endpoint |
| | Get Transcript | ✅ Via meeting-assets | ✅ `/api/v1/mobile/meetings/<id>/transcript` | Mobile has dedicated endpoint |
| | Get Summary | ✅ Via meeting-assets | ✅ `/api/v1/mobile/meetings/<id>/summary` | Mobile has dedicated endpoint |
| | Get Chat | ✅ `/api/v1/video/room/<id>/chat` | ✅ `/api/v1/mobile/meetings/<id>/chat` | Both support meeting chat |
| | Get Chat Messages | ✅ `/api/v1/video/room/<id>/chat/messages` | ❌ Not Available | Web-only detailed chat |
| | Post Chat Message | ✅ `/api/v1/video/room/<id>/chat/messages` | ❌ Not Available | Web-only feature |
| | Get Report | ✅ `/api/v1/video/room/<id>/report` | ✅ `/api/v1/mobile/meetings/<id>/report` | Both support reports |
| | Download Report | ✅ `/api/v1/video/room/<id>/report/download` | ✅ `/api/v1/mobile/meetings/<id>/download/<type>` | Both support downloads |
| | Check Missing Assets | ✅ `/api/v1/video/room/<id>/check-missing-assets` | ❌ Not Available | Web-only admin feature |
| | Reprocess Assets | ✅ `/api/v1/video/room/<id>/reprocess-assets` | ❌ Not Available | Web-only admin feature |
| | Debug Summary | ✅ `/api/v1/video/room/<id>/debug-summary` | ❌ Not Available | Web-only admin feature |
| | Generate Report | ✅ `/api/v1/video/room/<id>/generate-report` | ❌ Not Available | Web-only admin feature |
| **Streaming** | Start HLS Stream | ✅ `/api/v1/video/stream/<id>/start` | ❌ Not Available | Web-only streaming |
| | Stop HLS Stream | ✅ `/api/v1/video/stream/<id>/stop` | ❌ Not Available | Web-only streaming |
| | Get Stream Status | ✅ `/api/v1/video/stream/<id>/status` | ❌ Not Available | Web-only streaming |
| | Start Streaming Meeting | ✅ `/api/v1/video/stream/<id>/start-streaming` | ❌ Not Available | Web-only streaming |
| | Get Streaming Status | ✅ `/api/v1/video/room/<id>/streaming-status` | ❌ Not Available | Web-only streaming |
| **Analytics & Reports** | Enhanced Analytics | ✅ `/api/v1/video/room/<id>/analytics/enhanced` | ❌ Not Available | Web-only feature |
| | Get Recording Status | ✅ `/api/v1/video/room/<id>/recording-status` | ❌ Not Available | Web-only feature |
| **SIP Integration** | Get SIP Dial-In Info | ✅ `/api/v1/video/room/<id>/sip/dial-in-info` | ❌ Not Available | Web-only feature |
| | Get SIP Room Code | ✅ `/api/v1/video/room/<id>/sip/room-code` | ❌ Not Available | Web-only feature |
| **Workspace Features** | Toggle Workspace Share | ✅ `/api/v1/video/meeting/<id>/toggle-workspace-share` | ❌ Not Available | Web-only feature |
| **ActiveParticipant Management** | Update on Join | ✅ Automatic via join endpoints | ✅ **Proxies to web endpoint** | Mobile ensures same behavior |
| | Clear on Leave | ✅ `/api/v1/video/room/<id>/leave` | ❌ **Should use web endpoint** | Mobile needs to call web leave |
| **Meeting Status** | Get Scheduled Meetings | ✅ `/api/v1/video/room/scheduled` | ❌ Not Available | Web-only feature |
| | Delete Scheduled Meeting | ✅ `/api/v1/video/room/<id>/delete-schedule` | ❌ Not Available | Web-only feature |

---

## Key Differences Summary

### 1. **Endpoint Architecture**
- **Web**: Uses `/api/v1/video/room/...` endpoints with comprehensive features
- **Mobile**: Uses `/api/v1/mobile/meetings/...` endpoints with simplified, essential features
- **Hybrid**: Mobile calls web endpoints for critical operations (join, end, delete) to ensure consistency

### 2. **Meeting Join Implementation**
- **Web**: Direct endpoint `/api/v1/video/room/join-by-id` updates ActiveParticipant table
- **Mobile**: `/api/v1/mobile/meetings/join` **proxies to web endpoint** to ensure ActiveParticipant table is updated identically
- **Result**: Both platforms have identical ActiveParticipant management

### 3. **Feature Completeness**
- **Web**: ~50+ meeting-related endpoints with full feature set
- **Mobile**: ~10 meeting-related endpoints with essential features only
- **Missing in Mobile**: Advanced participant management, streaming, join requests, detailed analytics

### 4. **Meeting Leave**
- **Web**: Has dedicated `/api/v1/video/room/<id>/leave` endpoint that clears ActiveParticipant
- **Mobile**: **Currently missing** - should call web endpoint to ensure ActiveParticipant is cleared

### 5. **HMS Token Generation**
- **Web**: Token generation integrated into join endpoints
- **Mobile**: Separate `/api/v1/mobile/meetings/hms-token` endpoint for token generation
- **Both**: Use same role determination logic (creator_id, meeting_hosts, current_host_id)

### 6. **Meeting Assets**
- **Web**: Comprehensive asset management with admin features
- **Mobile**: Basic asset retrieval with dedicated transcript/summary endpoints
- **Both**: Share same underlying data

### 7. **Participant Management**
- **Web**: Full participant management (add, remove, transfer host, make host, etc.)
- **Mobile**: No participant management features
- **Impact**: Mobile users cannot manage participants during meetings

### 8. **Streaming**
- **Web**: Full HLS streaming support with start/stop/status endpoints
- **Mobile**: No streaming features
- **Impact**: Mobile cannot start/stop streams

### 9. **Join Requests**
- **Web**: Full join request system with approve/reject/bulk actions
- **Mobile**: No join request features
- **Impact**: Mobile cannot manage join requests

### 10. **Analytics & Reporting**
- **Web**: Enhanced analytics, recording status, detailed reports
- **Mobile**: Basic report viewing only
- **Impact**: Mobile has limited analytics visibility

---

## Recommendations

### Critical (Should Implement)
1. **Meeting Leave**: Mobile should call `/api/v1/video/room/<id>/leave` when user leaves to clear ActiveParticipant
2. **Participant List**: Mobile should have basic participant viewing capability

### Nice to Have
3. **Join Requests**: Mobile should support basic join request approval/rejection
4. **Streaming Status**: Mobile should show if meeting is being streamed
5. **Meeting Templates**: Mobile should support meeting templates for quick creation

### Not Critical
6. **Advanced Analytics**: Can remain web-only
7. **SIP Integration**: Can remain web-only
8. **Bulk Operations**: Can remain web-only

---

## Implementation Notes

### ActiveParticipant Table Management
- **Join**: ✅ Mobile proxies to web endpoint - **CONSISTENT**
- **Leave**: ❌ Mobile missing - **SHOULD IMPLEMENT**
- **Heartbeat**: ❌ Mobile missing - **OPTIONAL** (web uses for keep-alive)

### Role Determination
- **Both**: Use same logic (creator_id, meeting_hosts, current_host_id)
- **Result**: Host/guest roles are consistent across platforms

### Database Consistency
- **Join**: ✅ Both update ActiveParticipant via same web endpoint
- **Leave**: ⚠️ Mobile should use web endpoint to ensure consistency
- **Other Operations**: Mobile uses web endpoints for critical operations (end, delete)

---

## Conclusion

The mobile implementation is a **simplified subset** of the web implementation, focusing on essential meeting features. Critical operations (join, end, delete) are handled by proxying to web endpoints to ensure database consistency and identical behavior.

**Key Achievement**: Mobile join now uses the same web endpoint, ensuring ActiveParticipant table is updated identically to web.

**Missing Critical Feature**: Mobile leave functionality should be implemented to call the web leave endpoint.
