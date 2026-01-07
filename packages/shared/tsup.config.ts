import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  // Disable code splitting to avoid rollup dependency
  splitting: false,
  // Use esbuild for everything
  treeshake: false,
});
