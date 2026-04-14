'use client'

import { memo, useState } from 'react'
import type { ReactNode } from 'react'
import type { UIMessage, UIMessagePart } from 'ai'
import { isToolUIPart } from 'ai'
import { IDKitRequestWidget, orbLegacy } from '@worldcoin/idkit'
import type { Preset } from '@worldcoin/idkit'
import { useHumanApproval } from './use-human-approval'

const NOOP = () => {}

export interface HumanApprovalProps {
	/** The full message containing this tool part — used to find the streamed approval context. */
	message: UIMessage
	/** The tool-call part to render an approval widget for. Must include `toolCallId`. */
	part: UIMessagePart<any, any>
	/**
	 * World developer portal app ID. Defaults to `process.env.NEXT_PUBLIC_WORLD_APP_ID`.
	 * Required if the env var isn't set.
	 */
	appId?: `app_${string}`
	/** IDKit preset. Defaults to `orbLegacy()`. */
	preset?: Preset
	/** Whether to accept legacy (v3) World ID proofs as a fallback. Defaults to `false`. */
	allowLegacyProofs?: boolean
	/** Override the trigger button label. */
	triggerLabel?: ReactNode
	/** Override the success-state content shown after the proof is verified. */
	successContent?: ReactNode
	/** className applied to the outer wrapper, for consumers who want to style. */
	className?: string
}

/**
 * Default UI for a human-in-the-loop approval. Renders the tool input as a
 * summary, a "Verify with World ID" button, and the IDKit request widget
 * wired to the streamed approval context. For custom UI, use `useHumanApproval`
 * directly.
 */
function HumanApprovalImpl({
	message,
	part,
	appId,
	preset = orbLegacy(),
	allowLegacyProofs = false,
	triggerLabel = 'Verify with World ID',
	successContent,
	className,
}: HumanApprovalProps) {
	const [open, setOpen] = useState(false)
	const { ready, action, rpContext, state, verify } = useHumanApproval(message, part)

	const isTool = isToolUIPart(part)
	const summary =
		isTool && (part.state === 'input-available' || part.state === 'output-available')
			? (part.input as { summary?: string } | undefined)?.summary
			: undefined
	const hasOutput = isTool && part.state === 'output-available'

	const resolvedAppId = appId ?? (process.env.NEXT_PUBLIC_WORLD_APP_ID as `app_${string}` | undefined)

	if (hasOutput) {
		return <div className={className}>{successContent ?? <p>Approved with World ID.</p>}</div>
	}

	if (!isTool) return null

	return (
		<div className={className}>
			{summary && <p>{summary}</p>}

			<button
				type="button"
				onClick={() => setOpen(true)}
				disabled={!ready || !resolvedAppId || state.status === 'verifying'}
			>
				{state.status === 'verifying' ? 'Verifying…' : triggerLabel}
			</button>

			{state.status === 'error' && <p role="alert">{state.error.message}</p>}

			{ready && resolvedAppId && rpContext && action && (
				<IDKitRequestWidget
					open={open}
					onOpenChange={setOpen}
					onSuccess={NOOP}
					handleVerify={verify}
					app_id={resolvedAppId}
					action={action}
					rp_context={rpContext}
					action_description={summary}
					preset={preset}
					allow_legacy_proofs={allowLegacyProofs}
				/>
			)}
		</div>
	)
}

export const HumanApproval = memo(HumanApprovalImpl)
