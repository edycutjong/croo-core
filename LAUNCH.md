# 🚀 CROO Constellation — Go-Live Runbook

Everything in the constellation is code-complete, green in CI, containerized, and reproducible offline (`CROO_MOCK=true`). This runbook is the **only thing left**: turning that into **real CAP orders on Base mainnet** — which is what the judges score (Technical Execution + A2A Composability + the 10+ orders bonus).

Work top to bottom. Steps marked 🔑 need your accounts/funds and can't be automated.

---

## 0. Prerequisites
- A CROO account + Agent Store access (dashboard).
- An AA wallet funded with a small amount of **USDC on Base** (orders are cents; ~$5 is plenty for 15–20 orders).
- A host for the always-on provider agents (Railway / Render / Fly.io / Cloud Run). Dockerfiles are ready in every repo.
- (Optional) `ANTHROPIC_API_KEY` for Worker + Litmus + Goldilocks to do real LLM work; they fall back to deterministic output without it.
- (Summon only) `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`.

## 1. 🔑 Register the 6 services
In the CROO dashboard, register one service per agent and copy each generated **service ID**:

| Agent | Service it offers | Env var that holds its ID |
|-------|-------------------|---------------------------|
| Worker | Research draft | `WORKER_SERVICE_ID` |
| Litmus | Output grading | `LITMUS_SERVICE_ID` |
| Summon | Human sign-off | `SUMMON_SERVICE_ID` |
| Goldilocks | Pricing oracle | `GOLDILOCKS_SERVICE_ID` |
| Gauntlet | Certification | `GAUNTLET_SERVICE_ID` |
| Maestro | Orchestration | `MAESTRO_SERVICE_ID` |

## 2. Wire the env vars (⚠️ the #1 live gotcha)
Each agent reads its own `CROO_SDK_KEY` + its own service ID. **Maestro additionally needs the real IDs of the agents it hires** — its defaults (`svc_research_worker`, etc.) are placeholders; if they don't point at your registered services, every hire fails.

`maestro/.env.local`:
```bash
CROO_SDK_KEY=croo_sk_...
MAESTRO_SERVICE_ID=<maestro id from step 1>
WORKER_SERVICE_ID=<worker id from step 1>
WORKER_FALLBACK_SERVICE_ID=<worker id again — one registration can serve both roles>
LITMUS_SERVICE_ID=<litmus id>
SUMMON_SERVICE_ID=<summon id>
```
The provider agents (`worker`, `litmus`, `summon`, `goldilocks`, `gauntlet`) each only need their own `CROO_SDK_KEY` + service ID (+ any LLM/Telegram keys). See each repo's `.env.example`.

## 3. Deploy the providers (must be online to receive orders)
A provider only gets hired if it's connected. Deploy these so they stay up:
`worker`, `litmus`, `summon`, `goldilocks` — and `gauntlet` + `maestro` (both act as provider *and* requester).
```bash
# from each repo:
docker build -t <agent> .
docker run --env-file .env.local <agent>          # worker/summon/litmus/maestro (no port)
docker run -p 8080:8080 --env-file .env.local <agent>   # gauntlet/goldilocks (health/badge)
```

## 4. 🔑 Fund the requester wallets
The agents that **pay** are **Maestro** and **Gauntlet**. Make sure their AA wallets hold USDC on Base.

## 5. Live smoke test (one order, prove the chain)
Trigger a single Maestro orchestration on mainnet and watch the full lifecycle: `negotiate → accept → pay → work → deliver`. This is where live-only issues (gas, WS reconnects, timeouts) surface — fix anything here before scaling.

## 6. Scale to 10+ real orders
- Run **Maestro** 2–3 times → each run fans out into ~4–5 sub-orders (Worker, Litmus, fallback Worker, Summon) **plus** the Maestro order itself.
- Run **Gauntlet** `npm run certify` against Worker / Litmus / Summon → diverse certification edges.
- Math: 3 Maestro runs (~15 orders) + 3 Gauntlet certs ≈ **18+ real CAP orders** across **6 distinct agents** → clears the bonus and builds a dense A2A graph.

## 7. Record the evidence
For every order, capture `orderId`, counterparty, amount, and `txHash`, then fill in each repo's **🔗 Live Run Log** table and bump the **Total real CAP orders** counter (and the aggregate table in this repo's README).
- Maestro hands you most of it for free: the delivered `audit[]` array already contains `orderId`, `amount`, and `txHash` for every sub-hire.
- The CROO dashboard lists all orders + their pay/deliver transactions; link each to `https://basescan.org/tx/<hash>`.

---

## ✅ Launch checklist
- [ ] 6 services registered; IDs copied
- [ ] Maestro `.env.local` points at the **real** Worker/Litmus/Summon IDs
- [ ] Provider agents deployed and showing "Ready / WebSocket connected"
- [ ] Maestro + Gauntlet wallets funded with USDC on Base
- [ ] Live smoke test: 1 Maestro run completed end-to-end
- [ ] 10+ real CAP orders generated
- [ ] Live Run Log tables + totals filled in with order IDs and BaseScan tx links
- [ ] (Adoption) 1–2 external devs hired Summon via the demo-insurance snippet
- [ ] (Presentation) 2-min demo recorded; `Live Demo` badge URLs updated to deployed endpoints
