# Mesa POS — Integration Documentation

**Product:** Mesa KSA Restaurant POS  
**Status:** UI prototype + local-first integration path  
**Goal:** Production local-first POS with optional cloud sync  

**Order of work:** Phase Design (skill + UI system) → this doc → Phase 0…5.

---

## 0. Executive summary

Mesa is a **React + Vite + TypeScript** POS UI (dine-in, quick serve, drive-thru, delivery, settle, settings, inventory, CRM).

Production integration:

1. Design / Arabic system (project skill)  
2. Keep the UI  
3. **Dexie (IndexedDB)** local database  
4. **NestJS + PostgreSQL** store API (`mesa-api/`)  
5. **Offline outbox** sync when the network returns  

**Defaults:**

- Runtime: **PWA** first (Electron/Tauri later)
- Scale: **one company → many branches**, local-first per terminal
- Backend: **NestJS + PostgreSQL + Redis**
- Sync: **offline-first outbox → pull deltas** (scoped by `branchId`)
- UI: **Mesa design tokens + full AR/RTL + Arabic form typing**

---

## Multi-branch model

One **company** owns many **branches**. Each POS terminal selects an active branch.

| Layer | Scope |
|-------|--------|
| Company profile | Shared (name, VAT, logo, currency) |
| Branches | List under company (`code`, address EN/AR, phone) |
| Tickets / KOT / day close / stock ops | **Per branch** (`branchId`) |
| CRM customers | Company-level (shared guests) by default |
| Menu masters | Shared now; optional per-branch overlays later |
| Outbox / sync | Every op carries `deviceId` + `branchId` |

Client:

- [`src/data/company.ts`](../src/data/company.ts) — `CompanyProfile` + `Branch[]`
- [`src/state/BranchContext.tsx`](../src/state/BranchContext.tsx) — active branch switcher
- Settings → Company & Branches UI

API:

- Prisma `Company` / `Branch` models
- `GET /sync/bootstrap?branchId=`
- `GET /orders?branchId=`
- Day close unique on `(branchId, dayKey)`

---

## Phase Design — Skill set

Project skill: [`.cursor/skills/mesa-design-arabic/`](../.cursor/skills/mesa-design-arabic/SKILL.md)

Covers fonts (Syne/Manrope + IBM Plex Sans Arabic), color tokens, RTL, `ArabicTextInput` Latin→Arabic transliteration, layout and responsive breakpoints.

---

## 1. Tech stack

### Client

| Layer | Technology |
|--------|------------|
| UI | React 19 + Vite 8 + TypeScript |
| Routing | React Router 7 |
| Local DB | Dexie (IndexedDB) |
| Offline shell | vite-plugin-pwa |
| i18n / money | EN/AR, SAR, VAT 15% |

### Server (`mesa-api/`)

| Layer | Technology |
|--------|------------|
| API | NestJS |
| ORM | Prisma |
| DB | PostgreSQL 16 |
| Pub/sub | Redis |
| Realtime | Socket.IO |
| Deploy | Docker Compose |

### Architecture

```
Page → Context → Repository → Dexie (always)
                      └→ API (when online)
                      └→ Outbox (when offline write)
```

---

## 2. Offline / online rules

1. Never block selling on network failure  
2. Online: server is source of truth for inventory, day-close, shared open tickets  
3. Every write: `id` (UUID), `updatedAt`, `deviceId`  
4. Conflicts: LWW for masters; append-only for payments/settled sales  

Connectivity: `navigator.onLine` + `GET /health` heartbeat. UI chip: Online | Offline | Syncing (N).

### Sync contracts

- `GET /sync/bootstrap` — masters + open tickets + cursor  
- `POST /sync/push` — outbox batch  
- `GET /sync/pull?since={cursor}` — deltas  

Outbox ops: `ticket.*`, `kot.send`, `customer.upsert`, `stock.adjust`, `masters.*`

---

## 3. Storage map

| Key / store | Purpose |
|-------------|---------|
| `mesa-crm-customers` | Customers |
| `mesa-master-categories` / `mesa-master-dishes` | Menu masters |
| `mesa-stock` | Stock |
| `mesa-gift-cards` / food vouchers | Loyalty tenders |
| `mesa-payment-types` / expenses / company / tax / timetables | Settings |
| `mesa-sales-ledger` / day close | Accounting |
| Dexie `tickets` / `outbox` | Open tickets + sync queue |

Backup list: `src/lib/dataTransfer.ts` → `backupKeys`.

---

## 4. Backend modules

`auth`, `masters`, `floor`, `orders`, `kitchen`, `payments`, `crm`, `inventory`, `purchasing`, `accounts`, `shift`, `sync`

Monorepo:

```
mesa-pos/          # Vite app
mesa-api/          # NestJS
docker-compose.yml
docs/INTEGRATION.md
```

---

## 5. Phased delivery

| Phase | Focus |
|-------|--------|
| Design | Skill, fonts, Arabic forms, responsive |
| 0 | Schema inventory, deviceId, connectivity, PWA, outbox stubs |
| 1 | Dexie repos; CSV import/export kept |
| 2 | NestJS + Postgres auth/masters/orders/settle |
| 3 | Outbox flush + pull + WebSocket |
| 4 | Printers, mada hooks, audit, ZATCA Phase 1 TLV QR (`VITE_ZATCA_ENABLED`) |
| 5 | Backup, role QA, CSV cutover |

---

## 6. Security & compliance

- Staff PIN + role ACL (`src/auth/roles.ts`)
- Audit trail for voids, comps, discounts, day close
- Encrypt backups with PII (KSA PDPL awareness)
- TLS beyond pure LAN

---

## 7. Go-live checklist

- [ ] Masters imported (CSV / Database hub)
- [ ] Tables & areas configured
- [ ] Payment types active (cash, mada, etc.)
- [ ] Tax 15% VAT verified
- [ ] Printers tested (receipt + KOT)
- [ ] Roles: admin / cashier / food-server / kitchen
- [ ] Offline drill: disconnect → sell → reconnect → sync OK
- [ ] Day close matches ticket sum
- [ ] Backup restore tested

See also [GO_LIVE.md](./GO_LIVE.md).

---

## 8. Glossary

| Term | Meaning |
|------|---------|
| Outbox | Local queue of mutations waiting to POST to API |
| Bootstrap | Initial download after login |
| Local-first | UI writes local DB first; network secondary |
| KOT | Kitchen Order Ticket |
| Day close | End-of-day reconciliation |
| PWA | Installable offline app shell |
