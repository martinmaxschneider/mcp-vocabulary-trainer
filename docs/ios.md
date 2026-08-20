# Native iOS Daily

Xcode only on your Mac. The iPhones get the app over a cable. After that the app starts without the Mac, without the same Wi-Fi, and without a browser cache.

The Mac still creates the Daily pack and TTS. The iPhone only downloads and plays.

## One-time Mac setup

1. Install Xcode from the App Store (~10 GB) and open it once so the platforms download.
2. Open `ios/Sprachen.xcodeproj`.
3. Select the **Sprachen** target → **Signing & Capabilities**.
4. Choose your Team (Apple ID). The bundle ID is `ch.martin-schneider.sprachen`.
5. Plug in the iPhone, trust the computer, unlock the phone.
6. In Xcode choose the iPhone as run destination and press Run.

The app stays on the phone after you unplug.

### Signing

**Free Apple ID (Personal Team):** the app expires after **7 days**. Plug the phone back in and Run again.

**Paid Apple Developer Program (99 $/year):** signing lasts about a year. Better if you use the app every day. Not required for the first install.

You do **not** need Xcode on other computers or on the iPhones. You do **not** need TestFlight or the App Store for a few personal devices.

## Start the Mac server

```bash
npm run dev:web
```

Port **4810** is enough. The native app talks HTTP on the LAN; mkcert / port 4843 is only for the PWA.

On the Mac, note the LAN address, for example `http://192.168.1.10:4810` (`System Settings → Network`, or the hostname printed by the HTTPS proxy if you still run `npm run dev`).

## First launch on the iPhone

1. Open **Einstellungen** in the app.
2. Enter the Mac URL, e.g. `http://192.168.1.10:4810`.
3. Tap **Verbindung prüfen**. iOS will ask for local-network access — allow it.
4. Back on the home screen: pick the language, tap the download button.
5. Leave the house. Play uses the stored pack. Lock-screen play/pause/next/previous should keep audio running.

If the Mac address changes (new Wi-Fi / DHCP), only update the URL in the app. No rebuild.

## Evening workflow

On the iPhone (home Wi-Fi) download the latest started pack for that language — not only today’s date. Older packs on the phone are replaced.

The graded test stays on the Mac.
