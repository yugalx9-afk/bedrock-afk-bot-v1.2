# Bedrock Bot Dashboard

A compact Node.js Minecraft Bedrock client with Microsoft authentication, a password-protected web dashboard, status/log monitoring, and reconnect support.

## Configure everything in settings.json

Edit `settings.json` before pushing to GitHub:

- `server.host`: your own Bedrock server address
- `server.port`: Bedrock UDP port, usually `19132`
- `minecraft.username`: leave this as an empty string to avoid manually setting a gamertag; Microsoft authentication supplies the account identity when supported by the installed protocol library
- `bot.autoReconnect`: reconnect after unexpected disconnects
- `bot.autoStart`: start the client when the service boots
- `bot.reconnectMinMs` / `bot.reconnectMaxMs`: retry delay range
- `dashboard.port` / `dashboard.host`: local dashboard listener
- `storage.dataDirectory`: folder for cached Microsoft authentication

Do not put passwords, Microsoft credentials, or authentication tokens in `settings.json`. Set `DASHBOARD_PASSWORD` as a Railway Variable or local `.env` secret instead.

## Deploy to Railway

1. Upload the contents of this folder to a **private** GitHub repository.
2. Import the repository into Railway.
3. Add a Railway Volume mounted at `/data`.
4. In Railway Variables, set:
   - `DASHBOARD_PASSWORD` to a long, unique password
   - `DATA_DIR` to `/data`
5. Optionally override settings from `settings.json` with environment variables such as `MC_HOST`, `MC_PORT`, and `BOT_AUTOSTART`.
6. Generate a public domain, open it, and enter any username plus the `DASHBOARD_PASSWORD` as the password when the browser asks for Basic Authentication.
7. Press Start bot. Complete Microsoft device-code login if prompted.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and set a strong `DASHBOARD_PASSWORD`.
3. Edit `settings.json` with your own server details.
4. Run `npm install`, then `npm start`.
5. Open `http://localhost:3000`.

## Notes

- Use this only on servers you own or have permission to automate. This client does not attempt to bypass server-side AFK rules or anti-cheat.
- Cloud hosting must permit outbound Bedrock UDP traffic. Confirm that with the host before relying on it.
- Use persistent storage for the authentication cache. Do not commit `.env` or the `data/` directory.
- A restart policy does not guarantee uninterrupted uptime.
- The dashboard is protected with HTTP Basic Authentication. Use a strong password.
- `/health` is public for Railway health checks; dashboard and bot-control routes require authentication.
