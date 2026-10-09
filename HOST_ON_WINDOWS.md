# Host your shared lesson board from your Windows PC for free

This version uses WebSockets. The static GitHub Pages deployment does **not** host the collaboration server.

## Install once
1. Install Node.js LTS from https://nodejs.org/en/download.
2. Install cloudflared from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ (Windows) or from PowerShell: `winget install --id Cloudflare.cloudflared`.
3. Download this repository from GitHub (Code -> Download ZIP) and extract it. Use the branch containing this fix or merge the PR first.

## Start the board
Open PowerShell in the extracted project folder:

```powershell
npm install
npm start
```

The website is locally available at http://localhost:3000/?room=lesson-sql.

## Create an HTTPS link for a friend
Keep the server running. Open a SECOND PowerShell window:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Cloudflare shows a public URL like `https://random-words.trycloudflare.com`.
Share `https://random-words.trycloudflare.com/?room=lesson-sql`.
Both participants must open the **same** URL and room. HTTPS automatically upgrades the application WebSocket to secure WSS.

**Important:** Quick Tunnel URLs are temporary and change on restart. Both windows (Node and cloudflared) must remain open; your PC must stay powered on with working internet. This is meant for small private lessons, not public production.

## Troubleshooting
- In DevTools -> Network -> WS, `/api/collab/ws` should have status 101 (Switching Protocols).
- If text doesn't sync, close old GitHub Pages tabs and open the newly shared tunnel link on both devices.
- The latest shared board snapshot is held in server memory only. Restarting the server clears that snapshot; each browser still has localStorage for local content.
- Do **not** post the tunnel link publicly. A room name alone is **not authentication**; anyone with the link can join and edit the board. Avoid private, sensitive or confidential data.

## Alternative: Docker
If Docker Desktop is installed:
```powershell
docker compose up --build -d
cloudflared tunnel --url http://localhost:8080
```
