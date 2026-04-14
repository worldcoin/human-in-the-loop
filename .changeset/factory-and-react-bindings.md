---
'@worldcoin/human-in-the-loop': minor
---

Convert `requestHumanAuthorization` to a factory. Pass `{ action?, signingKey?, rpId? }` and call the result as the tool's `execute`. `action` is now optional and defaults to `toolCallId` (already unique per verification) — it does not need to be registered anywhere. `signingKey` and `rpId` fall back to `WORLD_SIGNING_KEY` / `WORLD_RP_ID` env vars by default; pass them explicitly to override (e.g. for Cloudflare Workers where credentials are request-scoped). The streamed `data-approval-context` chunk now also carries the bound `action` so the client can read it from the stream instead of hardcoding it.

**Migration.** Update tool definitions from:

```ts
execute: requestHumanAuthorization
```

to:

```ts
execute: requestHumanAuthorization()
```

Client-side, install the new `@worldcoin/human-in-the-loop-react` package and use `<HumanApproval>` (or the `useHumanApproval` hook) instead of hand-rolling the `IDKitRequestWidget` wiring.
