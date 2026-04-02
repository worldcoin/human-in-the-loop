import { getWritable } from 'workflow'
import { DurableAgent } from '@workflow/ai/agent'
import type { ModelMessage, UIMessageChunk } from 'ai'
import { openai } from '@workflow/ai/openai'
import { FLIGHT_ASSISTANT_PROMPT, flightBookingTools } from './steps/tools'

export async function chatWorkflow(messages: ModelMessage[]) {
	'use workflow'

	const writable = getWritable<UIMessageChunk>()
	const agent = new DurableAgent({
		model: openai('gpt-5.4'),
		tools: flightBookingTools,
		system: FLIGHT_ASSISTANT_PROMPT,
		providerOptions: { openai: { reasoningEffort: 'low' } },
	})

	await agent.stream({ messages, writable })
}
