'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { UIMessage, UIMessagePart } from 'ai'
import { isDataUIPart, isToolUIPart } from 'ai'
import type { IDKitResult, RpContext } from '@worldcoin/idkit'

export interface HumanApprovalContext {
	webhookUrl: string
	action: string
	rpContext: RpContext
}

export type HumanApprovalState =
	| { status: 'idle' }
	| { status: 'verifying' }
	| { status: 'verified' }
	| { status: 'error'; error: Error }

export interface UseHumanApprovalResult {
	/** True once the streamed approval context has arrived from the server. */
	ready: boolean
	/** The action slug the server signed for this specific tool call. */
	action: string | undefined
	/** Server-signed RP context to pass to `IDKitRequestWidget`'s `rp_context`. */
	rpContext: RpContext | undefined
	/** Webhook URL to POST the IDKit proof to. */
	webhookUrl: string | undefined
	/** Current verification state (discriminated by `status`). */
	state: HumanApprovalState
	/** POST the IDKit proof to the webhook. Wire this to `IDKitRequestWidget`'s `handleVerify`. */
	verify: (proof: IDKitResult) => Promise<void>
}

function findApprovalContext(
	parts: readonly UIMessagePart<any, any>[],
	toolCallId: string
): HumanApprovalContext | undefined {
	const chunk = parts.find(
		part => isDataUIPart(part) && part.type === 'data-approval-context' && part.id === toolCallId
	)
	return chunk ? ((chunk as { data: HumanApprovalContext }).data) : undefined
}

/**
 * Reads the streamed `data-approval-context` chunk for a given tool call part
 * and exposes everything needed to drive `IDKitRequestWidget`. The server-side
 * `requestHumanAuthorization` factory streams `{ webhookUrl, action, rpContext }`
 * keyed on `toolCallId`; this hook finds it once, caches it, and provides a
 * `verify` callback that POSTs the resulting IDKit proof back to the webhook.
 */
export function useHumanApproval(
	message: UIMessage,
	part: UIMessagePart<any, any>
): UseHumanApprovalResult {
	const [state, setState] = useState<HumanApprovalState>({ status: 'idle' })

	const toolCallId = isToolUIPart(part) ? part.toolCallId : undefined

	// Approval contexts are write-once per tool call. Cache the first hit so we
	// don't re-scan `message.parts` on every streaming chunk.
	const cacheRef = useRef<HumanApprovalContext | undefined>(undefined)
	const context = useMemo(() => {
		if (cacheRef.current) return cacheRef.current
		if (!toolCallId) return undefined
		const found = findApprovalContext(message.parts, toolCallId)
		if (found) cacheRef.current = found
		return found
	}, [message.parts, toolCallId])

	const verify = useCallback(
		async (proof: IDKitResult) => {
			if (!context) throw new Error('useHumanApproval: approval context not yet available')
			setState({ status: 'verifying' })
			try {
				const response = await fetch(context.webhookUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(proof),
				})
				if (!response.ok) {
					throw new Error(`Verification webhook responded with ${response.status}`)
				}
				setState({ status: 'verified' })
			} catch (err) {
				const wrapped = err instanceof Error ? err : new Error(String(err))
				setState({ status: 'error', error: wrapped })
				throw wrapped
			}
		},
		[context]
	)

	return {
		ready: Boolean(context),
		action: context?.action,
		rpContext: context?.rpContext,
		webhookUrl: context?.webhookUrl,
		state,
		verify,
	}
}
