# CROO Constellation — Single-Host Deploy

Brings **all 6 agents online at once** on one machine (VPS or your laptop) with a single
`docker compose` command. Each agent is an outbound-only background worker — it connects **out** to
the CROO WebSocket, so there are **no ports to open** and nothing to expose publicly.

Why deploy: a CROO provider can only be hired while it's **running and connected**. On the dashboard
the agents show **Offline** until a process is up. Online 24/7 = it can receive orders → more CAP
orders (the 10+ Technical-Execution bonus) and real adoption during the judging window.

---

## Prerequisites
- **Docker** with Compose v2 and BuildKit (any recent Docker Desktop / Docker Engine). Builds pull each
  agent straight from its **public GitHub repo** — no cloning needed.
- **Funded wallets for the requesters** — Maestro and Gauntlet *spend* USDC (they hire other agents and
  pay gas). Providers (Worker, Litmus, Goldilocks, Summon) only earn. Top up Maestro & Gauntlet first.
- Service IDs + SDK keys for each agent (from the Agent Store → Configure page, already in each repo's
  `.env.local`).

## 1. Fill the env files
Real secrets live in `env/<agent>.env` (gitignored). Create them from the templates:

```bash
cd deploy/env
for a in worker litmus gauntlet goldilocks summon maestro; do cp $a.env.example $a.env; done
# then edit each <agent>.env and paste in the real CROO_SDK_KEY / *_SERVICE_ID / keys
```

Shortcut if you're on the machine that has the repos cloned as siblings (e.g. your Mac):
```bash
# from deploy/ — copies each repo's existing .env.local into env/<agent>.env
for a in worker litmus gauntlet goldilocks summon maestro; do
  cp "../../dorahacks-croo-$a/.env.local" "env/$a.env"
done
```
> `CROO_MOCK` is **forced to `false`** in `docker-compose.yml`, so even if a copied file has
> `CROO_MOCK=true` the agent still runs **live**. Good — that's the whole point of deploying.

## 2. Bring them online
```bash
cd deploy
docker compose up -d --build
```
First build fetches + compiles all 6 (a few minutes). On a small box use **≥ 2 GB RAM**, or build one
at a time: `docker compose up -d --build worker` then the next.

## 3. Verify
```bash
docker compose ps                 # all 6 should be "running"
docker compose logs -f            # watch for each agent's "Ready"/provider-listening banner
docker compose logs -f maestro    # one agent
```
Then check the **CROO Agent Store dashboard** — the agents should flip from **Offline → Online**.

## Operations
```bash
docker compose restart summon     # bounce one agent
docker compose up -d --build      # redeploy after a repo push (re-pulls #main)
docker compose down               # stop all 6
docker compose down worker        # stop one
```

## Notes & gotchas
- **`#main`** in each `build:` pins to the main branch — `--build` re-pulls it. Pin a tag/commit
  (`...git#v0.2.0`) if you want immutable deploys.
- **Maestro** runs as a callable orchestrator (`node dist/index.js`). Confirm it stays up in
  `docker compose ps`; if its entrypoint is a one-shot demo instead of the provider loop, it'll exit —
  check logs and adjust the CMD/command if so.
- **Cost:** 6 tiny Node workers idle-light; a single 2 GB VPS (~$6–12/mo) or the free tier of most PaaS
  handles all 6 for the hackathon window.
- Being online lets agents **receive** hires; to actually rack up 10+ orders each you still need the
  cross-hiring / traction push (agents hiring each other + a few external buyers).
- **Core is a library** — it is not a service here; the agents pull it from npm (`@edycutjong/croo-core`).
