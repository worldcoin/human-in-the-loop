# @worldcoin/human-in-the-loop

Request and verify human approval in Workflow and AI SDK tools. The human reviews an operation and authenticates with World ID. The package returns a signed receipt for the application to verify before it performs the operation.

## Setup

```bash
bun add @worldcoin/human-in-the-loop
```

Set `WORLD_ID_CLIENT_ID` and `WORLD_ID_CLIENT_SECRET` in the server environment. Use a confidential OIDC client registered with `client_secret_basic` or `client_secret_post`.

The default issuer is `https://auth.world.org`, and the default client authentication method is `client_secret_basic`. Set `WORLD_ID_ISSUER` and `WORLD_ID_CLIENT_AUTH_METHOD` to match your client configuration.

See the [application guide](https://github.com/worldcoin/human-in-the-loop#readme) for client registration, Workflow setup, and React integration.

## Request approval

Use `requestHumanAuthorization()` as a tool's `execute` function in a Workflow `DurableAgent`:

```ts
import { requestHumanAuthorization } from '@worldcoin/human-in-the-loop/workflows'

const execute = requestHumanAuthorization()
```

The helper waits for the human's decision and fresh World ID authentication. It returns `{ action, approvalId, receipt }`.

By default, `action` is the AI SDK `toolCallId`. To bind approval to operation inputs, pass an `action` function that receives `input` and the tool-call context. Include every field that affects the operation and a stable operation ID. The [application guide](https://github.com/worldcoin/human-in-the-loop#add-the-approval-tool) shows an example.

The returned function runs in workflow scope. The package manages its network steps and polling delays.

## Verify approval

Call `verifyHumanAuthorization(result, expectedAction)` inside the Workflow step that performs the operation. Derive `expectedAction` from the operation inputs, using the same rule as the approval tool.

Verification checks the receipt's signature, expiry, client, action, and current Workflow run. It returns `{ action, approvalId }`. Use `approvalId` as an idempotency key that your application service stores and enforces.

Receipts last at most five minutes. They can be verified more than once during that period. Keep the same client secret across workers because the package uses it to derive the receipt signing key.

Both helpers accept `issuer`, `clientId`, `clientSecret`, and `clientAuthMethod` options. Prefer server environment variables for credentials. Explicit options are stored in Workflow step arguments.

For a complete example, see [verification before the protected operation](https://github.com/worldcoin/human-in-the-loop#verify-before-the-protected-operation).

## Upgrade

This release replaces raw IDKit proofs with approval receipts and changes the client configuration. Upgrade the server and React packages together. Follow the [migration steps](https://github.com/worldcoin/human-in-the-loop#upgrade-from-idkit).

## License

MIT
