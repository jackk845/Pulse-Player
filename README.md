# Pulse Player 🎵

Pulse is a modern, premium, high-performance web music client compatible with **Navidrome** and any other server implementing the **Subsonic API**. 

It is designed with desktop-class glassmorphic interfaces, responsive mobile support, and an animated ambient canvas that breathes and changes color based on the artwork of the currently playing track.

Built entirely using native HTML5, Vanilla CSS, and modern ES modules with **zero heavy framework overhead**, Pulse Player loads instantly and runs smoothly on both desktop and mobile web browsers.

---

## Features

- **Fluid Ambient Canvas**: Dynamically extracts dominant colors from the album cover art and paints an animated, breathing backdrop.
- **Full Library Browsing**: Access your albums (newest, random, alphabetical), artists, and playlists, and easily toggle favorites.
- **Comprehensive Play Queue**: Drag-free interactive queue drawer. Add songs, play next, clear, or skip tracks.
- **Subsonic API Scrobbling**: Supports real-time "Now Playing" and play submission tracking (scrobbling) back to your Navidrome server (increments play counts and syncs with Last.fm/ListenBrainz).
- **System Media Keys (Media Session API)**: Seamless integration with OS notifications, lock screens, and hardware play/pause/skip keyboard controls.
- **Glassmorphic Responsive UX**: Mobile-first architecture that automatically collapses the sidebar navigation into a native-feeling bottom tab bar on mobile devices.
- **Offline Resilient Settings**: Stores server URLs and credentials safely in local storage, performing connection validation handshakes on start.

---

## Technical Stack

- **Core**: HTML5, Vanilla JavaScript (ES Modules)
- **Styling**: Vanilla CSS (CSS variables, backdrop filters, flex/grid layouts)
- **Hashing**: `blueimp-md5` (for client-side password salting)
- **Dev Server / Bundler**: Vite + Bun (or Node.js)

---

## Quick Start (Local Development)

Pulse Player requires **Bun** (or Node.js) for dependency installation and serving.

### 1. Install Dependencies
```bash
bun install
# or
npm install
```

### 2. Run the Development Server
```bash
bun run dev
# or
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## Production Build & Public Deployment

Because Pulse Player is a pure client-side static web application (SPA), it is **100% ready** to be hosted on any static hosting provider (Vercel, Netlify, Cloudflare Pages, GitHub Pages, or an Nginx server).

### 1. Compile static assets
```bash
bun run build
# or
npm run build
```
This generates optimized, minified HTML, CSS, and JS files inside the `dist/` directory.

### 2. Host the `dist/` folder
Simply upload the contents of the `dist/` folder to your static provider:
- **Netlify / Vercel / Cloudflare Pages**: Connect your Git repository, set the build command to `bun run build` (or `npm run build`), and the publish directory to `dist`.
- **GitHub Pages**: You can deploy the built `dist/` files using `gh-pages` or a custom GitHub action.

---

## 🔒 Crucial Hosting & Security Guidelines

When publishing Pulse Player to the public, please note the following security constraints:

### 1. Mixed Content Policy (HTTPS)
Modern web browsers enforce strict security rules around mixed content:
- If you host Pulse Player on an **HTTPS** URL (e.g. `https://player.yourdomain.com`), your Navidrome server **must** also be served over **HTTPS** (e.g. `https://music.yourdomain.com`).
- If your Navidrome server is only accessible via **HTTP** (e.g. `http://192.168.1.50:4533`), you must access Pulse Player via **HTTP** (e.g. `http://localhost:3000` or a local HTTP server) to connect.

### 2. CORS (Cross-Origin Resource Sharing)
Navidrome has CORS enabled by default, allowing external clients to fetch music. However:
- If you run Navidrome behind a strict reverse proxy (like Cloudflare, Nginx, or Traefik), ensure that the proxy is not stripped of the `Access-Control-Allow-Origin` headers.
- If you experience connection failures while your server URL is correct, check the browser console for CORS block errors.

---

## 🐳 Running inside Docker (Nginx Host)

To self-host Pulse Player on your own server, you can build a lightweight Docker image using Nginx to serve the static assets.

### 1. Create a `Dockerfile`
Create a file named `Dockerfile` in the root of the project:
```dockerfile
# Build stage
FROM oven/bun:latest AS builder
WORKDIR /app
COPY . .
RUN bun install
RUN bun run build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 2. Build and run the container
```bash
docker build -t pulse-player .
docker run -d -p 8080:80 --name pulse-player-instance pulse-player
```
You can now access your player at `http://localhost:8080`.
"# Pulse-Player" 
