import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { environment: 'node', env: { DATA_DIR: path.resolve(import.meta.dirname, 'test-data') }, testTimeout: 60_000, fileParallelism: false },
});
