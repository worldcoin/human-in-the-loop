import { afterEach, describe, expect, test } from 'bun:test'
import type { IDKitResult } from '@worldcoin/idkit-core'
import type { RequestWithResponse } from 'workflow'
import {
	readProofAndRespond,
	verifyAndRespond,
	waitForApproval,
	withWebhookCleanup,
} from '../src/workflows/human-approval'

const originalFetch = globalThis.fetch

function createRequest(body: string) {
	const responses: Response[] = []
	const request = Object.assign(
		new Request('https://example.com/approval', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
		}),
		{
			respondWith: async (response: Response) => {
				responses.push(response)
			},
		}
	) as RequestWithResponse

	return { request, responses }
}

afterEach(() => {
	globalThis.fetch = originalFetch
})

describe('withWebhookCleanup', () => {
	test('disposes the webhook after success', async () => {
		let disposed = false
		const result = await withWebhookCleanup({ dispose: () => (disposed = true) }, async () => 'approved')

		expect(result).toBe('approved')
		expect(disposed).toBe(true)
	})

	test('disposes the webhook after failure', async () => {
		let disposed = false
		const operation = withWebhookCleanup({ dispose: () => (disposed = true) }, async () => {
			throw new Error('verification failed')
		})

		await expect(operation).rejects.toThrow('verification failed')
		expect(disposed).toBe(true)
	})
})

test('waitForApproval rejects when the durable timeout wins', async () => {
	const neverResolves = new Promise<RequestWithResponse>(() => {})
	const sleepImmediately = async () => {}

	await expect(waitForApproval(neverResolves, 5000, sleepImmediately)).rejects.toThrow(
		'Human approval timed out after 5000ms'
	)
})

test('readProofAndRespond returns a 400 response for malformed JSON', async () => {
	const { request, responses } = createRequest('{')

	await expect(readProofAndRespond(request)).rejects.toThrow('was not valid JSON')
	expect(responses).toHaveLength(1)
	expect(responses[0]?.status).toBe(400)
	expect(await responses[0]?.json()).toEqual({ error: 'Invalid verification payload' })
})

describe('verifyAndRespond', () => {
	const proof = { proof: 'test-proof' } as unknown as IDKitResult

	test('responds successfully and returns the proof', async () => {
		const { request, responses } = createRequest('{}')
		globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch

		await expect(verifyAndRespond({ request, proof, rpId: 'rp_test' })).resolves.toBe(proof)
		expect(responses).toHaveLength(1)
		expect(responses[0]?.status).toBe(200)
	})

	test('forwards a rejected verification status to the webhook response', async () => {
		const { request, responses } = createRequest('{}')
		globalThis.fetch = (async () => new Response('invalid proof', { status: 400 })) as typeof fetch

		await expect(verifyAndRespond({ request, proof, rpId: 'rp_test' })).rejects.toThrow(
			'World ID verification failed: invalid proof'
		)
		expect(responses).toHaveLength(1)
		expect(responses[0]?.status).toBe(400)
	})

	test('responds with 502 when the verification service is unavailable', async () => {
		const { request, responses } = createRequest('{}')
		globalThis.fetch = (async () => {
			throw new Error('connection refused')
		}) as typeof fetch

		await expect(verifyAndRespond({ request, proof, rpId: 'rp_test' })).rejects.toThrow(
			'World ID verification request failed: connection refused'
		)
		expect(responses).toHaveLength(1)
		expect(responses[0]?.status).toBe(502)
		expect(await responses[0]?.json()).toEqual({ error: 'Verification unavailable' })
	})
})
