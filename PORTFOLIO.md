# The CROO Constellation: Agent Ecosystem Portfolio

This document outlines the **CROO Constellation** — a suite of 6 specialized agents and 1 core SDK designed for the DoraHacks CROO Agent Hackathon 2026. Together, these tools form a robust, secure, and economically viable ecosystem for autonomous on-chain operations.

---

## 🌌 The Constellation Overview

While single, monolithic agents often fail due to lack of specialized context, poor quality assurance, and unchecked execution, the Constellation approach distributes these responsibilities. The ecosystem relies on specialized, narrowly scoped agents communicating seamlessly via **Croo Core**.

### The Foundation: [Croo Core](../dorahacks-croo-core)
- **Role:** Shared SDK Wrapper
- **Function:** Abstracts away the complexity of A2A (Agent-to-Agent) networking, cryptographic signing, and wallet integration. It is the connective tissue that allows the constellation to communicate securely on the Constellation A2A network.

### 1. [Maestro](../dorahacks-croo-maestro)
- **Role:** The Orchestrator
- **Function:** Instead of doing the work itself, Maestro receives a complex prompt, breaks it down, and autonomously hires specialized agents on-chain. It oversees their execution, consolidates their outputs, and delivers a single vetted result to the user.

### 2. [Goldilocks](../dorahacks-croo-goldilocks)
- **Role:** The Pricing Oracle
- **Function:** Before an agent sets a price or before Maestro hires a worker, Goldilocks surveys comparable services on the CROO Agent Store and factors in demand signals to recommend a statistically justified price point. It prevents agents from underpricing to a loss or overpricing to zero demand.

### 3. [Gauntlet](../dorahacks-croo-gauntlet)
- **Role:** The Certifier
- **Function:** Before an agent is trusted with capital or hired by Maestro, Gauntlet subjects it to 7 adversarial probes (including prompt injection and hallucination tests). It issues an objective, cryptographically signed security scorecard to prove the agent's resilience.

### 4. [Litmus](../dorahacks-croo-litmus)
- **Role:** The Quality Gate
- **Function:** When a hired specialist delivers its work, Litmus evaluates the deliverable against a strict, predefined rubric. It issues a deterministic 0-100 grade on-chain, acting as the automated QA engineer. If the work is substandard, it is rejected before the final payout.

### 5. [Summon](../dorahacks-croo-summon)
- **Role:** The Human-in-the-Loop
- **Function:** For high-stakes or ambiguous decisions, agents (like Maestro) can hire Summon. Summon halts execution, pings a designated human operator via Telegram, and waits for a deterministic Approve/Reject signal before allowing the transaction to proceed.

### 6. [Worker](../dorahacks-croo-worker)
- **Role:** The Researcher / Producer
- **Function:** Sits at the top of the pipeline. Any agent can hire Worker with a topic; it returns a structured, sourced research draft (`{ draft, sources }`) — exactly the input Litmus grades and Maestro consolidates. Maestro hires it first, and re-hires it as the fallback researcher (with the grader's critique) during its self-correction loop.

---

## 🔄 The Composite Workflow

The true power of the Constellation emerges when the agents compose together:

1. **Pricing & Certification (Pre-Execution):**
   - An independent agent developer builds a new worker agent.
   - They use **Goldilocks** to set a competitive, data-backed price.
   - They pay **Gauntlet** to test their agent and earn a certified security scorecard.

2. **Orchestration (Execution):**
   - A user asks **Maestro** to perform a complex on-chain task.
   - **Maestro** hires **Worker** (the certified, correctly-priced research producer) to generate the draft.
   
3. **Quality Assurance & Sign-Off (Post-Execution):**
   - The worker agent completes the task and submits the deliverable to Maestro.
   - **Maestro** hires **Litmus** to grade the deliverable. Litmus returns a score of 92/100.
   - Because the task involves spending significant USDC, **Maestro** hires **Summon**.
   - **Summon** alerts the human via Telegram. The human taps "Approve".
   - **Maestro** finalizes the workflow, settles payments, and returns the result to the user.

## 🛠️ SDK Integration

Every agent in this constellation relies heavily on `croo-core`. The core SDK reduces hundreds of lines of A2A handshake boilerplate into simple asynchronous methods:
- `connectWebSocket()`
- `listOrders()` & `getOrder()`
- `acceptNegotiation()`
- `deliverOrder()`
- `rejectOrder()`

By standardizing on `croo-core`, any new agent can seamlessly join the constellation, immediately gaining access to orchestration (Maestro), quality control (Litmus), certification (Gauntlet), pricing (Goldilocks), and human oversight (Summon).
