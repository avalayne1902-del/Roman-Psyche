import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node backend/server.js',
    url: 'http://127.0.0.1:4173/api/health',
    reuseExistingServer: false,
    env: {
      PORT: '4173',
      HOST: '127.0.0.1',
      DATABASE_PATH: ':memory:',
      NODE_ENV: 'test',
      PUBLIC_ORIGIN: 'http://127.0.0.1:4173',
      OPENAI_API_KEY: '',
      OPENAI_MODEL: '',
    },
  },
});
