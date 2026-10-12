import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    testTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
      AUTH_SECRET: 'vitest-only-secret-0123456789abcdef0123456789abcdef',
      STORAGE_DIR: './test-storage',
      STT_PROVIDER: 'mock',
      LLM_PROVIDER: 'mock',
      MAX_UPLOAD_MB: '20'
    }
  }
});
