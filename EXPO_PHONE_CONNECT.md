# Connecting Your Phone to Expo (192.168.1.9)

If your phone can't connect to the dev server at `http://192.168.1.9:8081`, try these steps.

## 1. Same network

- **Phone and PC must be on the same Wi‑Fi** (same SSID).
- Turn off mobile data on the phone so it only uses Wi‑Fi.
- Avoid guest Wi‑Fi; some routers isolate guest devices from the main network.

## 2. Windows Firewall (most common fix)

Windows often blocks incoming connections to Metro (port 8081), so the phone never reaches your PC.

**Option A – Allow Node through the firewall (recommended)**

1. Open **Windows Security** → **Firewall & network protection** → **Allow an app through firewall**.
2. Click **Change settings**.
3. Find **Node.js** in the list and enable **Private** (and **Public** if you use it).
4. If Node.js is not listed, click **Allow another app** → **Browse** and add your Node executable, e.g.:
   - `C:\Program Files\nodejs\node.exe`, or
   - Your nvm path, e.g. `C:\Users\<You>\AppData\Roaming\nvm\v20.x.x\node.exe`
5. Restart Expo: stop the server (Ctrl+C) and run `npx expo start --go` again.

**Option B – Inbound rule for port 8081**

1. Open **Windows Defender Firewall** → **Advanced settings**.
2. **Inbound Rules** → **New Rule** → **Port** → **TCP** → **Specific local ports**: `8081`.
3. **Allow the connection** → enable **Private** (and **Public** if needed) → Name it e.g. "Expo Metro".

## 3. Use tunnel mode (if LAN still fails)

Tunnel mode uses a public URL so the phone doesn’t need to reach 192.168.1.9 directly (helps with firewall or odd network setups).

```bash
npm run start:tunnel
```

or:

```bash
npx expo start --tunnel
```

Then scan the new QR code with Expo Go. The first run may take a bit while the tunnel is set up.

## 4. Check what the phone is using

- In Expo Go, when you scan the QR code, it should open a URL like `exp://192.168.1.9:8081`.
- If your project uses a **development build** (expo-dev-client), the terminal may say “Scan with Expo Go” but the app might expect a dev build. Press **s** in the terminal to switch between “Expo Go” and “development build” and use the one that matches the app on your phone.

## 5. Quick checklist

- [ ] Phone and PC on same Wi‑Fi (not guest, mobile data off).
- [ ] Node.js (or port 8081) allowed in Windows Firewall for Private (and Public if needed).
- [ ] Expo restarted after firewall change (`npx expo start --go`).
- [ ] If still failing, try `npm run start:tunnel` and scan the new QR code.
