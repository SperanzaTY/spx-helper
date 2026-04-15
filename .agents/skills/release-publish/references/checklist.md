# Checklist

## Pre-Flight

```bash
git rev-parse --abbrev-ref HEAD
npm run verify:hooks
git fetch gitlab release
git rev-list --count HEAD..gitlab/release
```

## Version Alignment

Keep these aligned:

- `package.json`
- `chrome-extension/manifest.json`
- `seatalk-agent/package.json`

## Release Notes And Docs

Update:

- `docs/RELEASE_LOG.md`
- module guide docs that match the changed code

## Push Flow

Preferred:

```bash
npm run push:release
```

If using raw GitLab push:

```bash
git push gitlab release
bash scripts/finish-release-push.sh
```
