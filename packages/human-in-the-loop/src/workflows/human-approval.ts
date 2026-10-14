import type { ToolCallOptions, UIMessageChunk } from 'ai'
import { createWebhook, FatalError, getWorkflowMetadata, getWritable, sleep, type RequestWithResponse } from 'workflow'
import {
	approvalFailure,
	pollDeviceAuthorization,
	startDeviceAuthorization,
	verifyReceipt,
	type DeviceAttempt,
} from '../idp'
import type { HumanApprovalContext, HumanApprovalResult, HumanApprovalStatus, WorldIdOptions } from '../types'

export interface ActionContext<TInput = unknown> extends ToolCallOptions {
	input: TInput
}

export interface RequestHumanAuthorizationOptions<TInput = unknown> extends WorldIdOptions {
	/** Bind approval to the operation's inputs. Defaults to toolCallId. */
	action?: string | ((context: ActionContext<TInput>) => string)
}

async function initiate(action: string, workflowRunId: string, options: WorldIdOptions) {
	'use step'
	try {
		return await startDeviceAuthorization(action, workflowRunId, options)
	} catch (error) {
		throw new FatalError(
			`World ID could not start approval (${approvalFailure(error, 'initiate')}). Check the client configuration and start a new request.`
		)
	}
}
initiate.maxRetries = 0

async function poll(attempt: DeviceAttempt, options: WorldIdOptions) {
	'use step'
	try {
		return await pollDeviceAuthorization(attempt, options)
	} catch (error) {
		// Token validation errors can contain identity claims. Do not persist them.
		throw new FatalError(
			`World ID approval failed (${approvalFailure(error, 'poll')}). Start a new approval request.`
		)
	}
}
poll.maxRetries = 0

async function emit(toolCallId: string, type: 'data-approval-context' | 'data-approval-status', data: unknown) {
	'use step'
	const writer = getWritable<UIMessageChunk>().getWriter()
	try {
		await writer.write({ id: toolCallId, type, data })
	} finally {
		writer.releaseLock()
	}
}

async function readDecision(request: RequestWithResponse, action: string, expiresAt: number) {
	'use step'
	let decision: 'approve' | 'reject' | undefined
	if (
		request.method === 'POST' &&
		request.headers.get('content-type')?.startsWith('application/json') &&
		Date.now() < expiresAt
	) {
		try {
			const data = (await request.json()) as { action?: unknown; decision?: unknown } | null
			if (data?.action === action && (data.decision === 'approve' || data.decision === 'reject'))
				decision = data.decision
		} catch {
			// Invalid input cannot approve an action.
		}
	}
	await request.respondWith(new Response(null, { status: decision ? 202 : 400 }))
	return decision
}
readDecision.maxRetries = 0

/** Verify a receipt inside a protected Workflow step before the operation. */
export async function verifyHumanAuthorization(
	result: HumanApprovalResult,
	action: string,
	options: WorldIdOptions = {}
) {
	'use step'
	try {
		return await verifyReceipt(result, action, getWorkflowMetadata().workflowRunId, options)
	} catch (error) {
		throw new FatalError(
			`A valid approval for this action and workflow is required (${approvalFailure(error, 'receipt')}).`
		)
	}
}

async function waitForDecision(attempt: DeviceAttempt, toolCallId: string, input: unknown) {
	using webhook = createWebhook({ respondWith: 'manual' })
	await emit(toolCallId, 'data-approval-context', {
		webhookUrl: webhook.url,
		action: attempt.action,
		input,
		verificationUri: attempt.verificationUri,
		userCode: attempt.userCode,
		expiresAt: attempt.expiresAt,
	} satisfies HumanApprovalContext)
	// Workflow 4 cannot cancel this deadline after a decision arrives.
	const deadline = sleep(new Date(attempt.expiresAt))
	while (Date.now() < attempt.expiresAt) {
		const request = await Promise.race([webhook, deadline])
		if (!request) break
		const decision = await readDecision(request, attempt.action, attempt.expiresAt)
		if (decision) return decision
	}
	return 'expired' as const
}

/** Build a tool that waits for action confirmation and fresh World authentication. */
export function requestHumanAuthorization<TInput = unknown>(options: RequestHumanAuthorizationOptions<TInput> = {}) {
	const { action, ...idpOptions } = options
	return async function execute(input: TInput, toolOptions: ToolCallOptions): Promise<HumanApprovalResult> {
		const { toolCallId } = toolOptions
		const resolvedAction = typeof action === 'function' ? action({ ...toolOptions, input }) : (action ?? toolCallId)
		if (!resolvedAction) throw new FatalError('The approval action must not be empty.')
		let status: HumanApprovalStatus = 'expired'
		try {
			const attempt = await initiate(resolvedAction, getWorkflowMetadata().workflowRunId, idpOptions)
			const decision = await waitForDecision(attempt, toolCallId, input)
			if (decision === 'approve') {
				await emit(toolCallId, 'data-approval-status', { status: 'verifying' })
				let interval = attempt.interval
				// Use the recorded poll result to keep Workflow replay consistent at expiry.
				while (true) {
					await sleep(new Date(Math.min(Date.now() + interval * 1000, attempt.expiresAt)))
					const result = await poll(attempt, idpOptions)
					if (result.status === 'approved') {
						await emit(toolCallId, 'data-approval-status', { status: 'verified' })
						return result.result
					}
					if (result.status === 'slow_down') interval += 5
					if (result.status === 'connection_error') interval *= 2
					if (result.status === 'rejected' || result.status === 'expired') {
						status = result.status
						break
					}
				}
			} else if (decision === 'reject') {
				status = 'rejected'
			}
		} catch (error) {
			await emit(toolCallId, 'data-approval-status', { status: 'error' })
			throw error
		}
		await emit(toolCallId, 'data-approval-status', { status })
		throw new FatalError(`Human approval ${status}. Start a new approval request if needed.`)
	}
}
