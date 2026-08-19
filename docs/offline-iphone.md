# Daily offline on iPhone

No cloud deploy. The app stays on your Mac. The iPhone stores one Daily pack (text + MP3s) and plays it with the same listen player after you leave the house.

HTTPS is required: iOS only allows service workers (and therefore a home-screen app that starts offline) on a trusted HTTPS origin.

Port **4843** is the HTTPS proxy. It does not clash with the app (**4810**) or the MCP tunnel health port (**4811**).

## One-time Mac setup

```bash
npm run https:setup
```

This installs `mkcert` (via Homebrew if needed), trusts a local root CA on the Mac, and writes certificates to `data/certs/`:

- `local.pem` / `local-key.pem` — server certificate (`*.local` + LAN IPs)
- `rootCA.pem` — AirDrop this file to the iPhone once
- `hostnames.txt` — names the proxy will print

## One-time iPhone trust

1. AirDrop `data/certs/rootCA.pem` to the iPhone and open it.
2. Settings → Profile Downloaded → Install.
3. Settings → General → About → Certificate Trust Settings → enable full trust for the mkcert root.

Without that last step Safari will warn and the PWA will not go offline.

## Start the app with HTTPS

Keep the usual app process (dev or production) and add the proxy:

```bash
npm run dev:web          # or: npm run start:web  after `npm run build`
npm run https:proxy
```

Or both together:

```bash
npm run dev:https        # Next.js + HTTPS proxy
npm run start:https      # production server + HTTPS proxy
```

The proxy prints URLs such as `https://<mac-name>.local:4843` and `https://192.168.x.x:4843`.

On the iPhone, open that URL in **Safari** (same Wi-Fi as the Mac). Then Share → Add to Home Screen. The home-screen app is a slim view: language + download + player (no full nav).

## Evening workflow

1. On the Mac: create tomorrow’s Daily pack, wait for TTS, start it — same as today.
2. On the iPhone (home Wi-Fi): open the home-screen app, pick the **target language**, tap **Download current pack**. Older packs on the phone are replaced.
3. Later, with the Mac off or no Wi-Fi: open the home-screen app and use the player.

The graded test (`startTest` / answers) still needs the Mac. Do that when you are back on home Wi-Fi, or on the Mac.

## If the address changes

A new LAN IP (another network, DHCP) needs a new certificate:

```bash
npm run https:setup
npm run https:proxy
```

If the iPhone already trusts `rootCA.pem`, you do not install the profile again.
