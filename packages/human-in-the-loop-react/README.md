# @worldcoin/human-in-the-loop-react

React bindings for [`@worldcoin/human-in-the-loop`](https://www.npmjs.com/package/@worldcoin/human-in-the-loop). Renders the World ID approval flow on the client when an AI agent pauses for human authorization.

This package only handles the client side. You also need `@worldcoin/human-in-the-loop` on your server, wired into a Workflow SDK / AI SDK tool — see the [main repo README](https://github.com/worldcoin/human-in-the-loop#readme) for the server setup.

## Install

```bash
bun add @worldcoin/human-in-the-loop-react
# or
npm install @worldcoin/human-in-the-loop-react
```

Peer dependencies: `react >=18`, `ai >=5`, `@worldcoin/idkit >=4`.

## Environment

```bash
NEXT_PUBLIC_WORLD_APP_ID=app_...
```

The component reads `app_id` from this env var by default. You can override it via the `appId` prop instead.

## `<HumanApproval>` — drop-in component

The 80% case. Drop it into your message renderer wherever the approval tool's part shows up.

```tsx
import { HumanApproval } from '@worldcoin/human-in-the-loop-react'

{message.parts.map(part => {
  if (part.type === 'tool-approveAction' && 'toolCallId' in part) {
    return <HumanApproval key={part.toolCallId} message={message} part={part} />
  }
  // ...your other part renderers
})}
```

It finds the streamed `data-approval-context` chunk for this tool call, renders a "Verify with World ID" button, opens `IDKitRequestWidget` when clicked, POSTs the proof back to the server's webhook, and shows a success or error state.

### Props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `message` | `UIMessage` | required | The full message containing the tool part — used to locate the streamed approval context. |
| `part` | `UIMessagePart` | required | The tool-call part. Must include `toolCallId`. |
| `appId` | `` `app_${string}` `` | `process.env.NEXT_PUBLIC_WORLD_APP_ID` | World developer portal app ID. |
| `preset` | `Preset` | `orbLegacy()` | IDKit preset. |
| `allowLegacyProofs` | `boolean` | `false` | Accept v3 World ID proofs as a fallback. |
| `triggerLabel` | `ReactNode` | `'Verify with World ID'` | Button label. |
| `successContent` | `ReactNode` | `'Approved with World ID.'` | Content shown after the proof verifies. |
| `className` | `string` | — | Applied to the outer wrapper. The component ships unstyled — bring your own CSS. |

The component is wrapped in `React.memo`, so it only re-renders when `message`, `part`, or its other props change.

## `useHumanApproval` — headless hook

For custom UI. The hook handles all the wiring — finding the chunk, exposing the verify callback, tracking state — and lets you render whatever you want.

```tsx
import { useHumanApproval } from '@worldcoin/human-in-the-loop-react'
import { IDKitRequestWidget, orbLegacy } from '@worldcoin/idkit'
import { useState } from 'react'

function MyApproval({ message, part }) {
  const [open, setOpen] = useState(false)
  const { ready, action, rpContext, state, verify } = useHumanApproval(message, part)

  if (state.status === 'verified') return <p>Approved.</p>

  return (
    <>
      <button disabled={!ready} onClick={() => setOpen(true)}>
        {state.status === 'verifying' ? 'Verifying…' : 'Approve'}
      </button>
      {state.status === 'error' && <p>{state.error.message}</p>}

      {ready && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          onSuccess={() => {}}
          handleVerify={verify}
          app_id={process.env.NEXT_PUBLIC_WORLD_APP_ID as `app_${string}`}
          action={action!}
          rp_context={rpContext!}
          preset={orbLegacy()}
          allow_legacy_proofs={false}
        />
      )}
    </>
  )
}
```

### Return value

| Field | Type | Notes |
| --- | --- | --- |
| `ready` | `boolean` | True once the streamed approval context has arrived from the server. |
| `action` | `string \| undefined` | The action string the server signed for this tool call. Pass to `IDKitRequestWidget`'s `action`. |
| `rpContext` | `RpContext \| undefined` | Pass to `IDKitRequestWidget`'s `rp_context`. |
| `webhookUrl` | `string \| undefined` | The webhook URL the proof gets POSTed to. The hook handles this for you via `verify`; exposed for advanced cases. |
| `state` | `HumanApprovalState` | Discriminated union: `{ status: 'idle' \| 'verifying' \| 'verified' } \| { status: 'error', error }`. |
| `verify` | `(proof: IDKitResult) => Promise<void>` | Wire to `IDKitRequestWidget.handleVerify`. POSTs the proof to the webhook and updates `state`. |

The hook caches the first hit on the streamed `data-approval-context` chunk, so it doesn't rescan `message.parts` on every streaming token.

## License

MIT
