import { useState } from 'react'
import type { ChatStatus } from 'ai'
import { Button } from '@/components/ui/button'
import type { MyUIMessage } from '@/schemas/chat'
import {
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from './ai-elements/prompt-input'

export default function ChatInput({
	status,
	textareaRef,
	setMessages,
	sendMessage,
	stop,
}: {
	status: ChatStatus
	textareaRef: React.RefObject<HTMLTextAreaElement | null>
	setMessages: (messages: MyUIMessage[]) => void
	sendMessage: (message: PromptInputMessage & { metadata?: { createdAt: number } }) => void
	stop: () => void
}) {
	const [text, setText] = useState('')
	const busy = status === 'submitted' || status === 'streaming'

	return (
		<div className="w-full shrink-0 bg-background">
			<PromptInput
				onSubmit={(message: PromptInputMessage) => {
					const hasText = Boolean(message.text?.trim())
					if (!hasText || busy) return

					sendMessage({
						text: message.text || '',
						metadata: { createdAt: Date.now() },
					})
					setText('')
				}}
			>
				<PromptInputBody>
					<PromptInputTextarea
						ref={textareaRef}
						aria-label="Message the flight agent"
						value={text}
						onChange={e => setText(e.target.value)}
						placeholder="Ask me about flights, airports, or bookings..."
					/>
				</PromptInputBody>
				<PromptInputFooter>
					<PromptInputTools>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={async () => {
								await stop()
								localStorage.removeItem('chat-history')
								setMessages([])
								setText('')
							}}
						>
							New chat
						</Button>
					</PromptInputTools>
					<PromptInputSubmit
						status={status}
						variant="secondary"
						aria-label={busy ? 'Stop response' : 'Send message'}
						onClick={event => {
							if (busy) {
								event.preventDefault()
								stop()
							}
						}}
						disabled={!busy && !text.trim()}
					/>
				</PromptInputFooter>
			</PromptInput>
		</div>
	)
}
