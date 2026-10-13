export interface WorldIdOptions {
	/** Defaults to WORLD_ID_ISSUER, then https://auth.world.org. */
	issuer?: string
	/** Defaults to WORLD_ID_CLIENT_ID. */
	clientId?: string
	/** Defaults to WORLD_ID_CLIENT_SECRET. Use the environment in production. */
	clientSecret?: string
	/** Must match the registered method. Defaults to client_secret_basic. */
	clientAuthMethod?: 'client_secret_basic' | 'client_secret_post'
}

export interface HumanApprovalResult {
	action: string
	approvalId: string
	/** Signed approval receipt bound to the action, client, and Workflow run. */
	receipt: string
}

export interface HumanApprovalContext {
	webhookUrl: string
	action: string
	/** The server's input snapshot, shown before approval. */
	input: unknown
	verificationUri: string
	userCode: string
	expiresAt: number
}

export type HumanApprovalStatus = 'verifying' | 'verified' | 'rejected' | 'expired' | 'error'
