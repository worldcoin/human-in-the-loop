// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { UIMessage } from 'ai'
import { HumanApproval } from '../packages/human-in-the-loop-react/src/human-approval'
import { useHumanApproval } from '../packages/human-in-the-loop-react/src/use-human-approval'

const part = {
	type: 'tool-approve',
	toolCallId: 'call-1',
	state: 'input-available',
	input: { summary: 'Model summary' },
} as const
const context = {
	type: 'data-approval-context',
	id: 'call-1',
	data: {
		webhookUrl: 'https://app.example/decision',
		action: 'book:123',
		input: { flight: 'AB123', price: 100 },
		verificationUri: 'https://auth.world.org/approve?user_code=CODE',
		userCode: 'CODE',
		expiresAt: Date.now() + 60_000,
	},
}
function message(...extra: unknown[]): UIMessage {
	return { id: 'message', role: 'assistant', parts: [part, context, ...extra] } as UIMessage
}
afterEach(() => {
	cleanup()
	vi.useRealTimers()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

it('shows the server input and sends only a decision while opening the supplied IdP link', async () => {
	const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
	vi.stubGlobal('fetch', fetch)
	const open = vi.spyOn(window, 'open').mockReturnValue(null)
	render(<HumanApproval message={message()} part={part} />)
	expect(screen.getByText(/"flight": "AB123"/)).toBeTruthy()
	expect(screen.queryByText('Model summary')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Approve with World ID' }))
	await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
	expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ decision: 'approve', action: 'book:123' })
	expect(open).toHaveBeenCalledWith(context.data.verificationUri, '_blank', 'noopener,noreferrer')
	expect(screen.queryByText('Approved with World ID.')).toBeNull()
})

it('sends rejection without opening the IdP', async () => {
	const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
	vi.stubGlobal('fetch', fetch)
	const open = vi.spyOn(window, 'open').mockReturnValue(null)
	render(<HumanApproval message={message()} part={part} />)
	fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
	await screen.findByText('Approval rejected.')
	expect(JSON.parse(fetch.mock.calls[0][1].body).decision).toBe('reject')
	expect(open).not.toHaveBeenCalled()
})

describe('server status', () => {
	it.each([
		['verified', 'Approved with World ID.'],
		['rejected', 'Approval rejected.'],
		['expired', 'Approval expired. Request a new approval.'],
		['error', 'Approval failed. Request a new approval.'],
	])('renders %s after reconnect', (status, text) => {
		render(
			<HumanApproval
				message={message({ type: 'data-approval-status', id: 'call-1', data: { status } })}
				part={part}
			/>
		)
		expect(screen.getByText(text)).toBeTruthy()
		if (status !== 'verified')
			expect((screen.getByRole('button', { name: 'Approve with World ID' }) as HTMLButtonElement).disabled).toBe(
				true
			)
	})
	it('does not treat arbitrary tool output as approval', () => {
		render(
			<HumanApproval
				message={message()}
				part={{ ...part, state: 'output-available', output: { error: 'failed' } }}
			/>
		)
		expect(screen.queryByText('Approved with World ID.')).toBeNull()
		expect(screen.getByRole('alert').textContent).toContain('Approval failed')
	})
	it('does not reuse the context or status for a different tool call', () => {
		const { rerender } = render(
			<HumanApproval
				message={message({ type: 'data-approval-status', id: 'call-1', data: { status: 'verified' } })}
				part={part}
			/>
		)
		rerender(<HumanApproval message={message()} part={{ ...part, toolCallId: 'call-2' }} />)
		expect(screen.queryByText('Approved with World ID.')).toBeNull()
		expect((screen.getByRole('button', { name: 'Approve with World ID' }) as HTMLButtonElement).disabled).toBe(true)
	})
})

// The server emits these statuses before the approval tool fails.
it.each(['rejected', 'expired'] as const)('keeps the %s status when the tool reports an error', status => {
	const { result } = renderHook(() =>
		useHumanApproval(message({ type: 'data-approval-status', id: 'call-1', data: { status } }), {
			...part,
			state: 'output-error',
			errorText: 'The approval tool failed.',
		})
	)
	expect(result.current.state.status).toBe(status)
	expect(result.current.ready).toBe(false)
})

it('sends one decision when a custom interface submits twice', async () => {
	const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
	vi.stubGlobal('fetch', fetch)
	const { result } = renderHook(() => useHumanApproval(message(), part))
	await act(async () => {
		await Promise.all([result.current.approve(), result.current.reject()])
	})
	expect(fetch).toHaveBeenCalledOnce()
	expect(result.current.ready).toBe(false)
	expect(result.current.state.status).toBe('verifying')
	await act(() => result.current.approve())
	expect(fetch).toHaveBeenCalledOnce()
})

it('shows expiry if a decision response fails after the deadline', async () => {
	vi.useFakeTimers()
	vi.setSystemTime(context.data.expiresAt - 1000)
	let failRequest!: (error: Error) => void
	vi.stubGlobal(
		'fetch',
		vi.fn(
			() =>
				new Promise((_, reject) => {
					failRequest = reject
				})
		)
	)
	const { result } = renderHook(() => useHumanApproval(message(), part))
	let request: Promise<void>
	act(() => {
		request = result.current.approve()
	})
	await act(async () => {
		vi.advanceTimersByTime(1000)
		failRequest(new Error('The connection closed.'))
		await request
	})
	expect(result.current.state.status).toBe('expired')
	expect(result.current.ready).toBe(false)
})

it('allows a new decision after a failed request', async () => {
	const fetch = vi
		.fn()
		.mockRejectedValueOnce(new Error('The connection closed.'))
		.mockResolvedValueOnce(new Response(null, { status: 202 }))
	vi.stubGlobal('fetch', fetch)
	const { result } = renderHook(() => useHumanApproval(message(), part))
	await act(() => result.current.approve())
	expect(result.current.state.status).toBe('error')
	expect(result.current.ready).toBe(true)
	await act(() => result.current.reject())
	expect(result.current.state.status).toBe('rejected')
	expect(result.current.ready).toBe(false)
})
