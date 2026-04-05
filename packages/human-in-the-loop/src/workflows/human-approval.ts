import type { UIMessageChunk } from 'ai'
import { signRequest } from '@worldcoin/idkit-server'
import type { IDKitResult } from '@worldcoin/idkit-core'
import { createWebhook, getWritable, type RequestWithResponse } from 'workflow'

/** Stream the webhook URL and rp_context to the client */
async function emitApprovalContext(toolCallId: string, webhookUrl: string) {
	'use step'

	const { sig, nonce, createdAt, expiresAt } = signRequest('approve-booking', process.env.WORLD_SIGNING_KEY!)

	const writable = getWritable<UIMessageChunk>()
	const writer = writable.getWriter()
	await writer.write({
		id: toolCallId,
		type: 'data-approval-context',
		data: {
			webhookUrl,
			rpContext: {
				nonce,
				signature: sig,
				created_at: createdAt,
				expires_at: expiresAt,
				rp_id: process.env.WORLD_RP_ID!,
			},
		},
	})
	writer.releaseLock()
}

/** Verify the World ID proof and respond to the webhook */
async function verifyAndRespond(request: RequestWithResponse, proof: IDKitResult) {
	'use step'

	const rpId = process.env.WORLD_RP_ID!
	const verifyResponse = await fetch(`https://developer.world.org/api/v4/verify/${rpId}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(proof),
	})

	if (!verifyResponse.ok) {
		const error = await verifyResponse.text()
		console.error('World ID verification failed:', error)

		await request.respondWith(
			new Response(JSON.stringify({ error: 'Verification failed' }), {
				status: verifyResponse.status,
				headers: { 'Content-Type': 'application/json' },
			})
		)

		throw new Error(`World ID verification failed: ${error}`)
	}

	console.log('World ID verification succeeded')
	await request.respondWith(new Response('Verified!', { status: 200 }))

	return proof
}

/** Request human approval before booking a flight */
export async function requestHumanAuthorization(
	{ summary }: { summary: string },
	{ toolCallId }: { toolCallId: string }
): Promise<IDKitResult> {
	const webhook = createWebhook({ respondWith: 'manual' })

	// Stream the webhook URL and rp_context to the client
	await emitApprovalContext(toolCallId, webhook.url)

	// Wait for the IDKit proof to be POSTed to the webhook
	const request = await webhook
	const proof = (await request.json()) as IDKitResult

	// Verify the proof and respond to the webhook (throws if verification fails)
	await verifyAndRespond(request, proof)
	webhook.dispose()

	return proof
}
