'use client'

import type { ReactNode } from 'react'
import type { UIMessage } from 'ai'
import { isToolUIPart } from 'ai'
import { useHumanApproval } from './use-human-approval'

export interface HumanApprovalProps {
	/** The message that contains the server's approval context. */
	message: UIMessage
	part: UIMessage['parts'][number]
	triggerLabel?: ReactNode
	successContent?: ReactNode
	className?: string
}

/** Show the stored action and open World ID device authorization. */
export function HumanApproval({
	message,
	part,
	triggerLabel = 'Approve with World ID',
	successContent,
	className,
}: HumanApprovalProps) {
	const { ready, action, input, verificationUri, userCode, state, approve, reject } = useHumanApproval(message, part)
	if (!isToolUIPart(part)) return null
	if (state.status === 'verified')
		return <div className={className}>{successContent ?? <p>Approved with World ID.</p>}</div>
	return (
		<div className={className}>
			{action && <p>Action: {action}</p>}
			{input !== undefined && (
				<pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(input, null, 2)}</pre>
			)}
			{userCode && state.status !== 'rejecting' && state.status !== 'rejected' && (
				<p>
					Check this code on World ID: <strong>{userCode}</strong>
				</p>
			)}
			<button
				type="button"
				disabled={!ready}
				onClick={() => {
					if (verificationUri) window.open(verificationUri, '_blank', 'noopener,noreferrer')
					void approve()
				}}
			>
				{triggerLabel}
			</button>
			<button
				type="button"
				disabled={!ready}
				onClick={() => {
					void reject()
				}}
			>
				Reject
			</button>
			{state.status === 'verifying' && (
				<p role="status">Complete approval in World ID. This request will update automatically.</p>
			)}
			{state.status === 'verifying' && verificationUri && (
				<a href={verificationUri} target="_blank" rel="noopener noreferrer">
					Open World ID again
				</a>
			)}
			{state.status === 'rejecting' && <p role="status">Saving your rejection.</p>}
			{state.status === 'rejected' && <p role="status">Approval rejected.</p>}
			{state.status === 'expired' && <p role="status">Approval expired. Request a new approval.</p>}
			{state.status === 'error' && <p role="alert">{state.error.message}</p>}
		</div>
	)
}
