# Mesa API

## Quick start (Postgres)

1. Start DB: from repo root `docker compose up -d postgres redis`
2. `.env` with `DATABASE_URL=postgresql://mesa:mesa@localhost:5432/mesa`
3. `npx prisma migrate dev`
4. `npm run start:dev` — seeds company, branches, staff on boot

Health: `GET http://localhost:3001/health` → `{ "db": "up" }`  
Login: `POST /auth/login` `{ "username": "admin", "pin": "0000" }`  
Bootstrap: `GET /sync/bootstrap?branchId=br-ryd-01`

Staff: admin/0000, cashier/1111, server/2222, kitchen/3333

Browse data: `npm run prisma:studio`

