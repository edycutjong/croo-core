<div align="center">
  <img src="docs/icon-animated.svg" alt="Core Logo" width="120">

  <h1>Croo Core ⚙️</h1>
  <p><em>Shared CROO SDK wrapper for the Constellation agent suite</em></p>

  <br/>

  [![Live Demo](https://img.shields.io/badge/🚀_Live-Demo-06b6d4?style=for-the-badge)](https://mock.croo.network)
  [![Built for CROO Hackathon](https://img.shields.io/badge/DoraHacks-CROO_Hackathon_2026-8b5cf6?style=for-the-badge)](https://dorahacks.io/hackathon/croo-hackathon)

  <br/>

  ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
  ![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
  [![CI](https://github.com/edycutjong/croo-core/actions/workflows/ci.yml/badge.svg)](https://github.com/edycutjong/croo-core/actions/workflows/ci.yml)

</div>

---

## 💡 The Problem & Solution
Developing autonomous agents that securely communicate and transact on-chain requires massive boilerplate.
**Croo Core** provides a unified SDK wrapper for the entire Constellation agent suite. It abstracts away the complexity of A2A (Agent-to-Agent) communication, cryptographic signing, and wallet integration, allowing agent developers to focus on specialized logic rather than infrastructure.

**Key Features:**
- 🔌 **Unified Interface:** A single, consistent API for interacting with the entire Croo ecosystem.
- 🔐 **Secure Execution:** Built-in support for wallet connections and cryptographic verification.
- ⚡ **A2A Networking:** Seamless peer-to-peer communication between distinct AI agents.
- 🔄 **Active State Recovery:** Automatically scans and resumes in-flight paid orders on boot, ensuring no lost actions.
- ❌ **Active Rejections:** Instantly rejects unmatched negotiations instead of letting them silently time out.
- 💼 **Dynamic Payout Wallets:** Supports redirecting incoming fee revenue directly to custom wallet destinations.
- 🚀 **Fast Failover Race:** Requester-side races order completion against rejection/expiration events for immediate error cascading.

## 🌌 The Constellation Ecosystem

This core SDK powers a suite of 6 specialized reference agents that form a secure, autonomous ecosystem. For a deep-dive into how these agents compose to form orchestrated, quality-gated workflows, read the [**CROO Constellation Portfolio**](PORTFOLIO.md).

- **Worker:** Research provider (top of the pipeline)
- **Summon:** Human-in-the-loop sign-off agent
- **Maestro:** Callable multi-agent orchestrator
- **Litmus:** Output-grading quality gate
- **Gauntlet:** Paid adversarial certification agent
- **Goldilocks:** Data-backed pricing oracle

Every arrow below is a real CAP order settled in USDC on Base — `croo-core` provides the `hire()` (requester) and `runProvider()` (provider) primitives, plus escrow-safe SLA refunds and a deterministic mock mode shared by all six agents.

```mermaid
graph LR
    User([Any Agent / User]) -->|hires| M[Maestro 🎼]
    M -->|research| W[Worker 🛠️]
    M -->|grade ×2| L[Litmus 🧪]
    M -->|human sign-off| S[Summon 👤]
    G[Gauntlet 🧤] -.->|certifies| M
    G -.->|certifies| W
    G -.->|certifies| L
    G -.->|certifies| S
    GL[Goldilocks 🧈] -->|prices| Store[(Agent Store)]
    W -.->|uses| C{{croo-core ⚙️}}
    M -.->|uses| C
    L -.->|uses| C
    S -.->|uses| C
    G -.->|uses| C
    GL -.->|uses| C
    classDef hot fill:#F59E0B,stroke:#111,color:#111,font-weight:bold;
    class C hot;
```

## 🔗 Live Run Log — Constellation Totals (Base Mainnet)

Aggregate of real CAP orders across every agent built on this SDK during the hackathon. Each agent's own README has its per-order table with BaseScan tx links.

**Total real CAP orders: _0_** · _last updated: 2026-06-__

| Agent | Real CAP orders | A2A counterparties |
|-------|-----------------|--------------------|
| Worker 🛠️ | _0_ | Maestro |
| Maestro 🎼 | _0_ | Worker, Litmus, Summon |
| Gauntlet 🧤 | _0_ | targets, Maestro, Litmus, Summon |
| Summon 👤 | _0_ | Maestro, external bots |
| Litmus 🧪 | _0_ | Maestro, external |
| Goldilocks 🧈 | _0_ | external |
| **Total** | **_0_** | |

> Delete this note once populated.

## 🏗️ Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js (TypeScript) |
| **Ecosystem** | Constellation A2A |
| **Testing** | Vitest |

## 🚀 Getting Started

### Prerequisites
- Node.js ≥ 20
- npm

### Installation
1. Clone: `git clone https://github.com/edycutjong/croo-core.git`
2. Install: `npm install`
3. Build: `npm run build`

### Usage (consumed by every agent)
```ts
import { makeClient, runProvider, hire, isMockMode } from '@edycutjong/croo-core';

// Provider side (Summon, Litmus, Gauntlet, Goldilocks, Maestro):
const client = makeClient(process.env.CROO_SDK_KEY!);
await runProvider(client, { serviceMatch, work, slaGuardMs: 60_000 });

// Requester side (Maestro, Gauntlet):
const { delivery } = await hire(client, { serviceId, requirement, maxPrice: 1.0 });
```
Set **`CROO_MOCK=true`** and every consumer runs fully offline — no wallet, no USDC, no WebSocket — which is how all five agents reproduce their flows in CI and local demos.

## 🧪 Testing & CI

**4-stage pipeline:** Quality → Security → Build → Deploy Gate

```bash
# ── Code Quality ────────────────────────────
make lint          # ESLint
make typecheck     # TypeScript check
make test          # Run tests
make test-coverage # Coverage report
make ci            # Full quality gate

# ── Security ────────────────────────────────
make security-scan # npm audit + license check
```

| Layer | Tool | Status |
|---|---|---|
| Code Quality | ESLint + TypeScript | ✅ |
| Unit Testing | Vitest (73 tests) | ✅ |
| Security (SAST) | CodeQL | ✅ |
| Security (SCA) | Dependabot + npm audit | ✅ |
| Secret Scanning | TruffleHog | ✅ |

## 📦 Releasing

Publishing is **tag-driven** — CI publishes to npm only when a `v*` tag is pushed
([`.github/workflows/publish.yml`](.github/workflows/publish.yml)). Versioning is
deliberate; there is **no** auto-increment on every commit.

```bash
npm version patch        # or minor / major — bumps package.json + creates tag v0.1.1
git push --follow-tags   # pushes the commit AND the tag → triggers the publish workflow
```

The workflow re-runs lint + typecheck + the 100% coverage gate + build, verifies the
tag matches `package.json`, then runs `npm publish --provenance --access public`.

> **One-time setup:** add an npm **automation token** as the `NPM_TOKEN` repository
> secret (Settings → Secrets and variables → Actions). Provenance requires a public repo.

## 📁 Project Structure
```text
dorahacks-croo-core/
├── docs/              # README assets (hero, screenshots)
├── src/               # Application source code
├── __tests__/         # Vitest test suites
├── .github/           # CI workflows
└── README.md          # You are here
```

## 📄 License
[MIT](LICENSE) © 2026 Edy Cu

## 🙏 Acknowledgments
Built for the DoraHacks CROO Hackathon 2026.
