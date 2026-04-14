# Human in the loop 

https://github.com/user-attachments/assets/c01e5f5c-aa16-4307-994f-850a7701eea0

Human-in-the-loop approval workflows for AI agents, gated by [World ID](https://world.org) proof-of-personhood.

Built on top of the [Workflow DevKit](https://useworkflow.dev) and the [Vercel AI SDK](https://ai-sdk.dev), this package lets an AI agent pause mid-execution and wait for a real, verified human to approve an action before continuing.

## Adding the package to your own app

### 1. Define the workflow

Create a workflow function and register `requestHumanAuthorization` as a tool on your `DurableAgent`:

```ts
// src/workflows/chat/index.ts
import { DurableAgent } from 'workflow/ai'
import { getWritable } from 'workflow'
import { openai } from '@workflow/ai/openai'
import { tools } from './steps/tools'

export async function chatWorkflow(messages: ModelMessage[]) {
  'use workflow'

  const writable = getWritable<UIMessageChunk>()
  const agent = new DurableAgent({
    model: openai('gpt-5.4'),
    tools,
    system: 'You are a helpful assistant. Before performing any sensitive action, use the approveAction tool.',
  })

  await agent.stream({ messages, writable })
}
```

### 2. Add the step

In your tool definitions, import `requestHumanAuthorization` and wire it up as a tool. Each tool's `execute` function must include `'use step'` — `requestHumanAuthorization` already has this built in:

```ts
// src/workflows/chat/steps/tools.ts
import { requestHumanAuthorization } from '@worldcoin/human-in-the-loop/workflows'

export const tools = {
  approveAction: {
    description: 'Request human approval via World ID before a sensitive action.',
    inputSchema: z.object({ summary: z.string() }),
    execute: requestHumanAuthorization(),
  },
  // your other tools (each with 'use step' in their execute function)
}
```

**About the action.** Every World ID verification is bound to an `action` string. It does **not** need to be registered anywhere (no World developer portal setup), but it **must be unique per verification** — that's how the resulting proof gets cryptographically tied to this specific approval rather than some other one. By default the package uses the `toolCallId`, which is already unique per call.

You can override with any value of your choosing — either a plain string (you take responsibility for uniqueness) or a function that derives one from the per-call context:

```ts
// Plain string — fine when you've already produced something unique upstream
execute: requestHumanAuthorization({ action: myUniqueOperationId })

// Function — derive from the call context (workflow run ID, input hash, resource id, ...)
execute: requestHumanAuthorization({
  action: ({ toolCallId, input }) => `booking:${toolCallId}`,
})
```

`signingKey` and `rpId` are read from `WORLD_SIGNING_KEY` and `WORLD_RP_ID` env vars by default. You can pass them explicitly if you need to source them from somewhere else (e.g. a request-scoped binding on Cloudflare Workers):

```ts
execute: requestHumanAuthorization({
  signingKey: c.env.WORLD_SIGNING_KEY,
  rpId: c.env.WORLD_RP_ID,
})
```

### 3. Handle on the client

Install the React bindings and drop the `<HumanApproval>` component into your message renderer. It finds the streamed approval context for the tool call, renders the IDKit widget, and POSTs the proof back to the webhook for you. `app_id` comes from `NEXT_PUBLIC_WORLD_APP_ID` by default.

```bash
bun add @worldcoin/human-in-the-loop-react
```

```tsx
import { HumanApproval } from '@worldcoin/human-in-the-loop-react'

{message.parts.map(part => {
  if (part.type === 'tool-approveAction' && 'toolCallId' in part) {
    return <HumanApproval key={part.toolCallId} message={message} part={part} />
  }
  // ...your other part renderers
})}
```

Need custom UI? Use the `useHumanApproval` hook directly and render your own button + `IDKitRequestWidget`:

```tsx
import { useHumanApproval } from '@worldcoin/human-in-the-loop-react'

const { ready, action, rpContext, verify, status } = useHumanApproval(message, part)
```

See `examples/flight-booking/src/app/page.tsx` for a working example.

## Prerequisites

- [Bun](https://bun.sh) (the workspace uses `bun.lock` and `bunfig.toml`)
- Node-compatible runtime for the Next.js example (Next.js 16)
- A [World ID](https://developer.world.org) developer app (for `app_id`, `rp_id`, and signing key)
- An OpenAI API key (the demo uses `gpt-5.4` via `@workflow/ai/openai`)

## Install

From the repo root:

```bash
bun install
```

This installs dependencies for every workspace (`packages/*` and `examples/*`).

## Build the package

`@worldcoin/human-in-the-loop` is consumed by the example via `workspace:*`, so you need to build it at least once before running the example (or run it in watch mode alongside).

> Note: Bun's `--filter` flag requires an `=` sign (e.g. `--filter='@worldcoin/human-in-the-loop'`, not `--filter '@worldcoin/human-in-the-loop'`). Alternatively, `cd` into the package directory and run the script directly.

```bash
# one-off build
bun --filter='@worldcoin/human-in-the-loop' run build

# or, watch mode during development
bun --filter='@worldcoin/human-in-the-loop' run dev
```

Other scripts available in `packages/human-in-the-loop/package.json`:

- `bun --filter='@worldcoin/human-in-the-loop' run typecheck` — `tsc --noEmit`

## Run the flight-booking example

### 1. Configure environment variables

Create `examples/flight-booking/.env.local`:

```bash
# OpenAI (used by @workflow/ai/openai in the chat workflow)
OPENAI_API_TOKEN=sk-...

# World ID — server-side (used by @worldcoin/human-in-the-loop)
WORLD_RP_ID=your_rp_id
WORLD_SIGNING_KEY=your_signing_key

# World ID — client-side (used by the IDKitRequestWidget)
NEXT_PUBLIC_WORLD_APP_ID=app_...
```

Where these come from:

| Variable | Used in | Purpose |
| --- | --- | --- |
| `OPENAI_API_TOKEN` | `src/workflows/chat/index.ts` | LLM provider for the `DurableAgent` |
| `WORLD_RP_ID` | `packages/human-in-the-loop/src/workflows/human-approval.ts` | Relying-party ID passed to World ID verify endpoint |
| `WORLD_SIGNING_KEY` | same | Signs the approval request (`signRequest`) |
| `NEXT_PUBLIC_WORLD_APP_ID` | `<HumanApproval>` from `@worldcoin/human-in-the-loop-react` | `app_id` for `IDKitRequestWidget` |

### 2. Start the dev server

```bash
bun --filter='flight-booking-example' run dev
```

Then open http://localhost:3000.

Other example scripts:

- `bun --filter='flight-booking-example' run build` — production build (`next build --turbopack`)
- `bun --filter='flight-booking-example' run start` — run the built app
- `bun --filter='flight-booking-example' run clean` — remove `.next` and `.swc`

## How it works

The demo walks through the full end-to-end flow:

1. The user chats with the flight-booking agent at `/` (`src/app/page.tsx`).
2. `POST /api/chat` starts a durable workflow via `start(chatWorkflow, ...)` (`src/app/api/chat/route.ts`).
3. `chatWorkflow` runs a `DurableAgent` with the flight tools (`src/workflows/chat/index.ts`).
4. Before any booking, the agent is required (by system prompt) to call the `bookingApproval` tool, which is wired to `requestHumanAuthorization` from `@worldcoin/human-in-the-loop/workflows` (`src/workflows/chat/steps/tools.ts`).
5. `requestHumanAuthorization` creates a Workflow webhook, streams `{ webhookUrl, action, rpContext }` to the client as a `data-approval-context` chunk, and awaits the POST.
6. The client's `<HumanApproval>` component (from `@worldcoin/human-in-the-loop-react`) reads the streamed context and opens `IDKitRequestWidget`. When the user completes the World ID flow, the proof is POSTed to the webhook URL.
7. The workflow resumes, calls `https://developer.world.org/api/v4/verify/{rp_id}` to verify the proof, responds to the webhook, disposes it, and returns the proof to the agent — which then proceeds to `bookFlight`.

## License

MIT
