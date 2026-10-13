import { z } from 'zod'
import {
	requestHumanAuthorization,
	verifyHumanAuthorization,
	type HumanApprovalResult,
} from '@worldcoin/human-in-the-loop/workflows'

export const mockAirports: Record<string, { name: string; city: string; timezone: string }> = {
	SFO: {
		timezone: 'PST',
		city: 'San Francisco',
		name: 'San Francisco International Airport',
	},
	LIS: {
		city: 'Lisbon',
		timezone: 'UTC',
		name: 'Humberto Delgado Airport',
	},
	JFK: {
		timezone: 'EST',
		city: 'New York',
		name: 'John F. Kennedy International Airport',
	},
	MIA: { name: 'Miami International Airport', city: 'Miami', timezone: 'EST' },
	ATL: {
		timezone: 'EST',
		city: 'Atlanta',
		name: 'Hartsfield-Jackson Atlanta International Airport',
	},
	ORD: {
		timezone: 'CST',
		city: 'Chicago',
		name: "O'Hare International Airport",
	},
}

/** Resolve a city name or airport code to a 3-letter airport code */
function resolveAirportCode(input: string): string {
	const upper = input.toUpperCase().trim()

	// Already a valid code
	if (mockAirports[upper]) return upper

	// Try matching by city name (case-insensitive)
	const match = Object.entries(mockAirports).find(([, info]) => info.city.toUpperCase() === upper)

	return match ? match[0] : upper.slice(0, 3)
}

/** Search for available flights */
export async function searchFlights({ from, to, date }: { from: string; to: string; date: string }) {
	'use step'

	const fromCode = resolveAirportCode(from)
	const toCode = resolveAirportCode(to)

	console.log(`Searching flights from ${fromCode} to ${toCode} on ${date}`)

	// Simulate API delay
	await new Promise(resolve => setTimeout(resolve, 500))

	// Generate 3 flights with different price points and statuses
	const airlines = ['United Airlines', 'American Airlines', 'Delta Airlines', 'Southwest Airlines', 'JetBlue', 'TAP']
	const statuses = ['On Time', 'Delayed', 'On Time']
	const priceMultipliers = [1, 1.5, 2.2] // Budget, mid-range, premium

	// Base price calculation (could be based on distance, popularity, etc.)
	const basePrice = 150 + Math.floor(Math.random() * 200)

	// Generate departure times throughout the day
	const departureHours = [6, 12, 18] // Morning, afternoon, evening

	const generatedFlights = departureHours.map((hour, index) => {
		const departureTime = new Date(date)
		departureTime.setHours(hour + Math.floor(Math.random() * 4))
		departureTime.setMinutes(Math.floor(Math.random() * 60))

		// Calculate flight duration (1-5 hours)
		const duration = 60 + Math.floor(Math.random() * 240)
		const arrivalTime = new Date(departureTime.getTime() + duration * 60000)

		// Generate flight number
		const airlineCode = ['UA', 'AA', 'DL', 'WN', 'B6', 'PT'][index % 5]
		const flightNumber = `${airlineCode}${Math.floor(Math.random() * 900) + 100}`

		return {
			quoteId: crypto.randomUUID(),
			currency: 'USD',
			flightNumber,
			from: fromCode,
			to: toCode,
			departure: departureTime.toISOString(),
			arrival: arrivalTime.toISOString(),
			price: Math.round(basePrice * priceMultipliers[index]),
			airline: airlines[index % airlines.length],
			status: statuses[index],
		}
	})

	return {
		message: `Found ${generatedFlights.length} flights from ${fromCode} to ${toCode} on ${date}`,
		flights: generatedFlights.sort((a, b) => a.price - b.price), // Sort by price
	}
}

/** Check flight status */
export async function checkFlightStatus({ flightNumber }: { flightNumber: string }) {
	'use step'

	console.log(`Checking status for flight ${flightNumber}`)

	// 10% chance of error to demonstrate retry
	if (Math.random() < 0.1) {
		throw new Error('Flight status service temporarily unavailable')
	}

	// Generate random flight details
	const airlines = ['United Airlines', 'American Airlines', 'Delta Airlines', 'Southwest Airlines', 'JetBlue', 'TAP']
	const airports = ['LAX', 'JFK', 'ORD', 'ATL', 'DFW', 'SFO', 'MIA', 'DEN', 'BOS', 'SEA', 'LIS']
	const statuses = ['On Time', 'Delayed', 'Boarding', 'Departed', 'In Flight', 'Landed']

	// Random selections
	const fromAirport = airports[Math.floor(Math.random() * airports.length)]
	let toAirport = airports[Math.floor(Math.random() * airports.length)]
	// Ensure different airports
	while (toAirport === fromAirport) {
		toAirport = airports[Math.floor(Math.random() * airports.length)]
	}

	// Generate times
	const now = new Date()
	const departureOffset = (Math.random() - 0.5) * 4 * 60 * 60 * 1000 // +/- 2 hours from now
	const departureTime = new Date(now.getTime() + departureOffset)
	const flightDuration = (60 + Math.floor(Math.random() * 240)) * 60 * 1000 // 1-5 hours
	const arrivalTime = new Date(departureTime.getTime() + flightDuration)

	// Determine gate based on status
	const status = statuses[Math.floor(Math.random() * statuses.length)]
	const gate = ['Boarding', 'Departed', 'In Flight', 'Landed'].includes(status)
		? `${['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)]}${Math.floor(Math.random() * 30) + 1}`
		: Math.random() < 0.7
			? `${['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)]}${Math.floor(Math.random() * 30) + 1}`
			: 'TBD'

	// Add delay information if status is "Delayed"
	const delayMinutes = status === 'Delayed' ? Math.floor(Math.random() * 120) + 15 : 0
	const actualDepartureTime =
		status === 'Delayed' ? new Date(departureTime.getTime() + delayMinutes * 60 * 1000) : departureTime
	const actualArrivalTime =
		status === 'Delayed' ? new Date(arrivalTime.getTime() + delayMinutes * 60 * 1000) : arrivalTime

	return {
		flightNumber: flightNumber.toUpperCase(),
		status: status + (status === 'Delayed' ? ` (${delayMinutes} minutes)` : ''),
		departure: departureTime.toISOString(),
		arrival: arrivalTime.toISOString(),
		actualDeparture: actualDepartureTime.toISOString(),
		actualArrival: actualArrivalTime.toISOString(),
		from: fromAirport,
		to: toAirport,
		airline: airlines[Math.floor(Math.random() * airlines.length)],
		gate,
		terminal: Math.floor(Math.random() * 4) + 1,
	}
}

/** Get airport information */
export async function getAirportInfo({ airportCode }: { airportCode: string }) {
	'use step'

	console.log(`Getting information for airport ${airportCode}`)

	const airport = mockAirports[airportCode.toUpperCase()]

	if (!airport) {
		return {
			error: `Airport code ${airportCode} not found`,
			suggestion: `Try one of these: ${Object.keys(mockAirports).join(', ')}`,
		}
	}

	return {
		code: airportCode.toUpperCase(),
		...airport,
		terminals: Math.floor(Math.random() * 4) + 1,
		averageDelay: `${Math.floor(Math.random() * 30)} minutes`,
	}
}

const bookingParamsSchema = z.object({
	quoteId: z.string().describe('Quote ID returned by searchFlights'),
	flightNumber: z.string().describe('Flight number to book'),
	departure: z.string().describe('Departure timestamp returned by searchFlights'),
	price: z.number().positive().describe('Price returned by searchFlights'),
	currency: z.literal('USD'),
	passengerName: z.string().describe('Full name of the passenger'),
	seatPreference: z.string().optional().describe('Seat preference: window, aisle, or middle'),
})

type BookingParams = z.infer<typeof bookingParamsSchema>

/** Bind approval to all booking fields, including the selected quote. */
function deriveBookingAction(input: BookingParams): string {
	return `book-flight:${JSON.stringify([
		input.quoteId,
		input.flightNumber,
		input.departure,
		input.price,
		input.currency,
		input.passengerName,
		input.seatPreference ?? null,
	])}`
}

/** Verify the package receipt before the mock booking operation. */
export async function bookFlight({ approval, ...booking }: BookingParams & { approval: HumanApprovalResult }) {
	'use step'

	const { approvalId } = await verifyHumanAuthorization(approval, deriveBookingAction(booking))
	// A real booking API must use approvalId as its persistent idempotency key.
	// This mock returns the same confirmation for repeated use of one approval.
	const confirmationNumber = `BK${approvalId.replaceAll('-', '').slice(0, 10).toUpperCase()}`
	const row = (Number.parseInt(approvalId.slice(0, 4), 16) % 30) + 1
	const suffix = booking.seatPreference === 'window' ? 'A' : booking.seatPreference === 'aisle' ? 'C' : 'B'
	return {
		success: true,
		confirmationNumber,
		...booking,
		seatNumber: `${row}${suffix}`,
		message: 'Mock flight booking confirmed.',
	}
}

/** Check baggage allowance */
export async function checkBaggageAllowance({ airline, ticketClass }: { airline: string; ticketClass: string }) {
	'use step'

	console.log(`Checking baggage allowance for ${airline} ${ticketClass} class`)

	const allowances = {
		economy: { carryOn: 1, checked: 1, maxWeight: '50 lbs' },
		business: { carryOn: 2, checked: 2, maxWeight: '70 lbs' },
		first: { carryOn: 2, checked: 3, maxWeight: '70 lbs' },
	}

	const classKey = ticketClass.toLowerCase() as keyof typeof allowances
	const allowance = allowances[classKey] || allowances.economy

	return {
		airline,
		class: ticketClass,
		carryOnBags: allowance.carryOn,
		checkedBags: allowance.checked,
		maxWeightPerBag: allowance.maxWeight,
		oversizeFee: '$150 per bag',
	}
}

export const flightBookingTools = {
	bookingApproval: {
		description:
			'Request fresh World ID approval for these exact booking details. Pass the returned approval receipt to bookFlight unchanged.',
		inputSchema: bookingParamsSchema,
		execute: requestHumanAuthorization<BookingParams>({
			action: ({ input }) => deriveBookingAction(input),
		}),
	},
	searchFlights: {
		description: 'Search for available flights between two cities on a specific date',
		inputSchema: z.object({
			from: z.string().describe('Departure city or airport code'),
			to: z.string().describe('Arrival city or airport code'),
			date: z.string().describe('Travel date in YYYY-MM-DD format'),
		}),
		execute: searchFlights,
	},
	checkFlightStatus: {
		description: 'Check the current status of a specific flight',
		inputSchema: z.object({
			flightNumber: z.string().describe('Flight number (e.g., UA123)'),
		}),
		execute: checkFlightStatus,
	},
	getAirportInfo: {
		description: 'Get information about a specific airport',
		inputSchema: z.object({
			airportCode: z.string().describe('3-letter airport code (e.g., LAX)'),
		}),
		execute: getAirportInfo,
	},
	bookFlight: {
		description:
			'Book the approved quote. Requires the full result from bookingApproval. The receipt must match the booking details and this workflow.',
		inputSchema: bookingParamsSchema.extend({
			approval: z
				.object({ action: z.string(), approvalId: z.string(), receipt: z.string() })
				.describe('The complete result from bookingApproval. Pass it through unchanged.'),
		}),
		execute: bookFlight,
	},
	checkBaggageAllowance: {
		description: 'Check baggage allowance for a specific airline and ticket class',
		inputSchema: z.object({
			airline: z.string().describe('Name of the airline'),
			ticketClass: z.string().describe('Ticket class: economy, business, or first'),
		}),
		execute: checkBaggageAllowance,
	},
}

export const FLIGHT_ASSISTANT_PROMPT = `You are a helpful flight booking assistant. You can help users:
- Search for flights between cities
- Check flight status
- Get airport information
- Book flights
- Check baggage allowances

Be friendly and professional. When searching for flights, always ask for travel dates if not provided.
Keep replies brief. The interface shows the booking details and confirmation, so do not repeat them in prose.

To book a flight:
1. Call bookingApproval with the selected quoteId, flightNumber, departure, price, currency, passengerName, and seatPreference. Wait for approval.
2. Call bookFlight with exactly the same booking fields and the complete approval result as the approval field.

The server verifies the receipt before booking. Do not change the approved details. This example creates mock bookings.`
