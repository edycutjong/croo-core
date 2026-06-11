# croo-core

Shared SDK wrapper for the [CROO Agent Hackathon](https://dorahacks.io/) constellation — **Maestro**, **Summon**, **Litmus**, and **Gauntlet**.

## What's inside

| Export | Purpose |
|---|---|
| `makeClient(sdkKey)` | Factory for `AgentClient` with shared Base Mainnet config |
| `runProvider(client, handlers)` | WebSocket provider loop with SLA-safe refund guard |
| `hire(client, request, trace?)` | Sequential requester helper (never parallel `payOrder`) |
| `isMockMode()` | Check if `CROO_MOCK=true` for offline development |
| `EventType` | WebSocket event name constants |

## Install

```bash
npm install
npm run build
```

Each agent references this package as a local dependency:
```json
{ "dependencies": { "croo-core": "file:../dorahacks-croo-core" } }
```

## Mock Mode

Set `CROO_MOCK=true` to run the full pipeline without spending USDC:
```bash
CROO_MOCK=true npm run dev
```

## Tests

```bash
npm test              # run tests
npm run test:coverage # with coverage
```

## License

MIT
