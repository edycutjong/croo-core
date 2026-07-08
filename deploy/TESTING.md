# Testing the Live Constellation — Smallest → Dependent

All 6 agents are deployed and Online. Test in **this order** — each level adds one more moving part, so
when something breaks you know exactly where. Don't start with Maestro (it depends on 3 other agents).

> **Every real hire costs a little USDC** (agents are priced ~$0.10). The *requester* pays — so whatever
> you hire *from* needs a funded wallet (your **Navigator** balance, or a funded agent key).

---

## Level 0 — Liveness (free, no order)
Confirm each agent is up and connected before spending anything.

```bash
# Railway: each should show the LIVE banner + "listening" / "Ready"
railway logs -s croo-worker -e production --lines 20
# repeat for croo-litmus, croo-goldilocks, croo-summon, croo-gauntlet, croo-maestro
```
- **CROO dashboard** (https://agent.croo.network) → your agents should read **Online** (not Offline).
- ✅ Pass = every agent prints `🔴 LIVE (Base Mainnet)` + `websocket connected` + `listening/Ready`.

---

## Level 1 — Hire ONE self-contained provider (smallest real test)
Start with **Worker** — it's the simplest: topic in, sourced draft out, no dependency on any other agent.

### Option A — no code, via the Navigator (easiest)
1. Sign in at https://agent.croo.network, make sure your **Navigator** balance has a little USDC.
2. In the Navigator chat, ask for what Worker does, e.g.:
   *"Research the tradeoffs of ERC-4337 account abstraction."*
3. The Navigator discovers + hires a matching agent, you approve the price, and the draft comes back.
4. ✅ Pass = you get `{ draft, sources }` and the order appears in your dashboard / on BaseScan.

### Option B — controlled SDK hire (repeatable)
Use the helper script `scripts/hire-test.mjs` (in this folder). It hires one agent and prints the result.
```bash
# from a machine with node + a FUNDED requester key
export REQUESTER_SDK_KEY=<a funded CROO SDK key>   # e.g. your Navigator or a funded agent
node scripts/hire-test.mjs worker '{"topic":"ERC-4337 account abstraction tradeoffs"}'
```
✅ Pass = it prints a `{ draft, sources }` delivery and an on-chain order id.

Watch it land on the provider side too:
```bash
railway logs -s croo-worker -e production          # you should see the order arrive + deliver
```

---

## Level 2 — Each self-contained provider, one at a time
Same `hire-test.mjs`, one agent at a time. These are all **standalone** (no agent-to-agent dependency):

| # | Agent | Test requirement (JSON arg) | Expect back |
|---|---|---|---|
| 1 | **worker** | `{"topic":"ERC-4337 tradeoffs"}` | `{ draft, sources }` |
| 2 | **goldilocks** | `{"description":"research agent","currentPrice":0.10}` | `{ median, low, high, confidence, recommendedAdjustment }` |
| 3 | **litmus** | `{"deliverable":"The sky is blue because of Rayleigh scattering.","rubric":[{"criterion":"accuracy","weight":1}]}` | `{ score, rubric, gaps, confidence }` |
| 4 | **summon** | `{"prompt":"Approve test payout of 1 USDC?"}` | `{ approved, by, ms }` — ⚠️ **you must tap Approve/Reject in Telegram** for this to complete |

```bash
node scripts/hire-test.mjs goldilocks '{"description":"research agent","currentPrice":0.10}'
node scripts/hire-test.mjs litmus '{"deliverable":"The sky is blue due to Rayleigh scattering.","rubric":[{"criterion":"accuracy","weight":1}]}'
node scripts/hire-test.mjs summon '{"prompt":"Approve test payout of 1 USDC?"}'   # then answer on Telegram
```
> **Summon** has a *human* dependency (Telegram), not an agent one — so it's the bridge between the
> standalone tests and the A2A tests. Make sure `TELEGRAM_BOT_TOKEN`/`CHAT_ID` are set (they are).

---

## Level 3 — A2A / dependent flows (agents hiring agents)
Now the composed flows. **These require the *requester agent's* wallet to be funded** (it pays the
sub-agents it hires). Fund **Gauntlet** and **Maestro** first.

### 3a — Gauntlet certifies Worker (one dependency)
Gauntlet gets hired, then *hires Worker* and runs 7 adversarial probes against it.
```bash
# hire Gauntlet, pointing it at Worker's service id
node scripts/hire-test.mjs gauntlet '{"targetServiceId":"619bfff2-3297-4a62-bc91-61bdf69c23a9"}'
```
✅ Pass = a signed scorecard `{ totalScore, passedCount, probes[] }`. Watch both:
```bash
railway logs -s croo-gauntlet -e production   # runs probes
railway logs -s croo-worker   -e production   # receives Gauntlet's probe hires
```
⚠️ If it errors "insufficient funds" → **Gauntlet's wallet needs USDC**.

### 3b — Maestro full orchestration (three dependencies — do this LAST)
Maestro hires **Worker** (research) → **Litmus** (grade) → **Summon** (human sign-off if the grade is low)
→ returns one vetted result with a full audit trail.
```bash
node scripts/hire-test.mjs maestro '{"topic":"Write a vetted brief on Base L2 fee mechanics","qualityThreshold":90}'
```
✅ Pass = `{ results, audit, totalSpent }` where `audit` lists every sub-order Maestro placed. Watch the
whole chain light up:
```bash
railway logs -s croo-maestro    -e production   # orchestrates
railway logs -s croo-worker     -e production   # hired to research
railway logs -s croo-litmus     -e production   # hired to grade
railway logs -s croo-summon     -e production   # hired if grade < threshold (answer on Telegram)
```
⚠️ Needs **Maestro's wallet funded** (it pays 3 sub-agents + gas). This is the top of the dependency
tree — only meaningful once Levels 1–2 pass.

---

## Service ids (for the `targetServiceId` / hire args)
| Agent | Service ID |
|---|---|
| worker | `619bfff2-3297-4a62-bc91-61bdf69c23a9` |
| litmus | `516e6fd0-7270-47f1-b431-3d4596b848a2` |
| goldilocks | `570e4562-04c3-4b52-ad84-afd6f48d0bf6` |
| gauntlet | `a6982cf5-502c-41c1-971e-2e7eef4ed2e9` |
| summon | `4d8cbcb2-bfc7-4b60-b6f9-7919ff81e574` |
| maestro | `625f15c8-61ba-4b11-8201-0bb019ef5ef2` |

## Troubleshooting
| Symptom | Cause → fix |
|---|---|
| Agent shows **Offline** | container crashed → `railway logs -s croo-<agent> -e production`; `railway redeploy -s croo-<agent>` |
| Hire hangs, never delivers | provider errored mid-work → check that agent's logs |
| `insufficient funds` / hire rejected | **requester wallet empty** → top up Navigator / Gauntlet / Maestro |
| Summon never returns | nobody answered Telegram, or SLA timed out → it auto-refunds; answer faster |
| Litmus/Worker draft is weak | no/expired `ANTHROPIC_API_KEY` → it falls back to deterministic offline output (still delivers) |

## The point of the order
Every successful hire above is a **real CAP order on Base mainnet** — which is exactly what the judges
count (10+ orders = the Technical-Execution bonus). So testing *is* traction: run Levels 1–3 with a few
different inputs and each agent racks up real orders.
