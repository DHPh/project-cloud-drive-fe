import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'
import type { components } from '../../src/lib/api-schema'
import { fixtureAccounts, ownerTest as test } from './fixtures'

const api = '/api/v1'
const projects = '10000000-0000-4000-8000-000000000102'

async function createFolder(account: APIRequestContext, name: string, parentId?: string, description?: string) {
  const response = await account.post(`${api}/folders`, { data: { name, parentId, description } })
  expect(response.status()).toBe(201)
  return (await response.json() as components['schemas']['FolderResponse']).data
}

async function upload(account: APIRequestContext, name: string, folderId?: string, mimeType = 'text/plain') {
  const buffer = mimeType === 'image/png'
    ? Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC3sAAAAASUVORK5CYII=', 'base64')
    : Buffer.from('Nội dung thử nghiệm')
  const response = await account.post(`${api}/files`, { multipart: { ...(folderId ? { folderId } : {}), file: { name, mimeType, buffer } } })
  expect(response.status()).toBe(201)
  return (await response.json() as components['schemas']['FileResponse']).data
}

function resultRow(page: Page, type: 'global-drive-row' | 'timeline-row', id: string) {
  return page.getByTestId(type).and(page.locator(`[data-item-id="${id}"]`))
}

async function auditAccessibility(page: Page, testInfo: TestInfo, name: string) {
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await testInfo.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
}

test('DRIVE-04 keeps local search and searches only owned active items with URL-backed filters', async ({ page, ownerRequest: owner, viewerRequest: viewer }, testInfo) => {
  test.setTimeout(90_000)
  const suffix = randomUUID().slice(0, 8)
  const metadata = `ghi chú riêng ${suffix}`
  const folder = await createFolder(owner, `Thư mục ${suffix}`, projects, metadata)
  const fileQuery = `Biên bản gốc ${suffix}`
  const file = await upload(owner, `${fileQuery}.txt`, folder.id)
  expect((await owner.patch(`${api}/files/${file.id}`, { data: { tags: [metadata] } })).status()).toBe(200)
  const received = await upload(viewer, `${metadata} của người khác.txt`)
  expect((await viewer.put(`${api}/files/${received.id}/shares`, { data: { email: fixtureAccounts.owner } })).status()).toBe(200)
  const removed = await upload(owner, `${metadata} đã xóa.txt`, folder.id)
  expect((await owner.post(`${api}/files/${removed.id}/trash`)).status()).toBe(200)
  const local = new URLSearchParams({ folder: projects, q: fileQuery })
  await page.goto(`/drive?${local}`)
  await expect(page.getByTestId('drive-empty-search')).toBeVisible()
  await page.getByTestId('global-drive-search-open').press('Enter')
  await expect(page).toHaveURL(url => url.pathname === '/drive/search' && url.searchParams.get('q') === fileQuery)
  const result = resultRow(page, 'global-drive-row', file.id)
  await expect(result.getByTestId('discovery-item-link')).toHaveAttribute('href', `/files/${file.id}`)
  await expect(result.getByTestId('discovery-origin')).toContainText(folder.name)
  await expect(result.getByTestId('discovery-origin')).toHaveAttribute('href', `/drive?folder=${folder.id}`)
  await auditAccessibility(page, testInfo, 'global-drive-search')

  const input = page.getByTestId('global-drive-query')
  await input.fill(metadata)
  await input.press('Enter')
  await expect(page).toHaveURL(url => url.searchParams.get('q') === metadata)
  await expect(page.getByTestId('discovery-empty')).toBeVisible()
  await page.getByTestId('global-drive-metadata').check()
  await expect(result).toBeVisible()
  await expect(resultRow(page, 'global-drive-row', folder.id)).toBeVisible()
  await expect(resultRow(page, 'global-drive-row', received.id)).toHaveCount(0)
  await expect(resultRow(page, 'global-drive-row', removed.id)).toHaveCount(0)
  await page.getByTestId('global-drive-type').selectOption('files')
  await page.getByTestId('global-drive-sort').selectOption('newest')
  await expect(page).toHaveURL(url => url.searchParams.get('includeMetadata') === 'true' && url.searchParams.get('type') === 'files' && url.searchParams.get('sort') === 'newest')
  await page.reload()
  await expect(page.getByTestId('global-drive-query')).toHaveValue(metadata)
  await expect(page.getByTestId('global-drive-type')).toHaveValue('files')
  await expect(result).toBeVisible()
  await result.getByTestId('discovery-item-link').press('Enter')
  await expect(page.getByTestId('file-detail')).toBeVisible()
  await page.goBack()
  await expect(page.getByTestId('global-drive-query')).toHaveValue(metadata)
  await expect(page.getByTestId('global-drive-metadata')).toBeChecked()

  const pageNeedle = `Phân trang ${suffix}`
  for (let i = 1; i <= 21; i++) await createFolder(owner, `${pageNeedle} ${String(i).padStart(2, '0')}`, projects)
  await input.fill(pageNeedle)
  await input.press('Enter')
  await page.getByTestId('global-drive-type').selectOption('folders')
  await expect(page.getByTestId('global-drive-row')).toHaveCount(20)
  await page.getByTestId('discovery-next').press('Enter')
  await expect(page).toHaveURL(url => url.searchParams.get('page') === '2')
  await expect(page.getByTestId('global-drive-row')).toHaveCount(1)
  await page.getByTestId('global-drive-sort').selectOption('name')
  await expect(page).toHaveURL(url => !url.searchParams.has('page'))
  await expect(page.getByTestId('global-drive-row')).toHaveCount(20)
})

test('DRIVE-04 timeline groups by Vietnam upload date and keeps valid date and MIME filters', async ({ page, ownerRequest: owner, viewerRequest: viewer }, testInfo) => {
  const suffix = randomUUID().slice(0, 8)
  const image = await upload(owner, `Ảnh ${suffix}.png`, projects, 'image/png')
  const document = await upload(owner, `Tài liệu ${suffix}.txt`, projects)
  const received = await upload(viewer, `Ảnh nhận ${suffix}.png`, undefined, 'image/png')
  expect((await viewer.put(`${api}/files/${received.id}/shares`, { data: { email: fixtureAccounts.owner } })).status()).toBe(200)
  const day = new Date(Date.parse(image.createdAt) + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const after = new Date(Date.parse(`${day}T00:00:00.000Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  await page.goto('/drive')
  const link = page.getByRole('link', { name: /^(Dòng thời gian|Timeline)$/i })
  if (!(await link.isVisible())) await page.getByRole('button', { name: /mở điều hướng|open navigation/i }).press('Enter')
  await link.press('Enter')
  await expect(page).toHaveURL(url => url.pathname === '/drive/timeline')
  await expect(resultRow(page, 'timeline-row', image.id)).toBeVisible()
  const group = page.getByTestId('timeline-day').filter({ has: resultRow(page, 'timeline-row', image.id) })
  await expect(group).toHaveAttribute('data-upload-day', day)
  await auditAccessibility(page, testInfo, 'drive-timeline')

  await page.getByTestId('timeline-from').fill(day)
  await page.getByTestId('timeline-to').fill(day)
  await page.getByTestId('timeline-type').selectOption('image')
  await expect(page).toHaveURL(url => url.searchParams.get('from') === day && url.searchParams.get('to') === day && url.searchParams.get('type') === 'image')
  await expect(resultRow(page, 'timeline-row', image.id)).toBeVisible()
  await expect(resultRow(page, 'timeline-row', document.id)).toHaveCount(0)
  await expect(resultRow(page, 'timeline-row', received.id)).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('timeline-type')).toHaveValue('image')
  await expect(resultRow(page, 'timeline-row', image.id)).toBeVisible()

  await page.getByTestId('timeline-from').fill(after)
  await expect(page.getByTestId('timeline-date-error')).toBeVisible()
  await expect(resultRow(page, 'timeline-row', image.id)).toHaveCount(0)
  await page.goBack()
  await expect(page.getByTestId('timeline-from')).toHaveValue(day)
  await expect(page.getByTestId('timeline-date-error')).toHaveCount(0)
  await expect(resultRow(page, 'timeline-row', image.id)).toBeVisible()

  expect((await owner.patch(`${api}/files/${image.id}`, { data: { originalName: `Ảnh đã đổi tên ${suffix}.png`, description: 'Mô tả mới' } })).status()).toBe(200)
  await page.reload()
  await expect(resultRow(page, 'timeline-row', image.id)).toContainText(`Ảnh đã đổi tên ${suffix}.png`)
  await expect(group).toHaveAttribute('data-upload-day', day)
})
