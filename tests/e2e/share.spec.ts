import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, type APIRequestContext, type Locator, type Page, type TestInfo } from '@playwright/test'
import type { components } from '../../src/lib/api-schema'
import { fixtureAccounts, fixturePassword, ownerTest as test } from './fixtures'

const api = '/api/v1'
const projects = '10000000-0000-4000-8000-000000000102'
const viewerEmail = fixtureAccounts.viewer
const reviewerEmail = fixtureAccounts.reviewer
const password = fixturePassword
const vietnamOffsetMs = 7 * 60 * 60 * 1000

type ShareGrant = components['schemas']['ShareGrant']
type FileSharesResponse = components['schemas']['FileSharesResponse']

function nextVietnamCalendarMonth(issuedAt: string) {
  const vietnamTime = new Date(Date.parse(issuedAt) + vietnamOffsetMs)
  const day = vietnamTime.getUTCDate()
  const lastDay = new Date(Date.UTC(vietnamTime.getUTCFullYear(), vietnamTime.getUTCMonth() + 2, 0)).getUTCDate()
  vietnamTime.setUTCMonth(vietnamTime.getUTCMonth() + 1, Math.min(day, lastDay))
  return new Date(vietnamTime.getTime() - vietnamOffsetMs).toISOString()
}

function apiResponse(page: Page, method: string, path: string) {
  return page.waitForResponse(response =>
    response.request().method() === method && new URL(response.url()).pathname === `${api}${path}`,
  )
}

function itemById(page: Page, testId: 'drive-item' | 'shared-item' | 'trash-item', id: string) {
  return page.getByTestId(testId).and(page.locator(`[data-item-id="${id}"]`))
}

async function openShareDialog(page: Page, driveItem: Locator) {
  await driveItem.getByTestId('file-share').press('Enter')
  const dialog = page.getByRole('dialog').and(page.getByTestId('share-dialog'))
  await expect(dialog).toHaveAccessibleName(/chia sẻ tệp|share file/i)
  await expect(dialog.getByTestId('share-email')).toBeFocused()
  return dialog
}

async function grantFromDialog(page: Page, dialog: Locator, filePath: string, email: string, localExpiry = '') {
  await dialog.getByTestId('share-email').fill(email)
  await dialog.getByTestId('share-expiry').fill(localExpiry)
  const saved = apiResponse(page, 'PUT', `${filePath}/shares`)
  await dialog.getByTestId('share-submit').press('Enter')
  const response = await saved
  expect(response.status()).toBe(200)
  const payload: components['schemas']['FileShareResponse'] = await response.json()
  expect(payload).toMatchObject({ success: true, data: { recipientEmail: email, isActive: true } })
  await expect(dialog.getByTestId('share-status')).toContainText(/đã lưu quyền|access saved/i)
  return payload.data
}

async function listGrants(owner: APIRequestContext, filePath: string) {
  const response = await owner.get(`${api}${filePath}/shares`, { params: { page: 1, limit: 20 } })
  expect(response.status()).toBe(200)
  return await response.json() as FileSharesResponse
}

async function expectFileDenied(request: APIRequestContext, filePath: string) {
  for (const path of [filePath, `${filePath}/download`]) {
    const denied = await request.get(`${api}${path}`)
    expect(denied.status()).toBe(404)
    expect(denied.headers()['cache-control']).toBe('private, no-store')
    expect(await denied.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } })
  }
}

async function verifyAccessibility(page: Page, testInfo: TestInfo, name: string) {
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await testInfo.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
}

test('SHARE-01 grants file access by account, honors expiry, and clears access after revoke or Trash', async ({ page, browser, baseURL, ownerRequest: owner, reviewerRequest: reviewer }, testInfo) => {
  test.setTimeout(75_000)
  const appOrigin = new URL(baseURL!).origin
  const { viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent } = testInfo.project.use
  const viewerContext = await browser.newContext({
    baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent, acceptDownloads: true,
    storageState: { cookies: [], origins: [] },
  })

  try {
    const suffix = randomUUID().slice(0, 8)
    const destination = `/drive?folder=${projects}&q=${suffix}`
    const originalName = `Tài liệu chia sẻ ${suffix}.txt`
    const bytes = Buffer.from(`SHARE-01 ${suffix}\nNội dung thử nghiệm\n`)

    const fileId = await test.step('Upload a synthetic owned file', async () => {
      await page.goto(destination)
      await expect(page.getByTestId('drive-empty-search')).toBeVisible()
      await page.getByTestId('drive-new').click()
      await page.getByTestId('upload-open').click()
      const dialog = page.getByTestId('upload-dialog')
      await dialog.getByTestId('upload-input').setInputFiles({ name: originalName, mimeType: 'text/plain', buffer: bytes })
      const uploaded = apiResponse(page, 'POST', '/files')
      await dialog.getByTestId('upload-submit').click()
      const response = await uploaded
      expect(response.status()).toBe(201)
      const payload: components['schemas']['FileResponse'] = await response.json()
      expect(payload).toMatchObject({ success: true, data: { folderId: projects, originalName, size: bytes.length } })
      await expect(dialog.getByTestId('upload-item')).toHaveAttribute('data-status', 'complete')
      await dialog.getByTestId('upload-close').click()
      return payload.data.id
    })

    const filePath = `/files/${fileId}`
    const driveItem = itemById(page, 'drive-item', fileId)
    const initialGrant = await test.step('Grant the default expiry and read the account link', async () => {
      await expect(driveItem.getByText(originalName, { exact: true })).toBeVisible()
      const dialog = await openShareDialog(page, driveItem)
      await expect(dialog.getByTestId('share-empty')).toBeVisible()
      const grant = await grantFromDialog(page, dialog, filePath, viewerEmail)
      expect(grant.expiresAt).toBe(nextVietnamCalendarMonth(grant.grantedAt))
      const row = dialog.getByTestId('share-recipient')
      await expect(row).toHaveCount(1)
      await expect(row).toContainText(viewerEmail)
      const shareLink = dialog.getByTestId('share-link')
      await expect(shareLink).toHaveValue(appOrigin + filePath)
      await expect(dialog.getByTestId('share-copy')).toBeVisible()
      const repeated = await owner.put(`${api}${filePath}/shares`, { data: { email: viewerEmail } })
      expect(repeated.status()).toBe(200)
      expect(await repeated.json()).toEqual({ success: true, data: grant })
      const listed = await listGrants(owner, filePath)
      expect(listed.data.items).toEqual([grant])
      expect(listed.pagination.total).toBe(1)
      await verifyAccessibility(page, testInfo, 'share-dialog')
      await dialog.getByTestId('share-close').press('Enter')
      await expect(dialog).toBeHidden()
      await expect(driveItem.getByTestId('file-share')).toBeFocused()
      const ownerFile = await owner.get(`${api}${filePath}`)
      expect(ownerFile.status()).toBe(200)
      expect(await ownerFile.json()).toMatchObject({ success: true, data: { id: fileId, originalName } })
      await expectFileDenied(reviewer, filePath)
      return grant
    })

    const viewerPage = await viewerContext.newPage()
    const viewerItem = itemById(viewerPage, 'shared-item', fileId)
    await test.step('Sign in from the direct link and download the same bytes', async () => {
      await viewerPage.goto(filePath)
      await expect(viewerPage).toHaveURL(url => url.pathname === '/login' && url.searchParams.get('redirect') === filePath)
      await viewerPage.getByTestId('login-email').fill(viewerEmail)
      await viewerPage.getByTestId('login-password').fill(password)
      const login = apiResponse(viewerPage, 'POST', '/auth/login')
      await viewerPage.getByTestId('login-submit').click()
      expect((await login).status()).toBe(200)
      await expect(viewerPage).toHaveURL(url => url.pathname === filePath)
      const detail = viewerPage.getByTestId('file-detail')
      await expect(detail.getByRole('heading', { name: originalName, exact: true })).toBeVisible()
      await verifyAccessibility(viewerPage, testInfo, 'shared-file-detail')
      const downloaded = viewerPage.waitForEvent('download')
      await detail.getByTestId('file-detail-download').click()
      const download = await downloaded
      expect(download.suggestedFilename()).toBe(originalName)
      expect(await readFile(await download.path())).toEqual(bytes)

      const sharedLink = viewerPage.getByRole('link', { name: /^(được chia sẻ với tôi|shared with me)$/i })
      if (!await sharedLink.isVisible()) {
        await viewerPage.getByRole('button', { name: /mở điều hướng|open navigation/i }).press('Enter')
      }
      await expect(sharedLink).toHaveAttribute('href', '/shared-with-me')
      await sharedLink.press('Enter')
      await expect(viewerPage).toHaveURL(url => url.pathname === '/shared-with-me')
      await expect(viewerItem.getByTestId('shared-file-link')).toHaveAttribute('href', filePath)
      await expect(viewerItem.getByTestId('shared-file-link')).toHaveAccessibleName(originalName)
      await verifyAccessibility(viewerPage, testInfo, 'shared-with-me')
    })

    await test.step('Revoke the grant with the keyboard and verify loss of access', async () => {
      const dialog = await openShareDialog(page, driveItem)
      const row = dialog.getByTestId('share-recipient').and(dialog.locator(`[data-recipient-id="${initialGrant.recipientId}"]`))
      await row.getByTestId('share-revoke').press('Enter')
      await expect(dialog.getByTestId('share-revoke-cancel')).toBeFocused()
      const revoked = apiResponse(page, 'DELETE', `${filePath}/shares/${initialGrant.recipientId}`)
      await dialog.getByTestId('share-revoke-confirm').press('Enter')
      const response = await revoked
      expect(response.status()).toBe(200)
      expect(await response.json()).toEqual({ success: true, data: { revoked: true } })
      await expect(row).toHaveCount(0)
      await expect(dialog.getByTestId('share-email')).toBeFocused()
      await expect(dialog.getByTestId('share-status')).toContainText(/đã thu hồi quyền|access revoked/i)
      const refreshed = apiResponse(viewerPage, 'GET', '/shared-with-me')
      await viewerPage.reload()
      const sharedList = await refreshed
      expect(sharedList.status()).toBe(200)
      const list: components['schemas']['SharedFilesResponse'] = await sharedList.json()
      expect(list.data.items).not.toContainEqual(expect.objectContaining({ id: fileId }))
      await expect(viewerPage.getByRole('heading', { level: 1, name: /được chia sẻ với tôi|shared with me/i })).toBeVisible()
      await expect(viewerItem).toHaveCount(0)
      await viewerPage.goto(filePath)
      await expect(viewerPage.getByTestId('file-detail-error')).toBeVisible()
      await expectFileDenied(viewerPage.request, filePath)
    })

    await test.step('Honor a custom expiry while another recipient uses one calendar month', async () => {
      const dialog = page.getByTestId('share-dialog')
      const localExpiry = new Date(Date.now() + vietnamOffsetMs + 9 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
      const customGrant = await grantFromDialog(page, dialog, filePath, viewerEmail, localExpiry)
      expect(customGrant.expiresAt).toBe(new Date(`${localExpiry}+07:00`).toISOString())
      const reviewerGrant: ShareGrant = await grantFromDialog(page, dialog, filePath, reviewerEmail)
      expect(reviewerGrant.expiresAt).toBe(nextVietnamCalendarMonth(reviewerGrant.grantedAt))
      await expect(dialog.getByTestId('share-recipient')).toHaveCount(2)
      const listed = await listGrants(owner, filePath)
      expect(listed.data.items).toEqual(expect.arrayContaining([customGrant, reviewerGrant]))
      expect(listed.pagination.total).toBe(2)
      expect((await viewerPage.request.get(`${api}${filePath}`)).status()).toBe(200)
      expect((await reviewer.get(`${api}${filePath}`)).status()).toBe(200)
      await dialog.getByTestId('share-close').press('Enter')
      await expect(dialog).toBeHidden()
    })

    await test.step('Restore the file from Trash with both grants removed', async () => {
      await driveItem.getByTestId('file-trash').press('Enter')
      const moved = apiResponse(page, 'POST', `${filePath}/trash`)
      await page.getByTestId('trash-dialog').getByTestId('trash-confirm').press('Enter')
      expect((await moved).status()).toBe(200)
      await expect(driveItem).toHaveCount(0)
      await expectFileDenied(viewerPage.request, filePath)
      await expectFileDenied(reviewer, filePath)
      await page.goto('/trash')
      const restored = apiResponse(page, 'POST', `${filePath}/restore`)
      await itemById(page, 'trash-item', fileId).getByTestId('trash-restore').press('Enter')
      const response = await restored
      expect(response.status()).toBe(200)
      expect(await response.json()).toMatchObject({ success: true, data: { id: fileId, trashedAt: null } })
      await page.goto(destination)
      const dialog = await openShareDialog(page, driveItem)
      await expect(dialog.getByTestId('share-empty')).toBeVisible()
      expect((await listGrants(owner, filePath)).data.items).toEqual([])
      await viewerPage.reload()
      await expect(viewerPage.getByTestId('file-detail-error')).toBeVisible()
      await expectFileDenied(viewerPage.request, filePath)
      await expectFileDenied(reviewer, filePath)
      const downloaded = await owner.get(`${api}${filePath}/download`)
      expect(downloaded.status()).toBe(200)
      expect(await downloaded.body()).toEqual(bytes)

      const newGrant = await grantFromDialog(page, dialog, filePath, viewerEmail)
      await viewerPage.reload()
      await expect(viewerPage.getByTestId('file-detail')).toBeVisible()
      expect((await owner.delete(`${api}${filePath}/shares/${newGrant.recipientId}`)).status()).toBe(200)
    })
  } finally {
    await viewerContext.close()
  }
})
