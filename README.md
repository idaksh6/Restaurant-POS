# Restaurant POS

Saudi Arabia restaurant POS stack: **mesa-pos** (till app), **mesa-api** (backend), and **mesa-pos-website** (marketing site).

## Projects

| Folder | Description |
|--------|-------------|
| `mesa-pos/` | React + Vite POS (web & Electron desktop) |
| `mesa-api/` | NestJS API, Prisma, Postgres, Redis |
| `mesa-pos-website/` | Static marketing website |
| `docker-compose.yml` | Local Postgres + Redis + API |

## Quick start

### 1. Database & API

```bash
docker compose up -d postgres redis
cd mesa-api
cp .env.example .env
npm install
npx prisma migrate dev
npm run start:dev
```

API: `http://localhost:3001`

### 2. POS app

```bash
cd mesa-pos
cp .env.example .env
npm install
npm run dev
```

### 3. Marketing website

Open `mesa-pos-website/index.html` in a browser or serve the folder with any static host.

## Default staff (demo seed)

| User | PIN |
|------|-----|
| admin | 0000 |
| cashier | 1111 |
| server | 2222 |
| kitchen | 3333 |

## Deploy on CyberPanel (mesa-pos + mesa-api only)

`mesa-pos-website` is **not** deployed to the server — only the POS app and API.

### Recommended domains

| App | Subdomain | What gets published |
|-----|-----------|---------------------|
| `mesa-pos` | `app.restaurant-pos.isarva.in` | Built `mesa-pos/dist/` → `public_html` |
| `mesa-api` | `api.restaurant-pos.isarva.in` | Node process (PM2) on port 3001 + reverse proxy |

Create both websites in CyberPanel (PHP 8.x is fine; the POS is static files, API is Node).

### 1. Git + server layout

1. Create folder **outside** `public_html`, e.g. `/home/restaurant-pos.isarva.in/Restaurant-POS`
2. **Advanced → Git Deployment** → attach `https://github.com/idaksh6/Restaurant-POS.git` branch `main`
3. Add CyberPanel deployment key to GitHub → **Deploy keys**
4. Add GitHub **webhook** from CyberPanel

### 2. One-time server setup (SSH / CyberPanel terminal)

```bash
# PM2 for API
npm install -g pm2

# API environment
cp /home/restaurant-pos.isarva.in/Restaurant-POS/mesa-api/.env.example \
    /home/restaurant-pos.isarva.in/Restaurant-POS/mesa-api/.env
# Edit .env: DATABASE_URL, JWT_SECRET, REDIS_URL, etc.

# POS build-time API URL (used when deploy script builds mesa-pos)
echo 'VITE_API_URL=https://api.restaurant-pos.isarva.in' > \
  /home/restaurant-pos.isarva.in/Restaurant-POS/mesa-pos/.env

# Postgres + Redis (docker on same VPS, or CyberPanel databases)
# See docker-compose.yml for local dev reference
```

Point **api** subdomain OpenLiteSpeed reverse proxy to `http://127.0.0.1:3001`.

### 3. Deploy after each git pull

```bash
export REPO_DIR="/home/restaurant-pos.isarva.in/Restaurant-POS"
export POS_PUBLIC_HTML="/home/app.restaurant-pos.isarva.in/public_html"
export VITE_API_URL="https://api.restaurant-pos.isarva.in"
bash "$REPO_DIR/deploy/cyberpanel/deploy-apps.sh"
```

Wire this into a **Cron** job (e.g. every 2 minutes) or run manually after webhook pulls.

The script runs `npm ci`, builds `mesa-pos`, copies `dist/` to the app site, builds `mesa-api`, runs `prisma migrate deploy`, and restarts PM2.

### 4. GitHub Actions (auto-deploy on push to `main`)

Workflow: `.github/workflows/deploy-cyberpanel.yml`

Add these **repository secrets** (GitHub → Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `CYBERPANEL_HOST` | `restaurant-pos.isarva.in` (or server IP `172.237.41.81`) |
| `CYBERPANEL_SSH_USER` | `resta6907` |
| `CYBERPANEL_SSH_PASSWORD` | Your SSH password (never commit this) |
| `CYBERPANEL_SSH_PORT` | `22` (or custom port if CyberPanel changed SSH port) |

Optional server env overrides in the workflow script: `REPO_DIR`, `POS_PUBLIC_HTML`, `VITE_API_URL`.

**If GitHub Actions SSH fails:** port 22 may be blocked externally. Use CyberPanel **Advanced → SSH / Terminal** and run:

```bash
curl -fsSL https://raw.githubusercontent.com/idaksh6/Restaurant-POS/main/deploy/cyberpanel/server-bootstrap.sh | bash
```

Or after clone: `bash /home/restaurant-pos.isarva.in/Restaurant-POS/deploy/cyberpanel/server-bootstrap.sh`

Enable **SSH** in CyberPanel → **Security** and allow port **22** (or set `CYBERPANEL_SSH_PORT` secret to match).
