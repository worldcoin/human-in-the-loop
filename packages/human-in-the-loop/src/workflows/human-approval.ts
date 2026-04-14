import type { ToolCallOptions, UIMessageChunk } from 'ai'
import { signRequest } from '@worldcoin/idkit-server'
import type { IDKitResult, RpContext } from '@worldcoin/idkit-core'
import { createWebhook, getWritable, type RequestWithResponse } from 'workflow'

export interface ActionContext<TInput = unknown> extends ToolCallOptions {
	/** The tool input — typed via the generic on `requestHumanAuthorization<TInput>()`. */
	input: TInput
}

export interface RequestHumanAuthorizationOptions<TInput = unknown> {
	/**
	 * Action string the World ID proof is bound to. Must be unique per verification
	 * (no developer-portal registration needed). Pass a string for static actions, or
	 * a function for content-bound ones (e.g. derived from input fields to prevent
	 * replay across calls). Defaults to `toolCallId`.
	 */
	action?: string | ((context: ActionContext<TInput>) => string)
	/** Hex-encoded RP signing key. Defaults to `process.env.WORLD_SIGNING_KEY`. */
	signingKey?: string
	/** Relying-party ID. Defaults to `process.env.WORLD_RP_ID`. */
	rpId?: string
}

export interface HumanApprovalContext {
	webhookUrl: string
	action: string
	rpContext: RpContext
}

interface EmitApprovalContextArgs {
	toolCallId: string
	webhookUrl: string
	action: string
	signingKey: string
	rpId: string
}

async function emitApprovalContext({ toolCallId, webhookUrl, action, signingKey, rpId }: EmitApprovalContextArgs) {
	'use step'

	const { sig, nonce, createdAt, expiresAt } = signRequest({
		signingKeyHex: signingKey,
		action,
	})

	const writable = getWritable<UIMessageChunk>()
	const writer = writable.getWriter()
	await writer.write({
		id: toolCallId,
		type: 'data-approval-context',
		data: {
			webhookUrl,
			action,
			rpContext: {
				nonce,
				signature: sig,
				created_at: createdAt,
				expires_at: expiresAt,
				rp_id: rpId,
			},
		} satisfies HumanApprovalContext,
	})
	// `getWritable` returns a shared writable owned by the workflow runtime; release the
	// lock instead of closing it so other steps can keep writing to the same stream.
	writer.releaseLock()
}

interface VerifyAndRespondArgs {
	request: RequestWithResponse
	proof: IDKitResult
	rpId: string
}

async function verifyAndRespond({ request, proof, rpId }: VerifyAndRespondArgs) {
	'use step'

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

/**
 * Build a tool `execute` function that pauses the workflow until a real human
 * approves the action via World ID. The bound `action` defaults to the per-call
 * `toolCallId` (already unique per verification); pass a function to derive your
 * own. `signingKey` and `rpId` fall back to `WORLD_SIGNING_KEY` / `WORLD_RP_ID`
 * env vars if omitted.
 */
export function requestHumanAuthorization<TInput = unknown>(
	options: RequestHumanAuthorizationOptions<TInput> = {}
) {
	const { action, signingKey, rpId } = options

	const resolvedSigningKey = signingKey ?? process.env.WORLD_SIGNING_KEY
	const resolvedRpId = rpId ?? process.env.WORLD_RP_ID

	if (!resolvedSigningKey) {
		throw new Error(
			'requestHumanAuthorization: `signingKey` was not provided and `WORLD_SIGNING_KEY` is not set in the environment'
		)
	}
	if (!resolvedRpId) {
		throw new Error(
			'requestHumanAuthorization: `rpId` was not provided and `WORLD_RP_ID` is not set in the environment'
		)
	}

	return async function execute(input: TInput, options: ToolCallOptions): Promise<IDKitResult> {
		const { toolCallId } = options
		const resolvedAction =
			typeof action === 'function' ? action({ ...options, input }) : (action ?? toolCallId)

		const webhook = createWebhook({ respondWith: 'manual' })

		await emitApprovalContext({
			toolCallId,
			webhookUrl: webhook.url,
			action: resolvedAction,
			signingKey: resolvedSigningKey,
			rpId: resolvedRpId,
		})

		const request = await webhook
		const proof = (await request.json()) as IDKitResult

		await verifyAndRespond({ request, proof, rpId: resolvedRpId })
		webhook.dispose()

		return proof
	}
}
