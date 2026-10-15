import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/visual',testMatch:'**/*.spec.ts',fullyParallel:false,workers:1,timeout:60000,
  outputDir:'outputs/visual-results',reporter:[['list'],['html',{outputFolder:'outputs/visual-report',open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1440,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure',
    launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}},
  webServer:{command:'npm run preview:qa',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,timeout:60000},
});
