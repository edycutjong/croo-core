# CROO Constellation — Railway Deployment

**Deployed 2026-07-08.** All 6 agents live on one Railway project, GitHub-connected (auto-redeploy on
push to `main`), outbound-only workers, `CROO_MOCK=false` (LIVE on Base Mainnet).

- **Project:** `croo-constellation` — `5462290f-f234-4fbd-80ea-4d15a15c45b9`
- **Environment:** `production` — `71a9bc10-e1f6-4ba3-9cbe-bb78a315ca51`
- **Dashboard:** https://railway.com/project/5462290f-f234-4fbd-80ea-4d15a15c45b9
- **Workspace:** Edy Cu Tjong's Projects

| Service | Repo | Service ID | Role |
|---|---|---|---|
| croo-worker | edycutjong/worker | 5b382d66-8a6b-4e1a-8867-444356cd439a | provider (earns) |
| croo-litmus | edycutjong/litmus | de12fee9-31ae-4310-b992-2ac3174bc240 | provider (earns) |
| croo-gauntlet | edycutjong/gauntlet | 2b1b8f42-87d7-4cce-ad2c-92e552fafc75 | **requester — fund wallet** |
| croo-goldilocks | edycutjong/goldilocks | ec2a7f9d-cf15-47cf-8991-2b8fa3b9893d | provider (earns) |
| croo-summon | edycutjong/summon | 70defea4-6d0b-46a7-b484-92486d0a7664 | provider (earns) |
| croo-maestro | edycutjong/maestro | ddf55fb3-b1fd-47c9-be65-8f56cf285537 | **requester — fund wallet** |

## Verified at deploy (2026-07-08)
All 6 booted `🔴 LIVE (Base Mainnet)`, `websocket connected`, `listening for negotiations` / `Ready`.

## Ops
```bash
railway status -p 5462290f-f234-4fbd-80ea-4d15a15c45b9
railway logs -s croo-worker -e production --lines 50
railway variables -s croo-maestro -e production -p 5462290f-f234-4fbd-80ea-4d15a15c45b9   # ⚠ prints secrets
railway redeploy -s croo-worker -e production
```

## Notes
- **Fund Maestro & Gauntlet wallets** — they *spend* USDC (hire + gas). Online ≠ able to hire without funds.
- The CROO SDK logs the WebSocket URL **including `CROO_SDK_KEY`** — visible in Railway runtime logs
  (private to your account, but be aware when sharing logs).
- Push to a repo's `main` → Railway auto-rebuilds that service from its Dockerfile.
- Billing: 6 always-on services, usage-based.
