'use client'

import { useState } from 'react'
import { IDKitRequestWidget, selfieCheckLegacy, type RpContext } from '@worldcoin/idkit'

interface BookingApprovalProps {
	toolCallId: string
	webhookUrl?: string
	rpContext?: RpContext
	input?: { summary: string }
	output?: string
}

export function BookingApproval({ webhookUrl, rpContext, input, output }: BookingApprovalProps) {
	const [open, setOpen] = useState(false)

	if (output) {
		return (
			<div className="rounded-lg border p-4">
				<p className="text-sm text-muted-foreground">{output}</p>
			</div>
		)
	}

	if (!input) return null

	return (
		<div className="rounded-lg border p-4 space-y-4">
			<div className="space-y-2">
				<p className="font-medium text-sm">Approve this booking?</p>
				<p className="text-sm text-muted-foreground whitespace-pre-wrap">{input.summary}</p>
			</div>

			<button
				type="button"
				onClick={() => setOpen(true)}
				disabled={!webhookUrl || !rpContext}
				className="px-4 py-2 bg-zinc-900 text-white text-sm rounded-md hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
			>
				Verify with World ID
			</button>

			{rpContext && webhookUrl && (
				<IDKitRequestWidget
					open={open}
                    onSuccess={() => {}}
					onOpenChange={setOpen}
					app_id={process.env.NEXT_PUBLIC_WORLD_APP_ID as `app_${string}`}
					action="approve-booking"
					rp_context={rpContext}
					allow_legacy_proofs={false}
					preset={selfieCheckLegacy()}
                    action_description={input.summary}
					handleVerify={async result => {
						const response = await fetch(webhookUrl, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify(result),
						})
						if (!response.ok) throw new Error('Verification failed')
					}}
				/>
			)}
		</div>
	)
}
