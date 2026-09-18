import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser', testMatch:'*.integration.ts', workers:1, timeout:120000,
 use:{baseURL:'http://127.0.0.1:3101'},
 webServer:[
  {command:'npx next dev -p 3101',url:'http://127.0.0.1:3101',reuseExistingServer:false},
 ],
});
