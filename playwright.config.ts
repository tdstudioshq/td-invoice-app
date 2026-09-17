import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './tests/browser', testMatch: '*.spec.ts', fullyParallel: true,
 use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
 webServer: { command: 'node scripts/safe-check.mjs npx next start -p 3100', url: 'http://127.0.0.1:3100', reuseExistingServer: false },
});
