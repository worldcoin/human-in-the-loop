import { createServer } from 'node:http'
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose'

export async function mockIdp() {
	const keys = await generateKeyPair('RS256')
	const wrongKeys = await generateKeyPair('RS256')
	const publicKey = { ...(await exportJWK(keys.publicKey)), kid: 'test', alg: 'RS256', use: 'sig' }
	const state = {
		starts: [] as { body: URLSearchParams; authorization?: string }[],
		polls: [] as { body: URLSearchParams; authorization?: string; at: number }[],
		responses: [] as (
			| { error: string; status?: number }
			| { claims?: JWTPayload; wrongKey?: boolean; algorithm?: 'HS256'; tokenOverrides?: Record<string, unknown> }
			| 'disconnect'
		)[],
		deviceOverrides: {} as Record<string, unknown>,
		discoveryOverrides: {} as Record<string, unknown>,
		disconnectStart: false,
		jwksRequests: 0,
	}
	let issuer = ''
	const server = createServer(async (request, response) => {
		let raw = ''
		for await (const chunk of request) raw += chunk
		const body = new URLSearchParams(raw)
		const json = (value: unknown, status = 200) => {
			response.writeHead(status, { 'Content-Type': 'application/json' })
			response.end(JSON.stringify(value))
		}
		if (request.url === '/.well-known/openid-configuration')
			return json({
				issuer,
				device_authorization_endpoint: `${issuer}/device`,
				token_endpoint: `${issuer}/token`,
				jwks_uri: `${issuer}/jwks`,
				...state.discoveryOverrides,
			})
		if (request.url === '/jwks') {
			state.jwksRequests++
			return json({ keys: [publicKey] })
		}
		if (request.url === '/device') {
			state.starts.push({ body, authorization: request.headers.authorization })
			if (state.disconnectStart) return request.socket.destroy()
			return json({
				device_code: `private-device-code-${state.starts.length}`,
				user_code: 'TEST-CODE',
				verification_uri: `${issuer}/approve`,
				verification_uri_complete: `${issuer}/approve?user_code=TEST-CODE`,
				expires_in: 1200,
				interval: 1,
				...state.deviceOverrides,
			})
		}
		if (request.url === '/token') {
			state.polls.push({ body, authorization: request.headers.authorization, at: Date.now() })
			const next = state.responses.shift() ?? { error: 'authorization_pending' }
			if (next === 'disconnect') return request.socket.destroy()
			if ('error' in next) return json({ error: next.error }, next.status ?? 400)
			const now = Math.floor(Date.now() / 1000)
			const idToken = await new SignJWT({
				iss: issuer,
				aud: 'client',
				sub: 'private-world-subject',
				jti: 'token-id',
				iat: now,
				exp: now + 300,
				auth_time: now,
				acr: 'https://world.org/oidc/acr/orb-v3',
				amr: ['pop'],
				...next.claims,
			})
				.setProtectedHeader({ alg: next.algorithm ?? 'RS256', kid: 'test' })
				.sign(
					next.algorithm === 'HS256'
						? new TextEncoder().encode('test-client-secret')
						: next.wrongKey
							? wrongKeys.privateKey
							: keys.privateKey
				)
			return json({
				id_token: idToken,
				access_token: 'private-access-token',
				token_type: 'Bearer',
				expires_in: 300,
				...next.tokenOverrides,
			})
		}
		json({ error: 'not_found' }, 404)
	})
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = server.address()
	if (!address || typeof address === 'string') throw new Error('The test server did not start.')
	issuer = `http://127.0.0.1:${address.port}`
	return {
		state,
		options: { issuer, clientId: 'client', clientSecret: 'test-client-secret' },
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close(error => (error ? reject(error) : resolve()))
				server.closeAllConnections()
			}),
	}
}
