import { defineConfig } from '@playwright/test';
export default defineConfig({
 globalSetup:'./tests/browser/integration-setup.ts',
 testDir:'./tests/browser', testMatch:'*.integration.ts', workers:1, timeout:120000,
 use:{baseURL:'http://127.0.0.1:3101',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:[
  {command:'npx next build && npx next start -p 3101',timeout:180000,url:'http://127.0.0.1:3101',reuseExistingServer:false},
 ],
});
