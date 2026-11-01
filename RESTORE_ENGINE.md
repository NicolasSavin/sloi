# Restore engine.ts

`src/lib/smc/engine.ts` was accidentally truncated while applying the sweep filter.

## Fix (local)

```bash
git fetch origin
git checkout 0f5cbb7f1d408e55a948a682069e94e2c81e3732 -- src/lib/smc/engine.ts
git apply patches/buildSetup-sweep.patch
git add src/lib/smc/engine.ts
git commit -m "Restore engine + tighten buildSetup (sweep + structure)"
git push
```

## What the patch does

- Against-trend entries only after a confirmed SSL/BSL sweep into a live zone
- Prefers sweep setups over pure zone proximity
- Tags thesis with the sweep level when present

## Vercel

Signals feed is currently `DEPLOYMENT_DISABLED` / payment required. After restoring code, re-enable the Vercel deployment for `sloi-kohl.vercel.app`.
