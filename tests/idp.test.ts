import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeJwt } from 'jose'
import {
	configuration,
	pollDeviceAuthorization,
	startDeviceAuthorization,
	verifyReceipt,
} from '../packages/human-in-the-loop/src/idp'
import { mockIdp } from './mock-idp'

let idp: Awaited<ReturnType<typeof mockIdp>>
beforeEach(async () => {
	idp = await mockIdp()
})
afterEach(async () => {
	vi.useRealTimers()
	vi.restoreAllMocks()
	await idp.close()
})
const start = () => startDeviceAuthorization('book:quote-1', 'workflow-1', idp.options)

it('uses discovery and confidential Basic auth without callback or freshness parameters', async () => {
	const attempt = await start()
	expect(Object.fromEntries(idp.state.starts[0].body)).toEqual({ scope: 'openid', client_id: 'client' })
	const authorization = idp.state.starts[0].authorization!
	expect(authorization).toMatch(/^Basic /)
	const credentials = Buffer.from(authorization.slice(6), 'base64')
		.toString()
		.split(':')
		.map(value => decodeURIComponent(value.replace(/\+/g, ' ')))
	expect(credentials).toEqual(['client', 'test-client-secret'])
	expect(attempt.deviceCode).toBe('private-device-code-1')
	expect(attempt.verificationUri).toContain('/approve?user_code=TEST-CODE')
	idp.state.responses.push({})
	const poll = await pollDeviceAuthorization(attempt, idp.options)
	expect(Object.fromEntries(idp.state.polls[0].body)).toEqual({
		grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
		device_code: 'private-device-code-1',
	})
	expect(poll.status).toBe('approved')
	if (poll.status !== 'approved') throw new Error('Expected approval.')
	expect(await verifyReceipt(poll.result, attempt.action, attempt.workflowRunId, idp.options)).toEqual({
		action: attempt.action,
		approvalId: attempt.approvalId,
	})
	const receipt = decodeJwt(poll.result.receipt)
	expect(receipt.sub).toBeUndefined()
	expect(JSON.stringify(poll)).not.toContain('private-')
})

it('supports a client registered with POST authentication', async () => {
	const options = { ...idp.options, clientAuthMethod: 'client_secret_post' as const }
	const attempt = await startDeviceAuthorization('action', 'run', options)
	expect(idp.state.starts[0].authorization).toBeUndefined()
	expect(Object.fromEntries(idp.state.starts[0].body)).toEqual({
		scope: 'openid',
		client_id: 'client',
		client_secret: 'test-client-secret',
	})
	idp.state.responses.push({})
	expect((await pollDeviceAuthorization(attempt, options)).status).toBe('approved')
	expect(idp.state.polls[0].authorization).toBeUndefined()
	expect(Object.fromEntries(idp.state.polls[0].body)).toEqual({
		grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
		device_code: attempt.deviceCode,
		client_id: 'client',
		client_secret: 'test-client-secret',
	})
})

it.each([
	['authorization_pending', 'pending'],
	['slow_down', 'slow_down'],
	['access_denied', 'rejected'],
	['expired_token', 'expired'],
])('handles %s as a polling result', async (error, status) => {
	idp.state.responses.push({ error })
	expect(await pollDeviceAuthorization(await start(), idp.options)).toEqual({ status })
})

it.each([
	['invalid_grant', 400],
	['slow_down', 429],
	['authorization_pending', 429],
	['temporarily_unavailable', 503],
	['authorization_pending', 503],
])('stops on %s with HTTP %s', async (error, status) => {
	idp.state.responses.push({ error, status })
	await expect(pollDeviceAuthorization(await start(), idp.options)).rejects.toThrow('approval failed')
	expect(idp.state.polls).toHaveLength(1)
})

describe('ID token verification', () => {
	it.each([
		{ iss: 'https://wrong.example' },
		{ aud: 'another-client' },
		{ exp: 1 },
		{ auth_time: 1 },
		{ auth_time: 9_999_999_999 },
		{ auth_time: undefined },
		{ auth_time: 'invalid' },
		{ auth_time: Math.floor(Date.now() / 1000) + 0.5 },
		{ acr: 'unsupported' },
		{ acr: undefined },
		{ amr: ['password'] },
		{ amr: 'pop' },
		{ sub: '' },
		{ sub: undefined },
		{ jti: '' },
		{ jti: undefined },
		{ iat: 9_999_999_999 },
		{ aud: ['client', 'other'] },
		{ azp: 'other' },
		{ aud: ['client'], azp: 'other' },
		{ exp: Math.floor(Date.now() / 1000) - 10 },
	])('rejects invalid claims %j', async claims => {
		idp.state.responses.push({ claims })
		await expect(pollDeviceAuthorization(await start(), idp.options)).rejects.toThrow()
	})
	it('rejects a token with an invalid signature', async () => {
		idp.state.responses.push({ wrongKey: true })
		await expect(pollDeviceAuthorization(await start(), idp.options)).rejects.toThrow()
	})
	it('rejects a token signed with an unregistered algorithm', async () => {
		idp.state.responses.push({ algorithm: 'HS256' })
		await expect(pollDeviceAuthorization(await start(), idp.options)).rejects.toThrow()
	})
	it.each([{ id_token: undefined }, { access_token: undefined }, { token_type: 'DPoP' }])(
		'rejects an incomplete or unsupported token response %j',
		async tokenOverrides => {
			idp.state.responses.push({ tokenOverrides })
			await expect(pollDeviceAuthorization(await start(), idp.options)).rejects.toThrow()
		}
	)
	it('accepts multiple audiences with the correct authorized party', async () => {
		idp.state.responses.push({ claims: { aud: ['client', 'other'], azp: 'client' } })
		expect((await pollDeviceAuthorization(await start(), idp.options)).status).toBe('approved')
	})
	it('reuses issuer keys and still verifies each signature', async () => {
		idp.state.responses.push({}, { wrongKey: true })
		expect((await pollDeviceAuthorization(await start(), idp.options)).status).toBe('approved')
		await expect(pollDeviceAuthorization(await start(), idp.options)).rejects.toThrow()
		expect(idp.state.jwksRequests).toBe(1)
	})
	it('rejects an approval that expires during signature verification', async () => {
		const attempt = await start()
		idp.state.responses.push({})
		const fetch = globalThis.fetch
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args) => {
			const response = await fetch(...args)
			if (String(args[0]).endsWith('/jwks')) vi.setSystemTime(attempt.expiresAt)
			return response
		})
		await expect(pollDeviceAuthorization(attempt, idp.options)).rejects.toThrow('expired')
	})
})

it('rejects altered receipts, other actions, other runs, other clients, and expired receipts', async () => {
	idp.state.responses.push({})
	const attempt = await start()
	const poll = await pollDeviceAuthorization(attempt, idp.options)
	if (poll.status !== 'approved') throw new Error('Expected approval.')
	await expect(verifyReceipt(poll.result, 'other-action', attempt.workflowRunId, idp.options)).rejects.toThrow()
	await expect(verifyReceipt(poll.result, attempt.action, 'other-run', idp.options)).rejects.toThrow()
	await expect(
		verifyReceipt(poll.result, attempt.action, attempt.workflowRunId, { ...idp.options, clientId: 'other-client' })
	).rejects.toThrow()
	await expect(
		verifyReceipt({ ...poll.result, approvalId: 'forged' }, attempt.action, attempt.workflowRunId, idp.options)
	).rejects.toThrow()
	await expect(
		verifyReceipt(
			{ ...poll.result, receipt: poll.result.receipt.slice(0, -10) + 'forged' },
			attempt.action,
			attempt.workflowRunId,
			idp.options
		)
	).rejects.toThrow()
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(Date.now() + 301_000)
	await expect(verifyReceipt(poll.result, attempt.action, attempt.workflowRunId, idp.options)).rejects.toThrow()
})

it('does not poll an expired attempt', async () => {
	const attempt = await start()
	expect(await pollDeviceAuthorization({ ...attempt, expiresAt: Date.now() - 1 }, idp.options)).toEqual({
		status: 'expired',
	})
	expect(idp.state.polls).toHaveLength(0)
})

it('fails closed on lost initiation and token responses', async () => {
	idp.state.disconnectStart = true
	await expect(start()).rejects.toThrow()
	expect(idp.state.starts).toHaveLength(1)
	idp.state.disconnectStart = false
	const attempt = await start()
	idp.state.responses.push('disconnect')
	await expect(pollDeviceAuthorization(attempt, idp.options)).rejects.toThrow()
	expect(idp.state.polls).toHaveLength(1)
})

it('rejects mismatched discovery and off-origin endpoints before sending credentials', async () => {
	idp.state.discoveryOverrides = { issuer: 'https://wrong.example' }
	await expect(start()).rejects.toThrow('issuer')
	idp.state.discoveryOverrides = { token_endpoint: 'https://wrong.example/token' }
	await expect(start()).rejects.toThrow('issuer origin')
	expect(idp.state.starts).toHaveLength(0)
})

it('rejects an invalid device response and insecure configuration', async () => {
	idp.state.deviceOverrides = { interval: 0 }
	await expect(start()).rejects.toThrow()
	expect(() => configuration({ ...idp.options, issuer: 'http://idp.example' })).toThrow('HTTPS')
})
