import type { UIMessage } from 'ai'
import { start } from 'workflow/api'
import { openai } from '@ai-sdk/openai'
import { chatWorkflow } from '@/workflows/chat'
import { FLIGHT_ASSISTANT_PROMPT, flightBookingTools } from '@/workflows/chat/steps/tools'
import { Experimental_Agent as Agent, convertToModelMessages, createUIMessageStreamResponse } from 'ai'

export async function POST(req: Request) {
	const { messages }: { messages: UIMessage[] } = await req.json()
	const modelMessages = await convertToModelMessages(messages)

	const run = await start(chatWorkflow, [modelMessages])

	return createUIMessageStreamResponse({ stream: run.readable })
}
