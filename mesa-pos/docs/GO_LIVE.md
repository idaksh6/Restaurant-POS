# Mesa POS — Go-live checklist (Phase 5)

## Cutover

1. Create company + all branches in Settings → Company & Branches  
2. On each terminal, select the correct branch in the top bar  
3. Export masters via Database hub CSV / full JSON backup  
4. Install PWA on each terminal (or open same LAN URL)  
5. Set `VITE_API_URL=http://<store-server>:3001` in Mesa client build  
6. Start `mesa-api` (+ Postgres/Redis via `docker compose` when ready)  
7. Login admin → confirm sync chip shows Online for that branch  

## Branch rules

- Day close is **per branch**  
- Open tickets do not cross branches  
- Switching branch reloads terminal state for that branch  
- Company VAT / logo is shared; addresses are branch-specific  

## Role QA matrix

| Role | Must pass |
|------|-----------|
| admin | Settings, masters, day close, database backup/restore |
| cashier | Settle cash/card stub, discounts, gift/voucher |
| food-server | Dine-in open/send KOT, no masters edit |
| kitchen | KOT board status only |

## Backup

- Database hub → Export full JSON (`buildFullBackup`)  
- Postgres: schedule `pg_dump` (see docker volume `mesa_pg`)  
- Restore: Import on spare PC before go-live  

## Offline drill

1. Disconnect network  
2. Open QS ticket, settle cash  
3. Confirm sync chip Offline + outbox queued  
4. Reconnect → chip Syncing → Online, queue drains  

## VAT / day close

- Sample bill VAT 15% matches `src/lib/bill.ts`  
- Day close cash counted vs ledger cash sales  

## Load

- Target ≈5 terminals against one API  
- Watch WebSocket `mesa` events for ticket/KOT  

## Sign-off

- [ ] Masters imported  
- [ ] Tables & payment types  
- [ ] Printers / card stub tested  
- [ ] Offline drill OK  
- [ ] Backup restore OK  
- [ ] Role QA signed  
