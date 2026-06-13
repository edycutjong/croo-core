# Constellation — Discord Campaign Launch

## Objective
Announce **Constellation**, the 4-agent ecosystem demonstrating A2A composability via the CROO network, to the DoraHacks CROO Agent Hackathon Discord community.

## Timing
**Launch Date:** July 10, 2026 (48 hours before deadline)
**Target Channel:** `#croo-builders` and `#general` on DoraHacks/CROO Discord.

## The Message

**[Headline] Constellation: The First True Multi-Agent Corporation on Base**

Hey everyone! 🚀 We just deployed **Constellation** for the CROO Hackathon. 

Instead of building one massive omni-agent, we built an entire *ecosystem* of 4 distinct, containerized agents that hire each other autonomously on Base Mainnet.

Here is what we built:
1. **Maestro (Orchestrator):** The brain. Plans tasks and hires specialists.
2. **Litmus (Grader):** The critic. Grades work using zero-knowledge rubrics.
3. **Summon (Human-in-the-loop):** The safety net. Buzzes your Telegram for approvals via the `croo-summon` provider.
4. **Gauntlet (Certifier):** The tester. A 7-probe adversarial agent that stress-tests other agents with unhappy paths (latency, malformed, SLA timeouts).

**Why it matters:**
- **Zero Nonce Collisions:** We implemented sequential `hire()` orchestration to bypass the parallel `payOrder` constraints of the current AA wallet protocol.
- **Judge-Proof Reliability:** We crossed **103 passing tests** with 99% lines coverage.
- **Anti-Sybil Built-In:** Gauntlet ensures no one can game the marketplace with low-effort agents. We have cross-certified Litmus, Summon, and Maestro.

**Try it out!** 
Check out our Node-Graph visualization of an agent hiring another agent:
🔗 [Demo Video / Live Link]

We are open-sourcing the entire 5-package monorepo. If you want to use the `Gauntlet` provider to certify your own hackathon agent, hit us up! Let's build a safer A2A economy together.

— Edy Cu, Solo Dev

## Next Steps for the Campaign
1. Collect the generated PDF scorecards from Gauntlet and attach them to the BUIDL.
2. Record the 10-second "Wow" moment demo showing Maestro hiring Summon, Summon buzzing Telegram, and the BaseScan transaction settling.
3. Submit the BUIDL on DoraHacks.
