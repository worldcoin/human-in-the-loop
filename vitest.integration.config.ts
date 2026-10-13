import { defineConfig } from 'vitest/config'
import { workflow } from '@workflow/vitest'

export default defineConfig({
	plugins: [workflow()],
	test: {
		include: ['tests/**/*.integration.test.ts'],
		testTimeout: 30_000,
		hookTimeout: 30_000,
		fileParallelism: false,
	},
})
