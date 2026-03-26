import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'
import AxeBuilder from '@axe-core/playwright'
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import type { components } from '../../src/lib/api-schema'
import { fixtureAccounts, ownerTest as test } from './fixtures'

const api = '/api/v1'
const projects = '10000000-0000-4000-8000-000000000102'

async function createFolder(owner: APIRequestContext, name: string, parentId: string) {
  const response = await owner.post(`${api}/folders`, { data: { name, parentId } })
  expect(response.status()).toBe(201)
  return (await response.json() as components['schemas']['FolderResponse']).data
}

function archiveEntries(zip: Buffer) {
  const end = zip.length - 22
  expect(zip.readUInt32LE(end)).toBe(0x06054b50)
  const entries = new Map<string, Buffer>()
  let center = zip.readUInt32LE(end + 16)
  for (let index = 0; index < zip.readUInt16LE(end + 10); index++) {
    expect(zip.readUInt32LE(center)).toBe(0x02014b50)
    const nameLength = zip.readUInt16LE(center + 28)
    const local = zip.readUInt32LE(center + 42)
    expect(zip.readUInt32LE(local)).toBe(0x04034b50)
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const payload = zip.subarray(start, start + zip.readUInt32LE(center + 20))
    const name = zip.subarray(center + 46, center + 46 + nameLength).toString('utf8')
    entries.set(name, zip.readUInt16LE(center + 10) === 8 ? inflateRawSync(payload) : payload)
    center += 46 + nameLength + zip.readUInt16LE(center + 30) + zip.readUInt16LE(center + 32)
  }
  return entries
}

async function receiveArchive(page: Page, folderName: string) {
  const pending = page.waitForEvent('download')
  await page.getByTestId('folder-zip-download').press('Enter')
  const completed = await pending
  expect(completed.suggestedFilename()).toBe(`${folderName}.zip`)
  return archiveEntries(await readFile(await completed.path()))
}

test('ZIP-01 downloads an authorized Unicode tree and exposes interruption or cancellation', async ({ page, browser, baseURL, ownerRequest: owner, viewerRequest: viewer }, testInfo) => {
  test.setTimeout(90_000)
  const suffix = randomUUID().slice(0, 8)
  const root = await createFolder(owner, `Tài liệu ZIP ${suffix}`, projects)
  const nested = await createFolder(owner, 'Tầng có nội dung', root.id)
  const empty = await createFolder(owner, 'Thư mục rỗng', nested.id)
  const bytes = Buffer.from(`Dữ liệu ZIP tiếng Việt ${suffix}\n`)
  const fileName = 'Bản thảo có dấu.txt'
  expect((await owner.post(`${api}/files`, { multipart: { folderId: nested.id, file: { name: fileName, mimeType: 'text/plain', buffer: bytes } } })).status()).toBe(201)
  const shared = await owner.put(`${api}/folders/${root.id}/shares`, { data: { email: fixtureAccounts.viewer } })
  expect(shared.status()).toBe(200)
  const recipient = (await shared.json() as components['schemas']['FileShareResponse']).data.recipientId

  const folder = `/drive?folder=${root.id}`
  const archive = (url: URL) => url.pathname === `${api}/folders/${root.id}/download`
  await page.goto(folder)
  const opener = page.getByTestId('folder-zip-download')
  await expect(opener).toHaveAccessibleName(/tải zip|download zip/i)
  const results = await receiveArchive(page, root.name)
  expect(results.get(`${root.name}/${nested.name}/${fileName}`)).toEqual(bytes)
  expect(results.get(`${root.name}/${nested.name}/${empty.name}/`)).toEqual(Buffer.alloc(0))

  testInfo.annotations.push({ type: 'simulated', description: 'The incomplete response and suspended request test client error and cancellation.' })
  await page.route(archive, route => route.fulfill({ status: 200, headers: { 'Content-Type': 'application/zip' }, body: Buffer.from('PK\x03\x04') }))
  await opener.press('Enter')
  await expect(page.getByTestId('folder-zip-error')).toContainText(/chưa hoàn tất|did not finish/i)
  await page.unroute(archive)
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route(archive, async (route) => { await held; await route.continue().catch(() => undefined) })
  try {
    await opener.press('Enter')
    await expect(opener).toBeDisabled()
    await page.getByTestId('folder-zip-cancel').press('Enter')
    await expect(page.getByTestId('folder-zip-status')).toContainText(/đã hủy|canceled/i)
    await expect(opener).toBeFocused()
  } finally {
    release()
    await page.unroute(archive)
  }

  const { viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent } = testInfo.project.use
  const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent, acceptDownloads: true, storageState: await viewer.storageState() })
  try {
    const reader = await context.newPage()
    await reader.goto(folder)
    await expect(reader.getByTestId('drive-read-only')).toBeVisible()
    await expect(reader.getByTestId('drive-new')).toHaveCount(0)
    const viewerResults = await receiveArchive(reader, root.name)
    expect(viewerResults).toEqual(results)
    const scan = await new AxeBuilder({ page: reader }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
    expect(await reader.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    expect((await owner.delete(`${api}/folders/${root.id}/shares/${recipient}`)).status()).toBe(200)
    expect((await viewer.get(`${api}/folders/${root.id}/download`)).status()).toBe(404)
  } finally {
    await context.close()
  }
})
