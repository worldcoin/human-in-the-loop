import { afterEach, beforeEach, expect, it } from 'vitest'
import { start, resumeWebhook, resumeHook } from 'workflow/api'
import { waitForHook, waitForSleep } from '@workflow/vitest'
import { getWorld } from 'workflow/runtime'
import { approvalWorkflow } from './fixtures/approval-workflow'
import { mockIdp } from './mock-idp'

let idp: Awaited<ReturnType<typeof mockIdp>>
beforeEach(async () => {
	idp = await mockIdp()
})
afterEach(async () => {
	await idp.close()
})

async function decision(run: Awaited<ReturnType<typeof start>>, value: unknown) {
	const hook = await waitForHook(run)
	return resumeWebhook(
		hook.token,
		new Request('https://app.example/decision', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(value),
		})
	)
}

it('runs the published package through a durable wait and verifies its receipt in a protected step', async () => {
	idp.state.responses.push({ error: 'authorization_pending' }, {})
	const run = await start(approvalWorkflow, [idp.options])
	const response = await decision(run, { decision: 'approve', action: 'book:123' })
	expect(response.status).toBe(202)
	expect(await run.returnValue).toMatchObject({ action: 'book:123', approvalId: expect.any(String) })
	expect(idp.state.starts).toHaveLength(1)
	expect(idp.state.polls).toHaveLength(2)
	expect((await getWorld().hooks.list({ runId: run.runId })).data).toHaveLength(0)
	expect(idp.state.polls[1].at - idp.state.polls[0].at).toBeGreaterThanOrEqual(900)
	const reader = run.getReadable().getReader()
	const chunks = []
	while (chunks.length < 3) {
		const next = await reader.read()
		if (next.done) break
		chunks.push(next.value)
	}
	await reader.cancel()
	const stream = JSON.stringify(chunks)
	expect(stream).toContain('verified')
	expect(stream).not.toContain('private-device-code')
	expect(stream).not.toContain('test-client-secret')
	expect(stream).not.toContain('private-world-subject')
})

it('does not poll or approve on a fabricated success flag and rejects a denied action', async () => {
	const run = await start(approvalWorkflow, [idp.options])
	const result = expect(run.returnValue).rejects.toThrow()
	const hook = await waitForHook(run)
	const send = (value: unknown) =>
		resumeWebhook(
			hook.token,
			new Request('https://app.example/decision', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(value),
			})
		)
	expect((await send({ approved: true })).status).toBe(400)
	expect(idp.state.polls).toHaveLength(0)
	expect((await send({ decision: 'reject', action: 'book:123' })).status).toBe(202)
	await result
	expect(idp.state.polls).toHaveLength(0)
	expect((await getWorld().hooks.list({ runId: run.runId })).data).toHaveLength(0)
})

it('increases the polling interval after slow_down', async () => {
	idp.state.responses.push({ error: 'slow_down' }, {})
	const run = await start(approvalWorkflow, [idp.options])
	await decision(run, { decision: 'approve', action: 'book:123' })
	await run.returnValue
	expect(idp.state.polls).toHaveLength(2)
	expect(idp.state.polls[1].at - idp.state.polls[0].at).toBeGreaterThanOrEqual(5900)
})

it.each([{ error: 'access_denied' }, { claims: { auth_time: 1 } }, 'disconnect' as const])(
	'fails without approval or an automatic new attempt: %j',
	async response => {
		idp.state.responses.push(response)
		const run = await start(approvalWorkflow, [idp.options])
		const result = expect(run.returnValue).rejects.toThrow()
		await decision(run, { decision: 'approve', action: 'book:123' })
		await result
		expect(idp.state.starts).toHaveLength(1)
		expect(idp.state.polls).toHaveLength(1)
		expect((await getWorld().hooks.list({ runId: run.runId })).data).toHaveLength(0)
	}
)

it('continues after the retained approval deadline fires without repeating approval or the protected step', async () => {
	idp.state.deviceOverrides = { expires_in: 15 }
	idp.state.responses.push({})
	const run = await start(approvalWorkflow, [idp.options, true])
	const deadlineId = await waitForSleep(run)
	await decision(run, { decision: 'approve', action: 'book:123' })
	const continuation = await waitForHook(run)
	const events = async () => {
		const page = await getWorld().events.list({ runId: run.runId, pagination: { limit: 1000 } })
		expect(page.hasMore).toBe(false)
		return page.data
	}
	const beforeDeadline = await events()
	expect(
		beforeDeadline.filter(event => event.eventType === 'wait_created' && event.correlationId === deadlineId)
	).toHaveLength(1)
	expect(
		beforeDeadline.some(event => event.eventType === 'wait_completed' && event.correlationId === deadlineId)
	).toBe(false)
	expect((await getWorld().hooks.list({ runId: run.runId })).data.map(hook => hook.token)).toEqual([
		continuation.token,
	])
	const completedSteps = beforeDeadline
		.filter(event => event.eventType === 'step_completed')
		.map(event => event.correlationId)
	await expect
		.poll(
			async () =>
				(await events()).some(
					event => event.eventType === 'wait_completed' && event.correlationId === deadlineId
				),
			{ timeout: 20_000 }
		)
		.toBe(true)
	await resumeHook(continuation.token, null)
	expect(await run.returnValue).toMatchObject({ action: 'book:123', approvalId: expect.any(String) })
	const afterDeadline = await events()
	expect(
		afterDeadline.filter(event => event.eventType === 'step_completed').map(event => event.correlationId)
	).toEqual(completedSteps)
	expect(idp.state.starts).toHaveLength(1)
	expect(idp.state.polls).toHaveLength(1)
	expect((await getWorld().hooks.list({ runId: run.runId })).data).toHaveLength(0)
})

it('expires an unanswered action and disposes its webhook', async () => {
	idp.state.deviceOverrides = { expires_in: 1 }
	const run = await start(approvalWorkflow, [idp.options])
	await expect(run.returnValue).rejects.toThrow()
	expect(idp.state.polls).toHaveLength(0)
	expect((await getWorld().hooks.list({ runId: run.runId })).data).toHaveLength(0)
})

it('keeps concurrent approval attempts separate', async () => {
	idp.state.responses.push({}, {})
	const first = await start(approvalWorkflow, [idp.options])
	const second = await start(approvalWorkflow, [idp.options])
	await Promise.all([
		decision(first, { decision: 'approve', action: 'book:123' }),
		decision(second, { decision: 'approve', action: 'book:123' }),
	])
	const results = await Promise.all([first.returnValue, second.returnValue])
	expect(results[0].approvalId).not.toBe(results[1].approvalId)
	expect(new Set(idp.state.polls.map(poll => poll.body.get('device_code'))).size).toBe(2)
	expect(idp.state.starts).toHaveLength(2)
})

it('does not retry a lost initiation response', async () => {
	idp.state.disconnectStart = true
	const run = await start(approvalWorkflow, [idp.options])
	await expect(run.returnValue).rejects.toThrow()
	expect(idp.state.starts).toHaveLength(1)
})
