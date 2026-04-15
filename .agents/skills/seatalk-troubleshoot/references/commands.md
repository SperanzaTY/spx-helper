# Commands

## Process Checks

```bash
ps aux | grep -E 'tsx.*main|agent.*approve' | grep -v grep
lsof -i :19222 -t
```

## Start The Agent

```bash
cd seatalk-agent && SEATALK_LAUNCHER=1 bash launch.sh
cd seatalk-agent && npx tsx src/main.ts
```

## CDP Checks

```bash
curl -s http://127.0.0.1:19222/json
node scripts/verify-cdp.js
```

## Logs

```bash
tail -50 ~/.seatalk-agent/logs/agent.log
cat ~/.seatalk-agent/logs/restart.log
```

## Key Files

- `seatalk-agent/src/main.ts`
- `seatalk-agent/src/bridge.ts`
- `seatalk-agent/src/cdp.ts`
- `seatalk-agent/src/acp.ts`
- `seatalk-agent/src/inject/sidebar-app.js`
- `seatalk-agent/src/inject/seatalk-watch.js`
