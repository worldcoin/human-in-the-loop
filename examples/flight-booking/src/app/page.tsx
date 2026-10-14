'use client'

import { useChat } from '@ai-sdk/react'
import { isToolUIPart } from 'ai'
import { useEffect, useRef } from 'react'
import { ArrowUpRight, Plane } from 'lucide-react'
import ChatInput from '@/components/chat-input'
import { BookingApproval } from '@/components/booking-approval'
import type { MyUIMessage } from '@/schemas/chat'
import { Button } from '@/components/ui/button'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Response } from '@/components/ai-elements/response'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { Tool, ToolContent, ToolHeader, ToolOutput } from '@/components/ai-elements/tool'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'

const TOOL_LABELS = {
	'tool-searchFlights': 'Find flights',
	'tool-checkFlightStatus': 'Check flight status',
	'tool-getAirportInfo': 'Check airport details',
	'tool-bookFlight': 'Book your flight',
	'tool-checkBaggageAllowance': 'Check baggage allowance',
}

export default function ChatPage() {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const { stop, messages, sendMessage, status, setMessages, error } = useChat<MyUIMessage>({
		onFinish({ messages }) {
			localStorage.setItem('chat-history', JSON.stringify(messages))
			requestAnimationFrame(() => textareaRef.current?.focus())
		},
	})

	useEffect(() => {
		const chatHistory = localStorage.getItem('chat-history')
		if (chatHistory) setMessages(JSON.parse(chatHistory) as MyUIMessage[])
		textareaRef.current?.focus()
	}, [setMessages])

	return (
		<main className="isolate mx-auto flex h-dvh w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-4 sm:px-6 sm:pt-8">
			<header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 pb-6">
				<div className="space-y-2">
					<p className="text-base text-muted-foreground sm:text-sm">Human in the Loop / Flight booking</p>
					<h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
						The agent finds it. You approve it.
					</h1>
					<p className="max-w-[56ch] text-base text-pretty text-muted-foreground sm:text-sm">
						Plan a trip, review the details, and approve each booking with World ID.
					</p>
				</div>
				<Plane aria-hidden="true" className="size-6 shrink-0 text-muted-foreground" />
			</header>

			{messages.length === 0 && (
				<section className="space-y-5 py-6">
					<div className="space-y-2">
						<h2 className="text-xl font-medium text-balance">Give it a try</h2>
						<p className="text-base text-pretty text-muted-foreground sm:text-sm">
							The agent will find a flight, then pause for your decision.
						</p>
					</div>
					<Button
						type="button"
						variant="outline"
						className="h-auto w-full justify-between gap-4 whitespace-normal p-4 text-left text-base sm:text-sm"
						onClick={() =>
							sendMessage({
								text: `Book the cheapest flight from Lisbon to San Francisco on ${new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}. My name is Alex Morgan. I would like a window seat.`,
								metadata: { createdAt: Date.now() },
							})
						}
					>
						<span>Book a flight from Lisbon to San Francisco</span>
						<ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
					</Button>
					<p className="text-base text-muted-foreground sm:text-sm">
						This is a demo. Flights and bookings are simulated.
					</p>
				</section>
			)}

			<Conversation className="min-h-0 w-full" aria-label="Flight booking conversation">
				<ConversationContent className="p-0">
					{messages.map((message, index) => (
						<div key={message.id}>
							{message.role === 'assistant' &&
								index === messages.length - 1 &&
								(status === 'submitted' || status === 'streaming') &&
								!message.parts.some(part => part.type === 'text' || part.type.startsWith('tool-')) && (
									<Shimmer className="text-base sm:text-sm">Finding the next step…</Shimmer>
								)}
							<Message from={message.role}>
								<MessageContent
									className={
										message.role === 'assistant'
											? 'w-full max-w-full gap-4 overflow-visible text-base sm:text-sm'
											: 'max-w-[90%] text-base sm:max-w-[80%] sm:text-sm'
									}
								>
									{message.parts.map((part, partIndex) => {
										if (part.type === 'text')
											return <Response key={partIndex}>{part.text}</Response>
										if (part.type === 'tool-bookingApproval')
											return (
												<BookingApproval key={part.toolCallId} message={message} part={part} />
											)
										if (!isToolUIPart(part) || !(part.type in TOOL_LABELS)) return null
										return (
											<Tool
												key={part.toolCallId}
												defaultOpen={part.type === 'tool-bookFlight'}
												className="mb-0"
											>
												<ToolHeader
													title={TOOL_LABELS[part.type as keyof typeof TOOL_LABELS]}
													type={part.type}
													state={part.state}
												/>
												<ToolContent>
													<ToolOutput
														output={
															part.state === 'output-available'
																? renderToolOutput(part)
																: undefined
														}
														errorText={part.errorText}
													/>
												</ToolContent>
											</Tool>
										)
									})}
								</MessageContent>
							</Message>
						</div>
					))}
				</ConversationContent>
				<ConversationScrollButton aria-label="Scroll to the latest message" />
			</Conversation>
			{error && (
				<p role="alert" className="text-base text-red-300 sm:text-sm">
					The agent could not continue. Please try again.
				</p>
			)}
			<ChatInput
				status={status}
				textareaRef={textareaRef}
				setMessages={setMessages}
				sendMessage={message => {
					sendMessage({ text: message.text || '', metadata: message.metadata })
				}}
				stop={stop}
			/>
		</main>
	)
}

function renderToolOutput(part: any) {
	const output = part.output
	if (!output) {
		return null
	}

	switch (part.type) {
		case 'tool-searchFlights': {
			const flights = output?.flights || []
			return (
				<div className="space-y-2">
					<p className="text-sm font-medium">{output?.message}</p>
					{flights.map((flight: any) => (
						<div key={flight.flightNumber} className="p-3 bg-muted rounded-md space-y-1 text-sm">
							<div className="font-medium">
								{flight.airline} - {flight.flightNumber}
							</div>
							<div className="text-muted-foreground">
								{flight.from} → {flight.to}
							</div>
							<div className="text-muted-foreground">
								Departure: {new Date(flight.departure).toLocaleString()}
							</div>
							<div>
								Status:{' '}
								<span className={flight.status === 'On Time' ? 'text-green-600' : 'text-orange-600'}>
									{flight.status}
								</span>
							</div>
							<div className="font-medium">${flight.price}</div>
						</div>
					))}
				</div>
			)
		}

		case 'tool-checkFlightStatus': {
			const status = output
			return (
				<div className="space-y-1 text-sm">
					<div className="font-medium">Flight {status.flightNumber}</div>
					<div>
						Status:{' '}
						<span
							className={
								status.status === 'On Time'
									? 'text-green-600 font-medium'
									: 'text-orange-600 font-medium'
							}
						>
							{status.status}
						</span>
					</div>
					<div className="text-muted-foreground">
						{status.from} → {status.to}
					</div>
					<div className="text-muted-foreground">Airline: {status.airline}</div>
					<div className="text-muted-foreground">
						Departure: {new Date(status.departure).toLocaleString()}
					</div>
					<div className="text-muted-foreground">Arrival: {new Date(status.arrival).toLocaleString()}</div>
					<div>Gate: {status.gate}</div>
				</div>
			)
		}

		case 'tool-getAirportInfo': {
			const airport = output
			if (airport.error) {
				return (
					<div className="space-y-1 text-sm">
						<div>{airport.error}</div>
						<div className="text-muted-foreground">{airport.suggestion}</div>
					</div>
				)
			}
			return (
				<div className="space-y-1 text-sm">
					<div className="font-medium">
						{airport.code} - {airport.name}
					</div>
					<div className="text-muted-foreground">City: {airport.city}</div>
					<div className="text-muted-foreground">Timezone: {airport.timezone}</div>
					<div className="text-muted-foreground">Terminals: {airport.terminals}</div>
					<div className="text-muted-foreground">Average Delay: {airport.averageDelay}</div>
				</div>
			)
		}

		case 'tool-bookFlight': {
			const booking = output

			return (
				<div className="space-y-2">
					<div className="text-sm font-medium">Booking confirmed</div>
					<div className="space-y-1 text-sm">
						<div>
							Confirmation #: <span className="font-mono font-medium">{booking.confirmationNumber}</span>
						</div>
						<div>Passenger: {booking.passengerName}</div>
						<div>Flight: {booking.flightNumber}</div>
						<div>Seat: {booking.seatNumber}</div>
						<div className="text-muted-foreground mt-2">{booking.message}</div>
					</div>
				</div>
			)
		}

		case 'tool-checkBaggageAllowance': {
			const baggage = output
			return (
				<div className="space-y-1 text-sm">
					<div className="font-medium">
						{baggage.airline} - {baggage.class} Class
					</div>
					<div>Carry-on bags: {baggage.carryOnBags}</div>
					<div>Checked bags: {baggage.checkedBags}</div>
					<div>Max weight per bag: {baggage.maxWeightPerBag}</div>
					<div>Oversize fee: {baggage.oversizeFee}</div>
				</div>
			)
		}

		default:
			return null
	}
}
