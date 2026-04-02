import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/workflows/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ['workflow', 'ai', '@worldcoin/idkit-server'],
})
