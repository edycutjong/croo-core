<div align="center">
  <img src="docs/icon-animated.svg" alt="Core Logo" width="120">

  <h1>Croo Core ⚙️</h1>
  <p><em>Shared CROO SDK wrapper for the Constellation agent suite</em></p>

  <br/>

  [![Live Demo](https://img.shields.io/badge/🚀_Live-Demo-06b6d4?style=for-the-badge)](https://mock.croo.network)
  [![Built for CROO Hackathon](https://img.shields.io/badge/DoraHacks-CROO_Hackathon_2026-8b5cf6?style=for-the-badge)](https://dorahacks.io)

  <br/>

  ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
  ![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
  [![CI](https://github.com/edycutjong/croo-core/actions/workflows/ci.yml/badge.svg)](https://github.com/edycutjong/croo-core/actions/workflows/ci.yml)

</div>

---

## 📸 See it in Action

<div align="center">
  <img src="docs/readme.png" alt="Core Demo" width="100%">
</div>

> **The Core SDK Workflow.** Initialize Client → Connect to Web3 Wallet → Establish A2A Connection → Interact with Constellation Suite.

---

## 💡 The Problem & Solution
Developing autonomous agents that securely communicate and transact on-chain requires massive boilerplate.
**Croo Core** provides a unified SDK wrapper for the entire Constellation agent suite. It abstracts away the complexity of A2A (Agent-to-Agent) communication, cryptographic signing, and wallet integration, allowing agent developers to focus on specialized logic rather than infrastructure.

**Key Features:**
- 🔌 **Unified Interface:** A single, consistent API for interacting with the entire Croo ecosystem.
- 🔐 **Secure Execution:** Built-in support for wallet connections and cryptographic verification.
- ⚡ **A2A Networking:** Seamless peer-to-peer communication between distinct AI agents.

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
| Unit Testing | Vitest | ✅ |
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
