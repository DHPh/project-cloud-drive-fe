import { expect, test as base, type APIRequestContext, type PlaywrightWorkerArgs, type WorkerFixture } from '@playwright/test'

export const fixtureAccounts = {
  owner: 'demo@example.test',
  viewer: 'viewer@example.test',
  reviewer: 'reviewer@example.test',
}

export const fixturePassword = process.env.DEMO_PASSWORD ?? 'CloudDrive-Demo-2025!'

type Accounts = {
  ownerRequest: APIRequestContext
  viewerRequest: APIRequestContext
  reviewerRequest: APIRequestContext
}

// Keep synthetic sessions in memory and reuse them across specs on the same worker.
function signedInAccount(email: string): WorkerFixture<APIRequestContext, PlaywrightWorkerArgs> {
  return async ({ playwright }, provideRequest, workerInfo) => {
    const baseURL = workerInfo.project.use.baseURL
    if (!baseURL) throw new Error('Playwright fixture accounts require a base URL')
    const request = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: new URL(baseURL).origin },
      // Playwright can inherit the active test's storage state for a new context.
      storageState: { cookies: [], origins: [] },
    })
    try {
      const response = await request.post('/api/v1/auth/login', { data: { email, password: fixturePassword } })
      expect(response.status()).toBe(200)
      expect(await response.json()).toMatchObject({ success: true, data: { email } })
      await provideRequest(request)
    } finally {
      await request.dispose()
    }
  }
}

export const test = base.extend<object, Accounts>({
  ownerRequest: [signedInAccount(fixtureAccounts.owner), { scope: 'worker' }],
  viewerRequest: [signedInAccount(fixtureAccounts.viewer), { scope: 'worker' }],
  reviewerRequest: [signedInAccount(fixtureAccounts.reviewer), { scope: 'worker' }],
})

export const ownerTest = test.extend({
  storageState: async ({ ownerRequest }, provideState) => provideState(await ownerRequest.storageState()),
})
