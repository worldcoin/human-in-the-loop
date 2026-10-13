import { requestHumanAuthorization, verifyHumanAuthorization } from '@worldcoin/human-in-the-loop/workflows'
import type { WorldIdOptions, HumanApprovalResult } from '@worldcoin/human-in-the-loop/workflows'
import { createHook } from 'workflow'

async function protectedOperation(result: HumanApprovalResult, options: WorldIdOptions) {
	'use step'
	return verifyHumanAuthorization(result, 'book:123', options)
}

export async function approvalWorkflow(options: WorldIdOptions, waitForContinuation = false) {
	'use workflow'
	const approve = requestHumanAuthorization<{ flight: string }>({ ...options, action: 'book:123' })
	const result = await approve({ flight: 'AB123' }, { toolCallId: 'call-1', messages: [] })
	const verified = await protectedOperation(result, options)
	if (waitForContinuation) {
		using continuation = createHook()
		await continuation
	}
	return verified
}
