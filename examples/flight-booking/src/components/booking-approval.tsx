'use client'

import { ArrowUpRight, Check, Hand } from 'lucide-react'
import { useHumanApproval, type HumanApprovalProps } from '@worldcoin/human-in-the-loop-react'
import type { bookFlight } from '@/workflows/chat/steps/tools'
import { Button } from '@/components/ui/button'

const STATUS = {
	idle: ['Your approval is needed', 'Review this booking before the agent continues.'],
	verifying: [
		'Waiting for you in World ID',
		'Complete approval in the other tab. This page will update automatically.',
	],
	verified: ['Approved by you', 'The agent can now book this flight.'],
	rejecting: ['Saving your rejection', 'Wait while we save your decision.'],
	rejected: ['Booking not approved', 'The agent will not book this request.'],
	expired: ['Approval expired', 'Ask the agent for a new booking request.'],
	error: ['Approval could not complete', 'Check the request, then try again.'],
}

export function BookingApproval({ message, part }: Pick<HumanApprovalProps, 'message' | 'part'>) {
	const { ready, input, userCode, verificationUri, state, approve, reject } = useHumanApproval(message, part)
	const booking = input as Omit<Parameters<typeof bookFlight>[0], 'approval'> | undefined
	const [title, description] = STATUS[state.status]
	const pending =
		state.status === 'idle' ||
		state.status === 'verifying' ||
		state.status === 'rejecting' ||
		state.status === 'error'
	const Icon = state.status === 'verified' ? Check : Hand

	return (
		<section
			aria-label="Booking approval"
			data-status={state.status}
			className="space-y-5 rounded-xl border border-white/15 bg-card p-5 data-[status=idle]:border-amber-300/40 data-[status=verifying]:border-amber-300/40 data-[status=verified]:border-emerald-300/30 sm:p-6"
		>
			<div className="flex items-start gap-3">
				<Icon aria-hidden="true" className="size-5 shrink-0" />
				<div className="min-w-0 space-y-1" role="status">
					<h2 className="font-medium text-balance">{title}</h2>
					<p className="text-pretty text-muted-foreground">{description}</p>
				</div>
			</div>
			{booking && (
				<div className="space-y-4 border-y border-white/10 py-4">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p className="text-lg font-medium">Flight {booking.flightNumber}</p>
						<p className="text-lg font-medium tabular-nums">
							{new Intl.NumberFormat(undefined, { style: 'currency', currency: booking.currency }).format(
								booking.price
							)}
						</p>
					</div>
					<dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{Object.entries({
							Passenger: booking.passengerName,
							'Departure (UTC)': new Date(booking.departure).toLocaleString(undefined, {
								dateStyle: 'medium',
								timeStyle: 'short',
								timeZone: 'UTC',
							}),
							'Seat preference': booking.seatPreference || 'No preference',
						}).map(([label, value]) => (
							<div key={label} className="min-w-0 space-y-1">
								<dt className="font-medium">{label}</dt>
								<dd className="break-words text-muted-foreground">{value}</dd>
							</div>
						))}
					</dl>
				</div>
			)}
			{pending && state.status !== 'rejecting' && userCode && (
				<p className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
					Match this code in World ID{' '}
					<strong className="font-mono tracking-widest text-foreground">{userCode}</strong>
				</p>
			)}
			{state.status === 'error' && (
				<p role="alert" className="text-red-300">
					{state.error.message}
				</p>
			)}
			{pending && state.status !== 'verifying' && (
				<div className="flex flex-col gap-3 sm:flex-row">
					<Button
						type="button"
						disabled={!ready}
						className="min-h-12 sm:min-h-9"
						onClick={() => {
							if (verificationUri) window.open(verificationUri, '_blank', 'noopener,noreferrer')
							void approve()
						}}
					>
						Approve with World ID <ArrowUpRight aria-hidden="true" />
					</Button>
					<Button
						type="button"
						variant="outline"
						className="min-h-12 sm:min-h-9"
						disabled={!ready}
						onClick={() => void reject()}
					>
						Reject booking
					</Button>
				</div>
			)}
			{state.status === 'verifying' && verificationUri && (
				<Button asChild variant="outline" className="min-h-12 w-full sm:min-h-9 sm:w-auto">
					<a href={verificationUri} target="_blank" rel="noopener noreferrer">
						Open World ID again <ArrowUpRight aria-hidden="true" />
					</a>
				</Button>
			)}
		</section>
	)
}
