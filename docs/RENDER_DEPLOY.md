# Deploy to Render (zero build/start command entry)

The build and start commands are encoded in `render.yaml` and the root
`package.json`, so you don't need to type anything into Render's UI — just
connect the repo and Render reads `render.yaml` automatically (Blueprint deploys),
or its defaults pick up the root `package.json`.

The backend builds and serves the React frontend from the **same origin**, so
there is no separate static site to configure.

---

## One-time setup

### 1. Create a Postgres database
- **Render → New → PostgreSQL** (or use an external Neon/Supabase DB).
- Copy the **Internal Connection String** (Render DB) or the external one.

### 2. Apply the schema + seed (once, against that DB)
From your machine (or any shell with `node`):

```bash
git clone https://github.com/Neo-Designs/pussalla_Incentivize.git
cd pussalla_Incentivize/pussalla-backend
cp .env.example .env
# Edit .env: set DATABASE_URL to your Render/Neon connection string,
#           set JWT_SECRET to `openssl rand -hex 32`
npm install
# Apply schema (creates tables):
node -e "require('dotenv').config();const{pool}=require('./src/db');const fs=require('fs');const sql=fs.readFileSync('./src/schema.sql','utf8');pool.query(sql).then(()=>pool.query(fs.readFileSync('./src/migrations/001_scale_and_tenants.sql','utf8'))).then(()=>{console.log('schema applied');pool.end();}).catch(e=>{console.error(e.message);pool.end();process.exit(1);})"
# Seed demo data (30 employees, tasks, logs):
npm run seed
```

Demo login: **EMP-001** / `Pussalla@123`.

### 3. Deploy the web service on Render

**Option A — Blueprint (recommended, reads render.yaml):**
- **Render → New → Blueprint** → select this repo.
- Render reads `render.yaml` and creates the `pussalla-incentivize` web service
  with `buildCommand: npm install && npm run build` and
  `startCommand: npm start` already set.
- In the **Environment** tab, set:
  | Key | Value |
  |---|---|
  | `DATABASE_URL` | your Render/Neon Postgres connection string |
  | `JWT_SECRET` | `openssl rand -hex 32` output |
  | `JWT_EXPIRES_IN` | `8h` |
  | `CORS_ORIGIN` | leave **empty** (frontend + API share one origin) |

**Option B — Manual web service (no Blueprint):**
- **Render → New → Web Service** → connect this repo.
- **Runtime:** Node
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- Set the same environment variables as above.

> The build command installs deps and runs `npm run build` (defined in the root
> `package.json`), which builds the React frontend into
> `pussalla-backend/public/`. The backend then serves it on the same port as
> the API. No separate static site is needed.

### 4. Open the app
After deploy, open the Render URL (e.g.
`https://incentivize.onrender.com`). The login page appears — sign in
with **EMP-001** / `Pussalla@123`.

---

## How it works (so you never hit the "index.html not found" error)

| Concern | Solution |
|---|---|
| Frontend `dist/` is gitignored | The **built** frontend is committed inside `pussalla-backend/public/` (always present, never ignored) |
| No build command in Render UI | `render.yaml` + root `package.json` define `npm install && npm run build` |
| Render Root Directory = `pussalla-backend` | The committed `public/` is served as-is (frontend source isn't needed) |
| Render Root Directory = repo root | `postinstall` in `pussalla-backend/package.json` rebuilds the frontend into `public/` |
| SPA client-side routes (e.g. `/earnings`) | `app.js` has a non-`/api` GET fallback that returns `index.html` |
| API + frontend on one origin | No CORS config needed; leave `CORS_ORIGIN` empty |

## Re-seeding after a DB reset
If you reset the database, re-run the schema + seed (step 2) against the
connection string, then redeploy (or just restart the service — the app reads
the live DB).
