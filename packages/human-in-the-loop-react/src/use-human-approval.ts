'use client'

import { useEffect, useRef, useState } from 'react'
import { isDataUIPart, isToolUIPart, type UIMessage } from 'ai'

export interface HumanApprovalContext {
	webhookUrl: string
	action: string
	input: unknown
	verificationUri: string
	userCode: string
	expiresAt: number
}

export type HumanApprovalState =
	| { status: 'idle' | 'verifying' | 'verified' | 'rejected' | 'expired' }
	| { status: 'error'; error: Error }

export interface UseHumanApprovalResult extends Partial<HumanApprovalContext> {
	/** True when the human can submit a decision. */
	ready: boolean
	state: HumanApprovalState
	approve: () => Promise<void>
	reject: () => Promise<void>
}

/** Read the approval context and server status for this tool call. */
export function useHumanApproval(message: UIMessage, part: UIMessage['parts'][number]): UseHumanApprovalResult {
	const toolCallId = isToolUIPart(part) ? part.toolCallId : undefined
	const [local, setLocal] = useState<{ toolCallId?: string; state: HumanApprovalState }>({
		state: { status: 'idle' },
	})
	const submitting = useRef<string | undefined>(undefined)
	let data: HumanApprovalContext | undefined
	let serverStatus: Exclude<HumanApprovalState['status'], 'idle'> | undefined
	for (const item of message.parts) {
		if (!toolCallId || !isDataUIPart(item) || item.id !== toolCallId) continue
		if (item.type === 'data-approval-context') data = item.data as HumanApprovalContext
		if (item.type === 'data-approval-status') serverStatus = (item.data as { status: typeof serverStatus }).status
	}

	const completed = Boolean(
		(serverStatus && serverStatus !== 'verifying') ||
		(isToolUIPart(part) && (part.state === 'output-available' || part.state === 'output-error'))
	)
	let state: HumanApprovalState = local.toolCallId === toolCallId ? local.state : { status: 'idle' }
	if (serverStatus === 'verified' || serverStatus === 'rejected' || serverStatus === 'expired')
		state = { status: serverStatus }
	else if (completed) state = { status: 'error', error: new Error('Approval failed. Request a new approval.') }
	else if (serverStatus === 'verifying') state = { status: 'verifying' }
	if (!completed && data && Date.now() >= data.expiresAt && state.status !== 'rejected') state = { status: 'expired' }
	const ready = Boolean(toolCallId && data && !completed && (state.status === 'idle' || state.status === 'error'))
	const expiresAt = data?.expiresAt

	useEffect(() => {
		if (expiresAt === undefined || completed || state.status === 'rejected') return
		const timer = setTimeout(
			() => setLocal({ toolCallId, state: { status: 'expired' } }),
			Math.max(0, expiresAt - Date.now())
		)
		return () => clearTimeout(timer)
	}, [toolCallId, expiresAt, completed, state.status])

	async function decide(decision: 'approve' | 'reject') {
		if (!ready || !data || submitting.current === toolCallId) return
		if (Date.now() >= data.expiresAt) {
			setLocal({ toolCallId, state: { status: 'expired' } })
			return
		}
		submitting.current = toolCallId
		setLocal({ toolCallId, state: { status: 'verifying' } })
		let next: HumanApprovalState = {
			status: 'error',
			error: new Error('The decision could not be saved. Check the approval status before trying again.'),
		}
		try {
			const response = await fetch(data.webhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ decision, action: data.action }),
				signal: AbortSignal.timeout(10_000),
			})
			if (response.ok) next = { status: decision === 'reject' ? 'rejected' : 'verifying' }
		} catch {
			// The server status can still confirm a decision after a connection error.
		} finally {
			if (submitting.current === toolCallId) submitting.current = undefined
		}
		setLocal(current => (current.toolCallId === toolCallId ? { toolCallId, state: next } : current))
	}

	return {
		...data,
		ready,
		state,
		approve: () => decide('approve'),
		reject: () => decide('reject'),
	}
}
