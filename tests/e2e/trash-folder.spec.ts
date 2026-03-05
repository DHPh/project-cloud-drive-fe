import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, type APIRequestContext, type APIResponse, type Page, type TestInfo } from '@playwright/test'
import type { components } from '../../src/lib/api-schema'
import { fixtureAccounts, ownerTest as test } from './fixtures'

const api = '/api/v1'
const projects = '10000000-0000-4000-8000-000000000102'

function driveHref(folder: string, q?: string) {
  const params = new URLSearchParams({ folder })
  if (q) params.set('q', q)
  return `/drive?${params}`
}

function row(page: Page, list: 'drive-item' | 'trash-item', id: string) {
  return page.getByTestId(list).and(page.locator(`[data-item-id="${id}"]`))
}

function postResponse(page: Page, path: string) {
  return page.waitForResponse(response =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === `${api}${path}`,
  )
}

async function createFolder(owner: APIRequestContext, name: string, parentId: string) {
  const response = await owner.post(`${api}/folders`, { data: { name, parentId } })
  expect(response.status()).toBe(201)
  return (await response.json() as components['schemas']['FolderResponse']).data
}

async function uploadFile(owner: APIRequestContext, folderId: string, name: string, buffer: Buffer) {
  const response = await owner.post(`${api}/files`, { multipart: { folderId, file: { name, mimeType: 'text/plain', buffer } } })
  expect(response.status()).toBe(201)
  return (await response.json() as components['schemas']['FileResponse']).data
}

async function listTrash(owner: APIRequestContext, includeFolders: boolean) {
  const response = await owner.get(`${api}/trash`, { params: { ...(includeFolders ? { includeFolders: 'true' } : {}), limit: 100 } })
  expect(response.status()).toBe(200)
  return (await response.json() as components['schemas']['TrashListResponse']).data.items
}

async function expectNotFound(response: APIResponse) {
  expect(response.status()).toBe(404)
  expect(await response.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } })
}

async function verifyAccessibility(page: Page, testInfo: TestInfo, label: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await testInfo.attach(label, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
}

test('TRASH-02 moves and restores a tree with separate roots, revoked grants, and collision names', async ({ page, ownerRequest: owner, viewerRequest: viewer, reviewerRequest: reviewer }, testInfo) => {
  test.setTimeout(90_000)
  const suffix = randomUUID().slice(0, 8)
  const parent = await createFolder(owner, `Cha riêng tư ${suffix}`, projects)
  const tree = await createFolder(owner, `Cây tài liệu ${suffix}`, parent.id)
  const nested = await createFolder(owner, `Thư mục con ${suffix}`, tree.id)
  const separateFolder = await createFolder(owner, `Mục xóa riêng ${suffix}`, tree.id)
  const bytes = Buffer.from(`Nội dung được giữ sau khôi phục ${suffix}\n`)
  const activeFile = await uploadFile(owner, nested.id, `Tệp giữ nguyên ${suffix}.txt`, bytes)
  const stem = `Bản lưu ${suffix}.v1`
  const separateFile = await uploadFile(owner, nested.id, `${stem}.txt`, bytes)
  await expect((await owner.put(`${api}/folders/${tree.id}/shares`, { data: { email: fixtureAccounts.viewer } })).status()).toBe(200)
  await expect((await owner.put(`${api}/files/${activeFile.id}/shares`, { data: { email: fixtureAccounts.reviewer } })).status()).toBe(200)
  expect((await viewer.get(`${api}/folders/${nested.id}/contents`)).status()).toBe(200)
  expect((await reviewer.get(`${api}/files/${activeFile.id}/download`)).status()).toBe(200)
  expect((await owner.post(`${api}/folders/${separateFolder.id}/trash`)).status()).toBe(200)
  expect((await owner.post(`${api}/files/${separateFile.id}/trash`)).status()).toBe(200)

  await test.step('Confirm moving one tree from Drive and keep separate Trash roots', async () => {
    const destination = driveHref(parent.id, suffix)
    await page.goto(destination)
    const item = row(page, 'drive-item', tree.id)
    const action = item.getByTestId('folder-trash')
    await action.press('Enter')
    const dialog = page.getByRole('dialog').and(page.getByTestId('trash-dialog'))
    await expect(dialog).toHaveAccessibleName(/đưa thư mục vào thùng rác|move folder to trash/i)
    await expect(dialog.getByTestId('trash-cancel')).toBeFocused()
    await verifyAccessibility(page, testInfo, 'folder-trash-confirm')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(action).toBeFocused()
    await action.press('Enter')
    const pending = postResponse(page, `/folders/${tree.id}/trash`)
    await dialog.getByTestId('trash-confirm').press('Enter')
    const response = await pending
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, data: { id: tree.id, name: tree.name, parentId: parent.id, trashedAt: expect.any(String) } })
    await expect(item).toHaveCount(0)
    await expect(page).toHaveURL(url => url.pathname + url.search === destination)
    await expect(page.locator('#drive-main')).toBeFocused()
    await expectNotFound(await viewer.get(`${api}/folders/${nested.id}/contents`))
    await expectNotFound(await reviewer.get(`${api}/files/${activeFile.id}/download`))

    const mixed = await listTrash(owner, true)
    expect(mixed).toEqual(expect.arrayContaining([tree, separateFolder, separateFile].map(({ id, kind }) => expect.objectContaining({ id, kind }))))
    expect(mixed.map(({ id }) => id)).not.toContain(nested.id)
    expect(mixed.map(({ id }) => id)).not.toContain(activeFile.id)
    const oldFormat = await listTrash(owner, false)
    expect(oldFormat.map(({ id }) => id)).toContain(separateFile.id)
    expect(oldFormat.every(item => item.kind === 'file')).toBe(true)
  })

  await test.step('Restore one tree with the next available name and preserve its content', async () => {
    await createFolder(owner, tree.name, parent.id)
    await createFolder(owner, `${tree.name} - khôi phục`, parent.id)
    const restoredName = `${tree.name} - khôi phục 2`
    const loaded = page.waitForResponse(response => new URL(response.url()).pathname === `${api}/trash`)
    await page.goto('/trash')
    expect(new URL((await loaded).url()).searchParams.get('includeFolders')).toBe('true')
    const item = row(page, 'trash-item', tree.id)
    await expect(item).toHaveAttribute('data-item-kind', 'folder')
    await expect(row(page, 'trash-item', activeFile.id)).toHaveCount(0)
    await verifyAccessibility(page, testInfo, 'trash-mixed-list')
    const order = await page.getByTestId('trash-item').evaluateAll(items => items.map(item => item.getAttribute('data-item-id')))
    const index = order.indexOf(tree.id)
    const neighbor = order[index + 1] ?? order[index - 1]
    const pending = postResponse(page, `/folders/${tree.id}/restore`)
    await item.getByTestId('trash-restore').press('Enter')
    const response = await pending
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, data: { id: tree.id, name: restoredName, parentId: parent.id, trashedAt: null } })
    await expect(item).toHaveCount(0)
    await expect(page.getByTestId('trash-restored-name')).toHaveText(restoredName)
    const link = page.getByTestId('trash-restore-destination')
    await expect(link).toHaveText(parent.name)
    await expect(link).toHaveAttribute('href', driveHref(parent.id))
    if (neighbor) await expect(row(page, 'trash-item', neighbor).getByTestId('trash-restore')).toBeFocused()
    await expect(row(page, 'trash-item', separateFolder.id)).toBeVisible()
    await expect(row(page, 'trash-item', separateFile.id)).toBeVisible()
    const restoredContents = await owner.get(`${api}/folders/${nested.id}/contents`)
    expect(restoredContents.status()).toBe(200)
    expect(await restoredContents.json()).toMatchObject({ data: { items: [expect.objectContaining({ id: activeFile.id, folderId: nested.id })] } })
    const download = await owner.get(`${api}/files/${activeFile.id}/download`)
    expect(download.status()).toBe(200)
    expect(await download.body()).toEqual(bytes)
    await expectNotFound(await viewer.get(`${api}/folders/${tree.id}/contents`))
    await expectNotFound(await reviewer.get(`${api}/files/${activeFile.id}/download`))
  })

  await test.step('Restore an independent file and keep its final extension', async () => {
    await uploadFile(owner, nested.id, separateFile.originalName, Buffer.from('Replacement'))
    await uploadFile(owner, nested.id, `${stem} - khôi phục.txt`, Buffer.from('First name is taken'))
    const restoredName = `${stem} - khôi phục 2.txt`
    const pending = postResponse(page, `/files/${separateFile.id}/restore`)
    await row(page, 'trash-item', separateFile.id).getByTestId('trash-restore').press('Enter')
    const response = await pending
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, data: { id: separateFile.id, originalName: restoredName, folderId: nested.id, trashedAt: null } })
    await expect(page.getByTestId('trash-restored-name')).toHaveText(restoredName)
    const destination = page.getByTestId('trash-restore-destination')
    await expect(destination).toHaveText(nested.name)
    await expect(destination).toHaveAttribute('href', driveHref(nested.id))
    await expect(row(page, 'trash-item', separateFolder.id)).toBeVisible()
  })
})

test('TRASH-02 restores a separate folder to My Drive while its former parent remains in Trash', async ({ page, ownerRequest: owner }) => {
  const suffix = randomUUID().slice(0, 8)
  const parent = await createFolder(owner, `Cha vào thùng rác ${suffix}`, projects)
  const child = await createFolder(owner, `Khôi phục riêng ${suffix}`, parent.id)
  expect((await owner.post(`${api}/folders/${child.id}/trash`)).status()).toBe(200)
  expect((await owner.post(`${api}/folders/${parent.id}/trash`)).status()).toBe(200)

  await page.goto('/trash')
  const pending = postResponse(page, `/folders/${child.id}/restore`)
  await row(page, 'trash-item', child.id).getByTestId('trash-restore').press('Enter')
  const response = await pending
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ success: true, data: { id: child.id, parentId: null, name: child.name, trashedAt: null } })
  await expect(page.getByTestId('trash-status')).toContainText(/về Drive của tôi|restored to My Drive/i)
  await expect(page.getByTestId('trash-restore-destination')).toHaveAttribute('href', '/drive')
  await expect(row(page, 'trash-item', parent.id)).toBeVisible()
})
