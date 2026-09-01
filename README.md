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

## CI/CD

Pipeline setup for server deployment is planned — this repo contains application source only.
