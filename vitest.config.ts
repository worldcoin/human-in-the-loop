import { defineConfig } from 'vitest/config'

export default defineConfig({
	resolve: {
		alias: { '@': new URL('./examples/flight-booking/src', import.meta.url).pathname },
	},
	esbuild: { jsx: 'automatic' },
	test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], exclude: ['tests/**/*.integration.test.ts'] },
})
