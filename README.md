# Human in the loop

Human approval for AI agents with [World ID](https://world.org), the [Workflow SDK](https://useworkflow.dev), and the [Vercel AI SDK](https://ai-sdk.dev).

The agent pauses while the human reviews an operation and authenticates with World ID. The package returns a signed approval receipt. Your application verifies that receipt before it performs the operation.

## Install

Use AI SDK 5 and Workflow SDK 4.2.0-beta.70 or a later 4.x release. Add both packages to your application:

```bash
bun add @worldcoin/human-in-the-loop @worldcoin/human-in-the-loop-react
```

For Next.js, configure the Workflow SDK with `withWorkflow`. The [flight booking example](examples/flight-booking/README.md) includes a complete application.

## Configure World ID

Register a confidential OpenID Connect (OIDC) client in the World IdP developer portal. Select `client_secret_basic` or `client_secret_post` as its authentication method. Enter a redirect URI when the portal requests one. This package uses device authorization, so approval completes through server polling.

Set these environment variables on the server:

```dotenv
WORLD_ID_CLIENT_ID=your-client-id
WORLD_ID_CLIENT_SECRET=your-client-secret
```

The default issuer is `https://auth.world.org`, and the default authentication method is `client_secret_basic`. Set these optional variables for a sandbox client or a different registered method:

```dotenv
WORLD_ID_ISSUER=https://sandbox.auth.world.org
WORLD_ID_CLIENT_AUTH_METHOD=client_secret_post
```

Keep the client secret in server environment variables. Use the same secret across the application's workers. Changing the secret invalidates approval receipts signed with the previous secret.

Each device authorization request requires fresh World ID authentication and approval on the IdP page. The supported authentication method proves possession of an Orb v3 credential.

## Add the approval tool

Register an approval tool on your `DurableAgent`. Define an action string that includes all inputs that affect the operation:

```ts
import { z } from 'zod'
import { requestHumanAuthorization } from '@worldcoin/human-in-the-loop/workflows'

const operationSchema = z.object({ operationId: z.string(), amount: z.number() })
type Operation = z.infer<typeof operationSchema>
const actionFor = (input: Operation) => JSON.stringify([input.operationId, input.amount])

export const approveAction = {
	description: 'Request human approval for this operation.',
	inputSchema: operationSchema,
	execute: requestHumanAuthorization<Operation>({
		action: ({ input }) => actionFor(input),
	}),
}
```

Use the same action function when you verify approval. Include a stable operation ID to distinguish separate operations with identical inputs.

The `action` option accepts a string or a function that receives `input` and the AI SDK tool-call context. Without this option, the action defaults to `toolCallId`.

The returned `execute` function runs in workflow scope. Assign it directly to the tool. The package runs network requests in steps and uses durable sleeps between polls.

## Show the approval component

Render `HumanApproval` for the approval tool's message part:

```tsx
'use client'

import { HumanApproval, type HumanApprovalProps } from '@worldcoin/human-in-the-loop-react'

export function Approval({ message, part }: HumanApprovalProps) {
	return <HumanApproval message={message} part={part} />
}
```

The component shows the action, its inputs, and a user code. The human selects **Approve with World ID** or **Reject**. Approval opens World ID in a new tab. The human compares the user code and completes authentication. The component shows success after the server validates the result.

Use `triggerLabel`, `successContent`, and `className` to customize the component. For a custom interface, use [`useHumanApproval`](packages/human-in-the-loop-react/README.md#custom-ui).

## Verify before the protected operation

The approval tool returns a `HumanApprovalResult`:

```ts
interface HumanApprovalResult {
	action: string
	approvalId: string
	receipt: string
}
```

Pass the complete result to the tool that performs the operation. Verify it inside that tool's Workflow step, using the expected action derived from the operation inputs:

```ts
import { verifyHumanAuthorization, type HumanApprovalResult } from '@worldcoin/human-in-the-loop/workflows'

async function performOperation({ approval, ...operation }: Operation & { approval: HumanApprovalResult }) {
	'use step'

	const { approvalId } = await verifyHumanAuthorization(approval, actionFor(operation))
	return yourService.perform(operation, { idempotencyKey: approvalId })
}
```

Here, `yourService.perform` represents your application service. It must store and enforce `approvalId` as an idempotency key so that repeated calls perform the operation only once.

Verification checks the receipt's signature, expiry, client, action, and Workflow run. Receipts last at most five minutes and can be verified more than once during that period.

World ID verifies authentication. The package records the human's action decision and binds it to the receipt. Your application controls who can view and approve each request. Send the approval link only to the intended human.

## Configuration and runtime behavior

Both helpers accept `issuer`, `clientId`, `clientSecret`, and `clientAuthMethod` options to override environment variables. Use the same configuration for approval and verification. Prefer environment variables for credentials because explicit options are stored in Workflow step arguments.

Workflow 4 keeps the decision deadline after the human responds. It can schedule an extra wake or report a pending sleep when a run ends. The integration tests check that the later wake does not repeat approval or the protected operation.

The package follows the IdP's polling interval and adjusts it when the IdP requests a delay. Rejection, expiry, and validation errors end the attempt. If an initiation or token request fails, start a new approval attempt.

The server validates IdP tokens within a polling step and returns the approval result to the agent. Workflow stores pending device codes in its event data. Restrict access to that data and its inspection tools; encryption depends on the Workflow backend.

## Upgrade from IDKit

This release changes the server and React APIs. Upgrade both packages together.

1. Register an IdP client and set `WORLD_ID_CLIENT_ID` and `WORLD_ID_CLIENT_SECRET`. Remove `WORLD_RP_ID`, `WORLD_SIGNING_KEY`, and `NEXT_PUBLIC_WORLD_APP_ID` from this integration.
2. Remove the `rpId` and `signingKey` options from `requestHumanAuthorization`. Keep an action that includes all operation inputs.
3. Replace raw `IDKitResult` handling with `HumanApprovalResult`. Call `verifyHumanAuthorization` in the step that performs the operation.
4. Remove the `appId`, `preset`, and `allowLegacyProofs` props from `HumanApproval`. For custom interfaces, replace `rpContext` and `verify(proof)` with `verificationUri`, `approve()`, and `reject()`.
5. Start new approval requests after deployment. Pending IDKit requests cannot complete through the IdP flow.

## Develop and test

Use Bun and a Node.js runtime supported by your Workflow and Next.js versions. Run these commands from the repository root:

```bash
bun install
bun run check
```

`bun run check` builds both packages, checks types, and runs all tests. To run integration tests separately, first run `bun run build`. The release command runs the same checks before publication.

Tests use a local mock IdP and signed test tokens. Integration tests load the built package and run Workflow steps, webhooks, and sleeps. World ID and model credentials are only needed to run the [flight booking example](examples/flight-booking/README.md).

## License

MIT
