import { defineConfig, devices } from '@playwright/test'

const desktopViewport = { width: 1280, height: 720 }
const mobileViewport = { width: 390, height: 844 }

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    acceptDownloads: true,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: desktopViewport, deviceScaleFactor: 1.25 },
    },
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'], viewport: desktopViewport, deviceScaleFactor: 1.25 },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'], viewport: mobileViewport },
    },
    {
      name: 'webkit-mobile',
      use: { ...devices['iPhone 13'], viewport: mobileViewport },
    },
  ],
})
