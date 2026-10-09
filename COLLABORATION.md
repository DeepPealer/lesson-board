# Collaborative lessons

The shared cursor, sticky notes, board items and pages need a running Node.js server. GitHub Pages **only hosts static files** and cannot run `server.js`.

## Run locally

```sh
node server.js
```

Open http://localhost:3000/?room=lesson-1 in two tabs or browsers.

## Docker

```sh
docker compose up --build -d
```

Open http://localhost:8080/?room=lesson-1.

For computers on the same LAN use http://YOUR_HOST_LAN_IP:8080/?room=lesson-1 on **both** machines. Allow the port in the firewall. For internet access deploy the Node server behind HTTPS (including the SSE stream). GitHub Pages alone cannot provide multiplayer.

Participants must use the same `room` value in the URL. Room state is currently **in-memory only**: restarting the server loses the shared snapshot; browser localStorage still keeps local state. The in-memory server is intended for a trusted private deployment, not a publicly exposed production service: add authentication, authorization, input limits, persistence and room access controls before public hosting.

The server supports `/api/collab/stream` (EventSource) and `/api/collab/message` (POST). In DevTools > Network, check that the stream stays open with Content-Type `text/event-stream` and messages return HTTP 200.
