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

## Deploy on CyberPanel (`restaurant-pos.isarva.in`)

This repo is a **monorepo**. The marketing site lives in `mesa-pos-website/` — not the repo root.

### Marketing website (static)

1. In CyberPanel → **Websites** → `restaurant-pos.isarva.in` → **Advanced** → **Git Deployment**
2. Repository: `https://github.com/idaksh6/Restaurant-POS.git` · branch `main`
3. Add CyberPanel’s **deployment key** to GitHub → repo **Settings → Deploy keys**
4. **Empty** the attach directory before first attach (remove default `index.html`)
5. Add the **GitHub webhook** URL from CyberPanel (disable SSL verify only if using IP, not hostname SSL)

After each `git pull`, publish only the website folder:

```bash
export CYBERPANEL_SITE_USER="restaurant-pos.isarva.in"
bash /home/restaurant-pos.isarva.in/public_html/deploy/cyberpanel/post-deploy-website.sh
```

If Git clones into `public_html`, set `REPO_DIR` to that path. The script copies `mesa-pos-website/*` into `public_html` so `index.html` is at the domain root.

**Better layout (recommended):** clone the repo outside `public_html` (e.g. `/home/restaurant-pos.isarva.in/Restaurant-POS`), then run the script with:

```bash
export REPO_DIR="/home/restaurant-pos.isarva.in/Restaurant-POS"
export PUBLIC_HTML="/home/restaurant-pos.isarva.in/public_html"
bash "$REPO_DIR/deploy/cyberpanel/post-deploy-website.sh"
```

Wire that into CyberPanel **Cron** (every minute after webhook) or your webhook handler.

### API & POS app (later)

| App | Suggested host | Notes |
|-----|----------------|-------|
| `mesa-api` | `api.restaurant-pos.isarva.in` | Node.js + Postgres + Redis (Docker or CyberPanel Node app) |
| `mesa-pos` | `app.restaurant-pos.isarva.in` | `npm run build` → serve `dist/` or Electron for tills |

See `mesa-api/.env.example` and `mesa-pos/.env.example` for environment variables.
