import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'
import type { components } from '../../src/lib/api-schema'
import { ownerTest, test } from './fixtures'

const api = '/api/v1'
const projects = '10000000-0000-4000-8000-000000000102'
const retentionMs = 30 * 24 * 60 * 60 * 1000

function trashRow(page: Page, id: string) {
  return page.getByTestId('trash-item').and(page.locator(`[data-item-id="${id}"]`))
}

function trashListUrl(url: URL) {
  return url.pathname === `${api}/trash`
}

function purgeResponse(page: Page, path: string) {
  return page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `${api}${path}`)
}

async function listTrash(account: APIRequestContext) {
  const response = await account.get(`${api}/trash`, { params: { includeFolders: 'true', limit: 100 } })
  expect(response.status()).toBe(200)
  return await response.json() as components['schemas']['TrashListResponse']
}

async function addFile(account: APIRequestContext, name: string, folderId?: string) {
  const upload = await account.post(`${api}/files`, {
    multipart: { ...(folderId ? { folderId } : {}), file: { name, mimeType: 'text/plain', buffer: Buffer.from('Dữ liệu tổng hợp') } },
  })
  expect(upload.status()).toBe(201)
  return (await upload.json() as components['schemas']['FileResponse']).data
}

async function trashFile(account: APIRequestContext, id: string) {
  expect((await account.post(`${api}/files/${id}/trash`)).status()).toBe(200)
}

async function auditAccessibility(page: Page, testInfo: TestInfo, name: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await testInfo.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
}

ownerTest('TRASH-03 confirms a folder purge and blocks stale restore controls after acceptance', async ({ page, ownerRequest: owner }, testInfo) => {
  const suffix = randomUUID().slice(0, 8)
  const created = await owner.post(`${api}/folders`, { data: { name: `Xóa vĩnh viễn ${suffix}`, parentId: projects } })
  expect(created.status()).toBe(201)
  const folder = (await created.json() as components['schemas']['FolderResponse']).data
  await addFile(owner, `Tệp đi cùng thư mục ${suffix}.txt`, folder.id)
  const separate = await addFile(owner, `Tệp xóa riêng ${suffix}.txt`, folder.id)
  await trashFile(owner, separate.id)
  expect((await owner.post(`${api}/folders/${folder.id}/trash`)).status()).toBe(200)
  const listed = (await listTrash(owner)).data.items.find(item => item.kind === 'folder' && item.id === folder.id)
  expect(listed?.deleteAfter).toBeTruthy()
  expect(Date.parse(listed!.deleteAfter!) - Date.parse(listed!.trashedAt)).toBe(retentionMs)

  await page.goto('/trash')
  const row = trashRow(page, folder.id)
  await expect(row).toHaveAttribute('data-purge-status', 'available')
  await expect(row.getByTestId('trash-expiry')).toHaveAttribute('datetime', listed!.deleteAfter!)
  await expect(page.getByTestId('trash-remaining-bytes')).toBeVisible()
  const opener = row.getByTestId('trash-purge-open')
  const dialog = page.getByRole('dialog').and(page.getByTestId('trash-purge-dialog'))
  await opener.press('Enter')
  await expect(dialog).toHaveAccessibleName(/xóa vĩnh viễn|delete permanently/i)
  await expect(dialog.getByTestId('trash-purge-cancel')).toBeFocused()
  await auditAccessibility(page, testInfo, 'folder-purge-confirmation')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
  await opener.press('Enter')

  let releaseRead = () => {}
  const readHeld = new Promise<void>(resolve => { releaseRead = resolve })
  await page.route(trashListUrl, async route => {
    await readHeld
    await route.continue().catch(() => undefined)
  })
  try {
    const pending = purgeResponse(page, `/trash/folder/${folder.id}/purge`)
    await dialog.getByTestId('trash-purge-confirm').press('Enter')
    const response = await pending
    expect(response.status()).toBe(202)
    expect(response.request().postDataJSON()).toEqual({ trashEventId: listed!.trashEventId })
    expect(await response.json()).toMatchObject({ success: true, data: { acceptedCount: 1 } })
    await expect(page.getByTestId('trash-purge-notice')).toContainText(/đã nhận yêu cầu|deletion accepted/i)
    await expect(row.getByTestId('trash-restore')).toHaveCount(0)
    await expect(page.locator('#trash-heading')).toBeFocused()
  } finally {
    releaseRead()
    await page.unroute(trashListUrl)
  }

  const separateRow = trashRow(page, separate.id)
  await expect(separateRow).toHaveAttribute('data-purge-status', 'available')
  await expect(separateRow.getByTestId('trash-restore')).toBeVisible()
  await expect(row.getByTestId('trash-restore')).toHaveCount(0)
  const afterAcceptance = (await listTrash(owner)).data.items.find(item => item.id === folder.id)
  expect(afterAcceptance?.purgeStatus).not.toBe('available')
})

test('TRASH-03 retries the same Empty Trash command after losing its response', async ({ page, reviewerRequest: reviewer }) => {
  const suffix = randomUUID().slice(0, 8)
  const first = await addFile(reviewer, `Chọn trong lần dọn ${suffix}.txt`)
  await trashFile(reviewer, first.id)
  const countBefore = (await listTrash(reviewer)).data.summary.recoverableCount
  await page.context().addCookies((await reviewer.storageState()).cookies)
  await page.goto('/trash')
  await expect(trashRow(page, first.id)).toHaveAttribute('data-purge-status', 'available')

  const commandIds: string[] = []
  await page.route(url => url.pathname === `${api}/trash/empty`, async route => {
    const body: components['schemas']['EmptyTrashRequest'] = route.request().postDataJSON()
    commandIds.push(body.requestId)
    if (commandIds.length > 1) {
      await route.continue()
      return
    }
    const result = await route.fetch()
    expect(result.status()).toBe(202)
    expect(await result.json()).toMatchObject({ success: true, data: { acceptedCount: countBefore } })
    await route.abort('failed')
  })

  await page.getByTestId('trash-empty-open').press('Enter')
  const dialog = page.getByRole('dialog').and(page.getByTestId('trash-purge-dialog'))
  await expect(dialog).toHaveAccessibleName(/dọn Thùng rác|empty trash/i)
  await expect(dialog.getByTestId('trash-purge-cancel')).toBeFocused()
  await dialog.getByTestId('trash-purge-confirm').press('Enter')
  await expect(dialog.getByTestId('trash-purge-error')).toBeVisible()
  const later = await addFile(reviewer, `Vào thùng rác sau ${suffix}.txt`)
  await trashFile(reviewer, later.id)
  try {
    const pending = purgeResponse(page, '/trash/empty')
    await dialog.getByTestId('trash-purge-confirm').press('Enter')
    const result = await pending
    expect(result.status()).toBe(202)
    expect(await result.json()).toMatchObject({ success: true, data: { acceptedCount: countBefore } })
    expect(commandIds).toEqual([commandIds[0], commandIds[0]])
    await expect(dialog).toBeHidden()
    await expect(page.locator('#trash-heading')).toBeFocused()
    await expect(trashRow(page, later.id)).toHaveAttribute('data-purge-status', 'available')
  } finally {
    // Keep the synthetic reviewer fixture clear for later runs of the batch case.
    await reviewer.post(`${api}/trash/empty`, { data: { requestId: randomUUID() } })
  }
})

ownerTest('TRASH-03 shows simulated deleting and retrying states without restore actions', async ({ page, ownerRequest: owner }, testInfo) => {
  testInfo.annotations.push({ type: 'simulated', description: 'Trash list statuses are controlled for UI verification.' })
  const suffix = randomUUID().slice(0, 8)
  const first = await addFile(owner, `Đang xóa ${suffix}.txt`)
  const second = await addFile(owner, `Đang thử lại ${suffix}.txt`)
  await trashFile(owner, first.id)
  await trashFile(owner, second.id)

  const source = await listTrash(owner)
  const items = source.data.items.filter(item => item.id === first.id || item.id === second.id)
  expect(items).toHaveLength(2)
  const fixture: components['schemas']['TrashListResponse'] = {
    success: true,
    data: {
      items: items.map(item => ({ ...item, purgeStatus: item.id === first.id ? 'purging' : 'retrying' })),
      summary: { remainingBytes: first.size + second.size, recoverableCount: 0, purgingCount: 1, retryingCount: 1 },
    },
    pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
  }
  await page.route(trashListUrl, route => route.fulfill({ status: 200, json: fixture }))
  await page.goto('/trash')
  await expect(trashRow(page, first.id)).toHaveAttribute('data-purge-status', 'purging')
  await expect(trashRow(page, second.id)).toHaveAttribute('data-purge-status', 'retrying')
  await expect(page.getByTestId('trash-purging-count')).toHaveText('1')
  await expect(page.getByTestId('trash-retrying-count')).toHaveText('1')
  await expect(page.getByTestId('trash-restore')).toHaveCount(0)
  await expect(page.getByTestId('trash-purge-open')).toHaveCount(0)
  await expect(page.getByTestId('trash-empty-open')).toHaveCount(0)
  await auditAccessibility(page, testInfo, 'trash-retrying-status')
})
