import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page } from '@playwright/test'
import QRCode from 'qrcode'
import type { components } from '../../src/lib/api-schema'
import { fixtureAccounts, fixturePassword, ownerTest as test } from './fixtures'

const api = '/api/v1'
const projects = '10000000-0000-4000-8000-000000000102'

function grantRow(page: Page, resource: string, recipient: string) {
  return page.getByTestId('outgoing-row').and(page.locator(`[data-resource-id="${resource}"][data-recipient-id="${recipient}"]`))
}

async function readQr(page: Page, row: Locator, expected: string) {
  const opener = row.getByTestId('outgoing-qr')
  await opener.press('Enter')
  const dialog = page.getByRole('dialog').and(page.getByTestId('share-qr-dialog'))
  const link = dialog.getByTestId('share-qr-url')
  await expect(link).toHaveValue(expected)
  const url = await link.inputValue()
  const expectedPattern = QRCode.create(expected).modules
  const samePattern = await dialog.getByTestId('share-qr-image').evaluate(async (image, matrix) => {
    const img = image as HTMLImageElement
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('QR comparison requires a canvas')
    context.drawImage(img, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const scale = 256 / (matrix.size + 6)
    return matrix.data.every((value, index) => {
      const x = Math.floor((index % matrix.size + 3.5) * scale)
      const y = Math.floor((Math.floor(index / matrix.size) + 3.5) * scale)
      return (pixels[(y * canvas.width + x) * 4]! < 128) === Boolean(value)
    })
  }, { size: expectedPattern.size, data: Array.from(expectedPattern.data) })
  expect(samePattern).toBe(true)
  await dialog.getByTestId('share-qr-close').press('Enter')
  await expect(opener).toBeFocused()
  return url
}

test('SHARE-03 manages direct grants and authenticates ordinary file and folder QR destinations', async ({ page, browser, baseURL, ownerRequest: owner, viewerRequest: viewer, reviewerRequest: reviewer }, testInfo) => {
  test.setTimeout(100_000)
  const suffix = randomUUID().slice(0, 8)
  const created = await owner.post(`${api}/folders`, { data: { name: `Thư mục đã chia sẻ ${suffix}`, parentId: projects } })
  expect(created.status()).toBe(201)
  const folder = (await created.json() as components['schemas']['FolderResponse']).data
  const uploaded = await owner.post(`${api}/files`, {
    multipart: { folderId: folder.id, file: { name: `Tệp đã chia sẻ ${suffix}.txt`, mimeType: 'text/plain', buffer: Buffer.from('Nội dung tổng hợp') } },
  })
  expect(uploaded.status()).toBe(201)
  const file = (await uploaded.json() as components['schemas']['FileResponse']).data

  const filePath = `/files/${file.id}`
  const folderPath = `/drive?folder=${folder.id}`
  const sharedFile = await owner.put(`${api}${filePath}/shares`, { data: { email: fixtureAccounts.viewer } })
  const sharedFolder = await owner.put(`${api}/folders/${folder.id}/shares`, { data: { email: fixtureAccounts.viewer } })
  expect(sharedFile.status()).toBe(200)
  expect(sharedFolder.status()).toBe(200)
  const viewerGrant = (await sharedFile.json() as components['schemas']['FileShareResponse']).data
  const { recipientId: folderRecipient } = (await sharedFolder.json() as components['schemas']['FileShareResponse']).data
  const expiring = await owner.put(`${api}${filePath}/shares`, { data: { email: fixtureAccounts.reviewer, expiresAt: new Date(Date.now() + 3000).toISOString() } })
  expect(expiring.status()).toBe(200)
  const { recipientId: reviewerId } = (await expiring.json() as components['schemas']['FileShareResponse']).data

  await page.goto('/drive')
  const nav = page.getByRole('link', { name: /^(đã chia sẻ|shared by me)$/i })
  if (!(await nav.isVisible())) await page.getByRole('button', { name: /mở điều hướng|open navigation/i }).press('Enter')
  await nav.press('Enter')
  await expect(page).toHaveURL(url => url.pathname === '/shared-by-me')
  const fileRow = grantRow(page, file.id, viewerGrant.recipientId)
  const folderRow = grantRow(page, folder.id, folderRecipient)
  await expect(fileRow.getByTestId('outgoing-item-link')).toHaveAttribute('href', filePath)
  await expect(folderRow.getByTestId('outgoing-item-link')).toHaveAttribute('href', folderPath)
  const origin = new URL(baseURL!).origin
  const fileQr = await readQr(page, fileRow, origin + filePath)
  const folderQr = await readQr(page, folderRow, origin + folderPath)
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await testInfo.attach('outgoing-shares', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })

  await page.getByTestId('outgoing-type').selectOption('files')
  await page.getByTestId('outgoing-status-filter').selectOption('expired')
  await expect(page).toHaveURL(url => url.searchParams.get('type') === 'files' && url.searchParams.get('status') === 'expired')
  await page.reload()
  const expired = grantRow(page, file.id, reviewerId)
  await expect(expired).toHaveAttribute('data-grant-status', 'expired')
  await expired.getByTestId('outgoing-renew').press('Enter')
  const renew = page.getByTestId('share-dialog')
  await expect(renew.getByTestId('share-email')).toHaveValue(fixtureAccounts.reviewer)
  await expect(renew.getByTestId('share-expiry')).toBeFocused()
  await renew.getByTestId('share-submit').press('Enter')
  await expect(renew).toBeHidden()
  await expect(expired).toHaveCount(0)
  await expect(page.locator('#outgoing-heading')).toBeFocused()
  await expect(page.getByTestId('outgoing-notice')).toContainText(/đã lưu quyền|access saved/i)
  await page.getByTestId('outgoing-status-filter').selectOption('active')
  await expect(expired).toHaveAttribute('data-grant-status', 'active')

  const { viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent } = testInfo.project.use
  const readerContext = await browser.newContext({ baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent, storageState: { cookies: [], origins: [] } })
  try {
    const reader = await readerContext.newPage()
    await reader.goto(fileQr)
    await expect(reader).toHaveURL(url => url.pathname === '/login' && url.searchParams.get('redirect') === filePath)
    await reader.getByTestId('login-email').fill(fixtureAccounts.viewer)
    await reader.getByTestId('login-password').fill(fixturePassword)
    await reader.getByTestId('login-submit').press('Enter')
    await expect(reader.getByTestId('file-detail')).toContainText(file.originalName)
    await reader.goto(folderQr)
    await expect(reader.getByTestId('drive-read-only')).toBeVisible()

    await fileRow.getByTestId('outgoing-revoke').press('Enter')
    const revoke = page.getByTestId('share-dialog')
    await expect(revoke.getByTestId('share-revoke-cancel')).toBeFocused()
    await revoke.getByTestId('share-revoke-confirm').press('Enter')
    await expect(revoke).toBeHidden()
    await expect(fileRow).toHaveCount(0)
    expect((await viewer.get(`${api}${filePath}`)).status()).toBe(200)

    await page.getByTestId('outgoing-type').selectOption('folders')
    await folderRow.getByTestId('outgoing-revoke').press('Enter')
    await revoke.getByTestId('share-revoke-confirm').press('Enter')
    await expect(revoke).toBeHidden()
    await expect(folderRow).toHaveCount(0)
    await expect(page.getByTestId('outgoing-notice')).toContainText(/đã thu hồi|revoked/i)
    await reader.goto(fileQr)
    await expect(reader.getByTestId('file-detail-error')).toBeVisible()
    expect((await viewer.get(`${api}/folders/${folder.id}/contents`)).status()).toBe(404)
    expect((await reviewer.get(`${api}${filePath}`)).status()).toBe(200)
  } finally {
    await readerContext.close()
  }
})
