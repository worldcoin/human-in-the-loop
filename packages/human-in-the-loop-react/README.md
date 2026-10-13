# @worldcoin/human-in-the-loop-react

Show human approval requests from `@worldcoin/human-in-the-loop` in a React chat interface.

```bash
bun add @worldcoin/human-in-the-loop-react
```

Requires React 18 or later and AI SDK 5. Configure the server package with the [application guide](https://github.com/worldcoin/human-in-the-loop#readme).

## Component

Render `HumanApproval` for the approval tool's message part:

```tsx
'use client'

import { HumanApproval, type HumanApprovalProps } from '@worldcoin/human-in-the-loop-react'

export function Approval({ message, part }: HumanApprovalProps) {
	return <HumanApproval message={message} part={part} />
}
```

The component shows the action, its inputs, and a user code. The human can select **Approve with World ID** or **Reject**. Approval opens World ID in a new tab. The human compares the user code and completes authentication. The component shows success after the server validates the result.

| Prop             | Purpose                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `message`        | AI SDK message with the approval context and status                 |
| `part`           | The approval tool's message part                                    |
| `triggerLabel`   | Approve button content; defaults to `Approve with World ID`         |
| `successContent` | Content shown after approval; defaults to `Approved with World ID.` |
| `className`      | CSS class on the outer wrapper                                      |

## Custom UI

Use `useHumanApproval` in a client component to read the request and send a decision:

```tsx
import { useHumanApproval } from '@worldcoin/human-in-the-loop-react'

const { ready, action, input, verificationUri, userCode, expiresAt, state, approve, reject } = useHumanApproval(
	message,
	part
)
```

Enable decision controls when `ready` is true. It is false while a decision is in progress or after the request ends. Show `action`, `input`, and `userCode` before the human decides. `expiresAt` is the request deadline as a Unix timestamp in milliseconds.

On approval, open `verificationUri` in a new tab from the click handler, then call `approve()` to save the decision. Use `noopener,noreferrer` when opening the tab. The hook leaves navigation to your component. Call `reject()` to reject the request.

Read `state.status` to display progress:

| Status      | Meaning                                                    |
| ----------- | ---------------------------------------------------------- |
| `idle`      | Waiting for a decision                                     |
| `verifying` | Saving the decision or waiting for World ID authentication |
| `verified`  | The server confirmed approval                              |
| `rejected`  | The request was rejected                                   |
| `expired`   | The approval deadline passed                               |
| `error`     | The request failed; details are in `state.error`           |

Wait for `verified` before showing success. The operation's server step must still verify the returned receipt before it acts.

For direct webhook integration, the hook also exposes `webhookUrl`. Send a JSON POST request with `decision` set to `approve` or `reject` and `action` set to the hook's action value. Set `Content-Type: application/json`. Keep the approval context private to the intended human's conversation.

## Upgrade

This release removes the `appId`, `preset`, and `allowLegacyProofs` props. It also removes `rpContext` and `verify(proof)`. Upgrade the server and React packages together. Follow the [migration steps](https://github.com/worldcoin/human-in-the-loop#upgrade-from-idkit).

## License

MIT
