# CDP Verification

Use this when the release touches `seatalk-agent/src/`.

## Checks

```bash
ps aux | grep -E 'tsx.*main' | grep -v grep
curl -s http://127.0.0.1:19222/json | head -3
cd seatalk-agent && npx tsc --noEmit
node scripts/verify-cdp.js
```

## What Success Looks Like

- agent is running
- CDP is reachable
- TypeScript passes
- sidebar and injected globals are present
- no duplicate panel or button elements
