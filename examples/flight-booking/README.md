# Flight booking example

A Next.js chat application that uses a durable AI agent and World ID to approve mock flight bookings.

## Setup

You need an OpenAI API key and a confidential World IdP client. Follow the [World ID configuration guide](../../README.md#configure-world-id) to register the client.

Run these commands from the repository root:

```bash
bun install
bun run --filter './packages/*' build
cp examples/flight-booking/.env.example examples/flight-booking/.env.local
```

In `examples/flight-booking/.env.local`, set `OPENAI_API_KEY`, `WORLD_ID_CLIENT_ID`, and `WORLD_ID_CLIENT_SECRET`. Set `WORLD_ID_ISSUER` and `WORLD_ID_CLIENT_AUTH_METHOD` to match your client configuration.

Start the application:

```bash
bun run --filter flight-booking-example dev
```

## Try a booking

1. Open [localhost:3000](http://localhost:3000) and ask for flights between two cities on a specific date.
2. Select a flight and give the passenger name and seat preference.
3. Review the booking details and select **Approve with World ID**.
4. Compare the user code on the World ID page and complete authentication.
5. Return to the chat. The agent confirms the mock booking after the server verifies approval.

## How approval works

The approval action includes the quote ID, flight number, departure, price, currency, passenger name, and seat preference. The booking tool checks the receipt against those fields and the current Workflow run.

Repeated use of one approval returns the same mock confirmation number. To connect a real booking service, validate the quote against that service's records. Store and enforce the approval ID as an idempotency key so that repeated calls create one booking.

See the [application guide](../../README.md) for the integration steps and test commands.
