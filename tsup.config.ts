import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/solid-id.ts'],
  dts: true,
  clean: true,
  format: ['esm', 'cjs'],
  target: 'es2020',
  sourcemap: true,
  treeshake: true,
  minify: true,
});