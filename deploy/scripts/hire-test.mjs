#!/usr/bin/env node
// Hire ONE live CROO agent and print the delivery.
// The requester pays, so REQUESTER_SDK_KEY must be a FUNDED CROO SDK key
// (your Navigator, or a funded agent).
//
//   cd deploy/scripts && npm install
//   export REQUESTER_SDK_KEY=<funded key>
//   node hire-test.mjs worker '{"topic":"ERC-4337 account abstraction tradeoffs"}'
import { makeClient, hire } from '@edycutjong/croo-core';

const SERVICE_IDS = {
  worker:     '619bfff2-3297-4a62-bc91-61bdf69c23a9',
  litmus:     '516e6fd0-7270-47f1-b431-3d4596b848a2',
  goldilocks: '570e4562-04c3-4b52-ad84-afd6f48d0bf6',
  gauntlet:   'a6982cf5-502c-41c1-971e-2e7eef4ed2e9',
  summon:     '4d8cbcb2-bfc7-4b60-b6f9-7919ff81e574',
  maestro:    '625f15c8-61ba-4b11-8201-0bb019ef5ef2',
};

const [agent, reqJson] = process.argv.slice(2);
const key = process.env.REQUESTER_SDK_KEY;

if (!agent || !SERVICE_IDS[agent]) {
  console.error(`Usage: node hire-test.mjs <${Object.keys(SERVICE_IDS).join('|')}> '<requirement-json>'`);
  process.exit(1);
}
if (!key) {
  console.error('Set REQUESTER_SDK_KEY to a FUNDED CROO SDK key (the requester pays for the hire).');
  process.exit(1);
}

let requirement = {};
try { requirement = reqJson ? JSON.parse(reqJson) : {}; }
catch (e) { console.error('requirement must be valid JSON:', e.message); process.exit(1); }

const serviceId = SERVICE_IDS[agent];
console.log(`→ hiring ${agent} (${serviceId})`);
console.log('  requirement:', requirement);

const client = makeClient(key);
try {
  const result = await hire(
    client,
    { serviceId, requirement, maxPrice: 5.0 },   // maxPrice ceiling in USDC
    (t) => { if (t && t.type) console.log(`  · ${t.type}`); }, // trace: negotiate → pay → deliver
  );
  console.log('\n✅ delivered');
  console.log('  orderId:   ', result.orderId);
  console.log('  txHash:    ', result.txHash);
  console.log('  amountPaid:', result.amountPaid, 'USDC');
  console.log('  delivery:  ', JSON.stringify(result.delivery, null, 2));
} catch (e) {
  console.error('\n❌ hire failed:', (e && e.message) || e);
  console.error('   (insufficient funds? agent offline? bad requirement shape?)');
  process.exit(1);
} finally {
  if (client && typeof client.disconnect === 'function') await client.disconnect();
}
