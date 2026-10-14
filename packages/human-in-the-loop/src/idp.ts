import { createHmac, randomUUID } from 'node:crypto'
import { jwtVerify, SignJWT } from 'jose'
import * as oauth from 'oauth4webapi'
import type { HumanApprovalResult, WorldIdOptions } from './types'

const RECEIPT_ISSUER = 'urn:worldcoin:human-in-the-loop'
const RECEIPT_TYPE = 'world-hitl+jwt'
const CLOCK_TOLERANCE = 30
const REQUEST_TIMEOUT = 10_000
const jwks = new Map<string, oauth.JWKSCacheInput>()

class ApprovalError extends Error {
	readonly code: string
	constructor(code: string, message: string) {
		super(message)
		this.code = code
	}
}

/** Return fixed failure codes without tokens, claims, or provider error text. */
export function approvalFailure(error: unknown, stage: string): string {
	if (error instanceof ApprovalError) return error.code
	if (error instanceof oauth.ResponseBodyError || error instanceof oauth.WWWAuthenticateChallengeError)
		return `${stage}:http_${error.status}`
	if (error instanceof oauth.OperationProcessingError && 'cause' in error && error.cause instanceof Response)
		return `${stage}:http_${error.cause.status}`
	if (error instanceof Error && error.name === 'TimeoutError') return `${stage}:timeout`
	return stage
}

export function configuration(options: WorldIdOptions = {}) {
	const issuer = (options.issuer ?? process.env.WORLD_ID_ISSUER ?? 'https://auth.world.org').replace(/\/$/, '')
	const clientId = options.clientId ?? process.env.WORLD_ID_CLIENT_ID
	const clientSecret = options.clientSecret ?? process.env.WORLD_ID_CLIENT_SECRET
	const clientAuthMethod =
		options.clientAuthMethod ?? process.env.WORLD_ID_CLIENT_AUTH_METHOD ?? 'client_secret_basic'
	if (!clientId || !clientSecret)
		throw new ApprovalError('configuration', 'Set WORLD_ID_CLIENT_ID and WORLD_ID_CLIENT_SECRET.')
	if (clientAuthMethod !== 'client_secret_basic' && clientAuthMethod !== 'client_secret_post') {
		throw new ApprovalError(
			'configuration',
			'Use a client registered with client_secret_basic or client_secret_post.'
		)
	}
	const url = new URL(issuer)
	if (
		url.search ||
		url.hash ||
		url.username ||
		url.password ||
		(url.protocol !== 'https:' &&
			!(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
	) {
		throw new ApprovalError('configuration', 'The World ID issuer must use HTTPS, or HTTP on a loopback host.')
	}
	return { issuer, clientId, clientSecret, clientAuthMethod }
}

type Configuration = ReturnType<typeof configuration>

function oidcClient(config: Configuration) {
	const client: oauth.Client = {
		client_id: config.clientId,
		id_token_signed_response_alg: 'RS256',
		require_auth_time: true,
		[oauth.clockTolerance]: CLOCK_TOLERANCE,
	}
	const clientAuth =
		config.clientAuthMethod === 'client_secret_basic'
			? oauth.ClientSecretBasic(config.clientSecret)
			: oauth.ClientSecretPost(config.clientSecret)
	return { client, clientAuth }
}

function requestOptions(issuer: string, expiresAt = Infinity) {
	return {
		[oauth.allowInsecureRequests]: new URL(issuer).protocol === 'http:',
		signal: () => AbortSignal.timeout(Math.max(1, Math.min(REQUEST_TIMEOUT, expiresAt - Date.now()))),
	}
}

function providerUrl(value: unknown, issuer: string): string {
	if (typeof value !== 'string') throw new Error('The IdP returned an invalid endpoint.')
	const url = new URL(value)
	if (url.origin !== new URL(issuer).origin || url.username || url.password || url.hash) {
		throw new Error('The IdP endpoint must use the configured issuer origin.')
	}
	return url.href
}

export type DeviceAttempt = Awaited<ReturnType<typeof startDeviceAuthorization>>

export async function startDeviceAuthorization(action: string, workflowRunId: string, options: WorldIdOptions) {
	const config = configuration(options)
	const issuer = new URL(config.issuer)
	const discoveryResponse = await oauth.discoveryRequest(issuer, requestOptions(config.issuer))
	const server = await oauth.processDiscoveryResponse(issuer, discoveryResponse)
	providerUrl(server.device_authorization_endpoint, config.issuer)
	const tokenEndpoint = providerUrl(server.token_endpoint, config.issuer)
	const jwksUri = providerUrl(server.jwks_uri, config.issuer)
	const { client, clientAuth } = oidcClient(config)
	const startedAt = Date.now()
	const response = await oauth.deviceAuthorizationRequest(
		server,
		client,
		clientAuth,
		{ scope: 'openid' },
		requestOptions(config.issuer)
	)
	const data = await oauth.processDeviceAuthorizationResponse(server, client, response)
	if (
		!Number.isInteger(data.expires_in) ||
		data.expires_in <= 0 ||
		(data.interval !== undefined && !Number.isInteger(data.interval))
	) {
		throw new Error('World ID returned an invalid device authorization.')
	}
	return {
		approvalId: randomUUID(),
		action,
		workflowRunId,
		issuer: config.issuer,
		clientId: config.clientId,
		tokenEndpoint,
		jwksUri,
		deviceCode: data.device_code,
		verificationUri: providerUrl(data.verification_uri_complete, config.issuer),
		userCode: data.user_code,
		startedAt,
		expiresAt: startedAt + Math.min(data.expires_in, 1200) * 1000,
		interval: data.interval ?? 5,
	}
}

function receiptKey(config: Configuration) {
	return createHmac('sha256', config.clientSecret)
		.update(`${RECEIPT_ISSUER}:receipt:v1:${config.issuer}:${config.clientId}`)
		.digest()
}

function validateWorldApproval(claims: oauth.IDToken, attempt: DeviceAttempt) {
	if (!claims.sub || typeof claims.jti !== 'string' || !claims.jti) {
		throw new ApprovalError('identity', 'World ID returned an invalid identity token.')
	}
	if (claims.azp !== undefined && claims.azp !== attempt.clientId) {
		throw new ApprovalError('azp', 'World ID returned a token for a different client.')
	}
	const now = Math.floor(Date.now() / 1000)
	if (Date.now() >= attempt.expiresAt || claims.exp <= now || claims.iat > now + CLOCK_TOLERANCE) {
		throw new ApprovalError('token_time', 'World ID approval expired or has invalid token times.')
	}
	const authTime = claims.auth_time
	if (
		authTime === undefined ||
		!Number.isInteger(authTime) ||
		authTime < Math.floor(attempt.startedAt / 1000) - CLOCK_TOLERANCE ||
		authTime > now + CLOCK_TOLERANCE
	) {
		throw new ApprovalError('auth_time', 'World ID did not provide fresh authentication for this approval.')
	}
	if (claims.acr !== 'https://world.org/oidc/acr/orb-v3')
		throw new ApprovalError('acr', 'World ID did not provide the required assurance.')
	if (!Array.isArray(claims.amr) || !claims.amr.includes('pop'))
		throw new ApprovalError('amr', 'World ID did not provide proof of personhood.')
}

export async function pollDeviceAuthorization(
	attempt: DeviceAttempt,
	options: WorldIdOptions
): Promise<
	| { status: 'pending' | 'slow_down' | 'connection_error' | 'rejected' | 'expired' }
	| { status: 'approved'; result: HumanApprovalResult }
> {
	if (Date.now() >= attempt.expiresAt) return { status: 'expired' }
	const config = configuration(options)
	if (config.issuer !== attempt.issuer || config.clientId !== attempt.clientId) {
		throw new ApprovalError('configuration', 'World ID configuration changed. Start a new approval request.')
	}
	const server: oauth.AuthorizationServer = {
		issuer: attempt.issuer,
		token_endpoint: attempt.tokenEndpoint,
		jwks_uri: attempt.jwksUri,
	}
	const { client, clientAuth } = oidcClient(config)
	let response: Response
	try {
		response = await oauth.deviceCodeGrantRequest(
			server,
			client,
			clientAuth,
			attempt.deviceCode,
			requestOptions(config.issuer, attempt.expiresAt)
		)
	} catch {
		return { status: 'connection_error' }
	}
	let tokens: oauth.TokenEndpointResponse
	try {
		tokens = await oauth.processDeviceCodeResponse(server, client, response)
	} catch (error) {
		if (error instanceof oauth.ResponseBodyError && error.status === 400) {
			if (error.error === 'authorization_pending') return { status: 'pending' }
			if (error.error === 'slow_down') return { status: 'slow_down' }
			if (error.error === 'access_denied') return { status: 'rejected' }
			if (error.error === 'expired_token') return { status: 'expired' }
		}
		throw new ApprovalError(
			approvalFailure(error, 'token_response'),
			'World ID approval failed. Start a new approval request.'
		)
	}
	const claims = oauth.getValidatedIdTokenClaims(tokens)
	if (!claims || tokens.token_type !== 'bearer') {
		throw new ApprovalError('token_response', 'World ID returned an invalid token response.')
	}
	let keys = jwks.get(attempt.jwksUri)
	if (!keys) {
		keys = {}
		jwks.set(attempt.jwksUri, keys)
	}
	try {
		await oauth.validateApplicationLevelSignature(server, response, {
			...requestOptions(config.issuer, attempt.expiresAt),
			[oauth.jwksCache]: keys,
		})
	} catch (error) {
		throw new ApprovalError(approvalFailure(error, 'signature'), 'World ID could not verify the token signature.')
	}
	validateWorldApproval(claims, attempt)
	const now = Math.floor(Date.now() / 1000)
	const receipt = await new SignJWT({ action: attempt.action, workflowRunId: attempt.workflowRunId })
		.setProtectedHeader({ alg: 'HS256', typ: RECEIPT_TYPE })
		.setIssuer(RECEIPT_ISSUER)
		.setAudience(config.clientId)
		.setJti(attempt.approvalId)
		.setIssuedAt(now)
		.setExpirationTime(Math.min(now + 300, claims.exp))
		.sign(receiptKey(config))
	return { status: 'approved', result: { action: attempt.action, approvalId: attempt.approvalId, receipt } }
}

export async function verifyReceipt(
	result: HumanApprovalResult,
	action: string,
	workflowRunId: string,
	options: WorldIdOptions
) {
	const config = configuration(options)
	const { payload } = await jwtVerify(result.receipt, receiptKey(config), {
		issuer: RECEIPT_ISSUER,
		audience: config.clientId,
		algorithms: ['HS256'],
		typ: RECEIPT_TYPE,
		requiredClaims: ['jti', 'iat', 'exp', 'action', 'workflowRunId'],
	})
	if (
		!payload.jti ||
		payload.action !== action ||
		result.action !== action ||
		payload.jti !== result.approvalId ||
		payload.workflowRunId !== workflowRunId
	)
		throw new Error('The approval does not match this action and workflow.')
	return { action, approvalId: payload.jti }
}
