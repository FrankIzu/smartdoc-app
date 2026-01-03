# User Chat Real-Time Socket Implementation

## ✅ Implementation Complete

The mobile user chat screen now includes:
1. **Real-time messaging with Socket.IO**
2. **Proper keyboard handling with KeyboardAvoidingView**

## 🔌 Socket.IO Integration

### Installation
```bash
npm install socket.io-client
```

### Features Implemented

#### 1. Socket Connection Management
- Automatic connection on screen mount
- Authentication using stored JWT token
- Automatic reconnection with retry logic
- Connection status indicator

#### 2. Real-Time Events

**Outgoing Events:**
- `join_chat` - Join a chat room when selecting a chat
- `leave_chat` - Leave previous chat room
- `typing` - Notify others when typing
- `stop_typing` - Notify when stopped typing

**Incoming Events:**
- `new_message` - Receive new messages in real-time
- `user_typing` - See when other users are typing
- `connect` - Socket connected successfully
- `disconnect` - Socket disconnected
- `error` - Handle socket errors

#### 3. Message Synchronization
- Messages sent via API also trigger socket events
- Real-time updates to chat list when new messages arrive
- Automatic scroll to bottom when receiving messages
- Deduplication handling (messages from API + socket)

### Socket Implementation Details

```typescript
// Initialize socket with authentication
const socket = io(API_BASE_URL, {
  auth: { token },
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

// Listen for new messages
socket.on('new_message', (data: any) => {
  if (data.chat_id === selectedChat?.id) {
    const newMsg: ChatMessage = {
      id: data.message.id,
      content: data.message.content,
      sender: data.message.sender,
      is_own_message: data.message.sender_id === userProfile?.id,
      created_at: data.message.created_at,
    };
    setMessages(prev => [...prev, newMsg]);
  }
});

// Emit typing indicator
socket.emit('typing', { chatId: selectedChat.id });
```

## ⌨️ Keyboard Handling

### KeyboardAvoidingView Configuration

```typescript
<KeyboardAvoidingView 
  style={{ flex: 1 }}
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
>
  {/* Messages FlatList */}
  {/* Input Container */}
</KeyboardAvoidingView>
```

### Features:
1. **Automatic adjustment** - Input container moves up when keyboard appears
2. **Platform-specific behavior** - Different handling for iOS vs Android
3. **Proper offset** - Accounts for header and status bar height
4. **Auto-scroll** - Messages list scrolls to bottom when keyboard opens

### TextInput Configuration

```typescript
<TextInput
  style={dynamicStyles.messageInput}
  placeholder="Type a message..."
  value={newMessage}
  onChangeText={handleTyping}
  multiline
  maxLength={4000}
/>
```

Features:
- Multiline support for long messages
- Character limit (4000 chars)
- Typing indicator emission on text change
- Auto-resize based on content

## 📱 UI Improvements

### 1. Connection Status Indicator
Shows "Connected" when socket is active, giving users confidence in real-time functionality.

### 2. Sender Name Display
For messages from other users, their username is displayed above the message bubble.

### 3. Auto-Scroll to Bottom
- Scrolls automatically when new messages arrive
- Scrolls when keyboard appears
- Scrolls after sending a message
- Smooth animated scrolling

### 4. Loading States
- Shows ActivityIndicator while sending message
- Disables send button when message is empty or sending

## 🔄 Message Flow

### Sending a Message:
1. User types message (triggers `typing` event)
2. User presses send
3. Emit `stop_typing` event
4. Send via API endpoint
5. Add message to local state
6. Socket broadcasts to all participants
7. Scroll to bottom

### Receiving a Message:
1. Socket receives `new_message` event
2. Check if message belongs to current chat
3. Add message to messages list
4. Update chat in chats list
5. Scroll to bottom

## 🎯 Backend Requirements

The backend needs to implement these socket.io events:

```python
# Socket.IO Events (Backend)
@socketio.on('join_chat')
def handle_join_chat(data):
    chat_id = data['chatId']
    join_room(f'chat_{chat_id}')

@socketio.on('leave_chat')
def handle_leave_chat(data):
    chat_id = data['chatId']
    leave_room(f'chat_{chat_id}')

@socketio.on('typing')
def handle_typing(data):
    emit('user_typing', {
        'chat_id': data['chatId'],
        'user_id': current_user.id,
        'username': current_user.username
    }, room=f'chat_{data["chatId"]}', include_self=False)

# When message is sent via API, also emit:
socketio.emit('new_message', {
    'chat_id': chat_id,
    'message': message_data
}, room=f'chat_{chat_id}')
```

## 📝 Files Modified

### `app/user-chat.tsx`
- Added socket.io-client import
- Added socket connection state and refs
- Implemented socket event handlers
- Added KeyboardAvoidingView wrapper
- Added typing indicator logic
- Added auto-scroll functionality
- Added sender name display
- Added connection status indicator

### `package.json`
- Added `socket.io-client` dependency

## ✨ Benefits

1. **Real-time messaging** - No need to refresh to see new messages
2. **Typing indicators** - See when others are typing
3. **Instant updates** - Chat list updates immediately when messages arrive
4. **Better UX** - Keyboard doesn't cover the input field
5. **Connection awareness** - Users know if they're connected
6. **Automatic reconnection** - Handles network interruptions gracefully

## 🔧 Configuration

Socket URL is automatically set from `API_BASE_URL` in `constants/Config.ts`:
- Development: `http://192.168.1.5:5000`
- Production: `https://api.grabdocs.com`

## 🐛 Error Handling

- Socket connection failures are logged
- Reconnection attempts (up to 5 times)
- Message send failures show error alert
- Graceful degradation if socket fails (falls back to API-only)

## 🚀 Testing Checklist

- [ ] Send message and see it appear immediately
- [ ] Receive message from another user in real-time
- [ ] Keyboard pushes input field up (not covered)
- [ ] Messages scroll to bottom automatically
- [ ] Connection status shows correctly
- [ ] Typing indicator works
- [ ] Reconnection after network interruption
- [ ] Multiple chats can be switched without issues
- [ ] Sender names display correctly


