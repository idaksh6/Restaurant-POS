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
