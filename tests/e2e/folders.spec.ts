import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, type APIRequestContext, type APIResponse, type Locator, type Page, type TestInfo } from '@playwright/test'
import type { components } from '../../src/lib/api-schema'
import { fixtureAccounts, ownerTest as test } from './fixtures'

const api = '/api/v1'
const archiveId = '10000000-0000-4000-8000-000000000104'
const viewerFolderId = '10000000-0000-4000-8000-000000000201'

type Folder = components['schemas']['FolderSummary']
type FolderResponse = components['schemas']['FolderResponse']
type FolderContents = components['schemas']['FolderContentsResponse']

function driveUrl(folderId: string, search?: string) {
  const params = new URLSearchParams({ folder: folderId })
  if (search) params.set('q', search)
  return `/drive?${params}`
}

function itemById(page: Page, id: string) {
  return page.getByTestId('drive-item').and(page.locator(`[data-item-id="${id}"]`))
}

function apiResponse(page: Page, method: string, path: string) {
  return page.waitForResponse(response =>
    response.request().method() === method && new URL(response.url()).pathname === `${api}${path}`,
  )
}

async function expectApiError(response: APIResponse, status: number, code: string) {
  expect(response.status()).toBe(status)
  expect(await response.json()).toMatchObject({ success: false, error: { code } })
}

async function folderContents(request: APIRequestContext, folderId: string, params?: { type?: 'folders'; page?: number; limit?: number; q?: string }) {
  const response = await request.get(`${api}/folders/${folderId}/contents`, { params })
  expect(response.status()).toBe(200)
  return await response.json() as FolderContents
}

async function openCreate(page: Page) {
  await page.getByTestId('drive-new').press('Enter')
  await page.getByTestId('folder-create-open').press('Enter')
  const dialog = page.getByRole('dialog').and(page.getByTestId('folder-create-dialog'))
  await expect(dialog).toHaveAccessibleName(/tạo thư mục|create folder/i)
  await expect(dialog.getByTestId('folder-name-input')).toBeFocused()
  return dialog
}

async function submitFolderName(page: Page, dialog: Locator, input: string, existingFolder?: Folder) {
  await dialog.getByTestId('folder-name-input').fill(input)
  const saved = existingFolder
    ? apiResponse(page, 'PATCH', `/folders/${existingFolder.id}`)
    : apiResponse(page, 'POST', '/folders')
  await dialog.getByTestId('folder-name-submit').press('Enter')
  const response = await saved
  expect(response.status()).toBe(existingFolder ? 200 : 201)
  const payload: FolderResponse = await response.json()
  expect(payload).toMatchObject({ success: true, data: { kind: 'folder', name: input.trim() } })
  if (existingFolder) expect(payload.data.id).toBe(existingFolder.id)
  await expect(dialog).toBeHidden()
  return payload.data
}

async function createFixtureFolder(owner: APIRequestContext, name: string, parentId: string) {
  const response = await owner.post(`${api}/folders`, { data: { name, parentId } })
  expect(response.status()).toBe(201)
  const payload: FolderResponse = await response.json()
  expect(payload.data).toMatchObject({ name, parentId })
  return payload.data
}

async function verifyAccessibility(page: Page, testInfo: TestInfo, name: string) {
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await testInfo.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
}

test('DRIVE-02 creates, renames, and moves a folder while preserving the shared file', async ({ page, browser, baseURL, ownerRequest: owner, viewerRequest: viewer }, testInfo) => {
  test.setTimeout(75_000)
  const suffix = randomUUID().slice(0, 8)
  const originalFolderName = `Mục ${suffix}`
  const updatedFolderName = `Thư mục đã đổi ${suffix}`
  const fileName = `Báo cáo ${suffix}.txt`
  const bytes = Buffer.from(`DRIVE-02 ${suffix}\nDữ liệu thử nghiệm\n`)

  const { source, target } = await test.step('Create source and destination folders and recover from a duplicate name', async () => {
    await page.goto(driveUrl(archiveId, suffix))
    await expect(page.getByTestId('drive-empty-search')).toBeVisible()
    const createSource = await openCreate(page)
    await verifyAccessibility(page, testInfo, 'create-folder')
    const source = await submitFolderName(page, createSource, `  Nguồn ${suffix}  `)
    expect(source.parentId).toBe(archiveId)
    const createTarget = await openCreate(page)
    await createTarget.getByTestId('folder-name-input').fill(source.name)
    const duplicate = apiResponse(page, 'POST', '/folders')
    await createTarget.getByTestId('folder-name-submit').press('Enter')
    const response = await duplicate
    expect(response.status()).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: 'FOLDER_NAME_CONFLICT' } })
    await expect(createTarget.getByTestId('folder-name-error')).toContainText(/cùng tên|already exists/i)
    await expect(createTarget.getByTestId('folder-name-input')).toHaveValue(source.name)
    const target = await submitFolderName(page, createTarget, `Đích ${suffix}`)
    expect(target.parentId).toBe(archiveId)
    return { source, target }
  })

  const child = await test.step('Create and upload into a nested folder', async () => {
    await itemById(page, source.id).getByRole('link', { name: source.name }).press('Enter')
    await expect(page).toHaveURL(url => url.searchParams.get('folder') === source.id)
    await expect(page.getByTestId('drive-empty-folder')).toBeVisible()
    const child = await submitFolderName(page, await openCreate(page), originalFolderName)
    expect(child.parentId).toBe(source.id)
    await expect(itemById(page, child.id).getByRole('link')).toHaveAttribute('href', driveUrl(child.id))
    return child
  })
  const oldFolderUrl = driveUrl(child.id)
  const fileId = await test.step('Store synthetic bytes in the folder before moving it', async () => {
    await page.goto(oldFolderUrl)
    await expect(page.getByTestId('drive-empty-folder')).toBeVisible()
    await page.getByTestId('drive-new').click()
    await page.getByTestId('upload-open').click()
    const dialog = page.getByTestId('upload-dialog')
    await dialog.getByTestId('upload-input').setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: bytes })
    const uploaded = apiResponse(page, 'POST', '/files')
    await dialog.getByTestId('upload-submit').click()
    const response = await uploaded
    expect(response.status()).toBe(201)
    const payload: components['schemas']['FileResponse'] = await response.json()
    expect(payload.data).toMatchObject({ folderId: child.id, originalName: fileName, size: bytes.length })
    await expect(dialog.getByTestId('upload-item')).toHaveAttribute('data-status', 'complete')
    await dialog.getByTestId('upload-close').click()
    return payload.data.id
  })

  const filePath = `/files/${fileId}`
  const shared = await owner.put(`${api}${filePath}/shares`, { data: { email: fixtureAccounts.viewer } })
  expect(shared.status()).toBe(200)
  const grant: components['schemas']['FileShareResponse'] = await shared.json()
  expect((await viewer.get(`${api}${filePath}`)).status()).toBe(200)
  try {
    const neighbor = await test.step('Verify folder filtering, naming, authorization and cycle failures with known fixtures', async () => {
      const sameNameInTarget = await createFixtureFolder(owner, child.name, target.id)
      expect(sameNameInTarget.id).not.toBe(child.id)
      const neighbor = await createFixtureFolder(owner, `mục ${suffix}`, source.id)
      await expectApiError(await owner.patch(`${api}/folders/${child.id}`, { data: { name: neighbor.name } }), 409, 'FOLDER_NAME_CONFLICT')
      await expectApiError(await owner.patch(`${api}/folders/${child.id}`, { data: { parentId: target.id } }), 409, 'FOLDER_NAME_CONFLICT')
      await expectApiError(await owner.patch(`${api}/folders/${child.id}`, { data: { parentId: child.id } }), 409, 'INVALID_FOLDER_MOVE')
      await expectApiError(await owner.patch(`${api}/folders/${source.id}`, { data: { parentId: child.id } }), 409, 'INVALID_FOLDER_MOVE')
      await expectApiError(await owner.patch(`${api}/folders/${child.id}`, { data: { parentId: viewerFolderId } }), 404, 'NOT_FOUND')
      await expectApiError(await viewer.patch(`${api}/folders/${child.id}`, { data: { name: updatedFolderName } }), 404, 'NOT_FOUND')
      await expectApiError(await viewer.get(`${api}/folders/${child.id}/contents`), 404, 'NOT_FOUND')

      const allChildren = await folderContents(owner, child.id)
      expect(allChildren.data.folder).toMatchObject({ id: child.id, name: child.name, parentId: source.id })
      expect(allChildren.data.items).toEqual([expect.objectContaining({ id: fileId, kind: 'file' })])
      const foldersOnly = await folderContents(owner, child.id, { type: 'folders', limit: 1 })
      expect(foldersOnly.data.items).toEqual([])
      expect(foldersOnly.pagination).toMatchObject({ total: 0, totalPages: 0, limit: 1 })
      const first = await folderContents(owner, source.id, { type: 'folders', page: 1, limit: 1 })
      const second = await folderContents(owner, source.id, { type: 'folders', page: 2, limit: 1 })
      expect(first.pagination).toMatchObject({ page: 1, total: 2, totalPages: 2, limit: 1 })
      expect(second.pagination).toMatchObject({ page: 2, total: 2, totalPages: 2, limit: 1 })
      expect([...first.data.items, ...second.data.items].map(item => item.id).sort()).toEqual([child.id, neighbor.id].sort())
      return neighbor
    })

    const sourceUrl = driveUrl(source.id, suffix)
    await test.step('Rename the nested folder and retain focus', async () => {
      await page.goto(sourceUrl)
      const opener = itemById(page, child.id).getByTestId('folder-rename')
      await opener.press('Enter')
      const dialog = page.getByRole('dialog').and(page.getByTestId('folder-rename-dialog'))
      await expect(dialog).toHaveAccessibleName(/đổi tên thư mục|rename folder/i)
      await expect(dialog.getByTestId('folder-name-input')).toHaveValue(child.name)
      await expect(dialog.getByTestId('folder-name-input')).toBeFocused()
      await verifyAccessibility(page, testInfo, 'rename-folder')
      const renamed = await submitFolderName(page, dialog, updatedFolderName, child)
      expect(renamed.parentId).toBe(source.id)
      await expect(itemById(page, child.id).getByRole('link', { name: updatedFolderName })).toBeVisible()
      await expect(opener).toBeFocused()
    })

    await test.step('Move the nested folder with the keyboard and retain the source view', async () => {
      const opener = itemById(page, child.id).getByTestId('folder-move')
      await opener.press('Enter')
      const dialog = page.getByRole('dialog').and(page.getByTestId('folder-move-dialog'))
      await expect(dialog).toHaveAccessibleName(/di chuyển thư mục|move folder/i)
      const current = dialog.getByTestId('move-picker-current')
      await expect(current).toHaveAttribute('data-folder-id', 'root')
      await expect(current).toBeFocused()
      await page.keyboard.press('Tab')
      await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(opener).toBeFocused()
      await opener.press('Enter')

      const pickerFolder = (id: string) => dialog.getByTestId('move-picker-folder').and(dialog.locator(`[data-folder-id="${id}"]`))
      const loadArchive = apiResponse(page, 'GET', `/folders/${archiveId}/contents`)
      await pickerFolder(archiveId).press('Enter')
      const archive = await loadArchive
      expect(archive.status()).toBe(200)
      expect(new URL(archive.url()).searchParams.get('type')).toBe('folders')
      await expect(current).toHaveAttribute('data-folder-id', archiveId)
      await expect(pickerFolder(source.id)).toBeVisible()
      await expect(dialog.getByText('Scope sample - Archive.txt', { exact: true })).toHaveCount(0)
      await verifyAccessibility(page, testInfo, 'move-folder')

      await pickerFolder(source.id).press('Enter')
      await expect(current).toHaveAttribute('data-folder-id', source.id)
      await expect(pickerFolder(neighbor.id)).toBeVisible()
      await expect(pickerFolder(child.id)).toHaveCount(0)
      await expect(dialog.getByTestId('folder-move-submit')).toBeDisabled()
      const archiveCrumb = dialog.getByTestId('move-picker-ancestor').and(dialog.locator(`[data-folder-id="${archiveId}"]`))
      await archiveCrumb.press('Enter')
      await pickerFolder(target.id).press('Enter')
      await expect(current).toHaveAttribute('data-folder-id', target.id)
      const moved = apiResponse(page, 'PATCH', `/folders/${child.id}`)
      await dialog.getByTestId('folder-move-submit').press('Enter')
      const response = await moved
      expect(response.status()).toBe(200)
      expect(await response.json()).toMatchObject({ success: true, data: { id: child.id, parentId: target.id, name: updatedFolderName } })
      await expect(dialog).toBeHidden()
      await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === sourceUrl)
      await expect(itemById(page, child.id)).toHaveCount(0)
      await expect(itemById(page, neighbor.id).getByTestId('folder-move')).toBeFocused()
      await expect(page.getByTestId('drive-status')).toContainText(/đã di chuyển|folder moved/i)
      const openTarget = page.getByTestId('folder-move-destination')
      await expect(openTarget).toHaveAttribute('href', driveUrl(target.id))
      await openTarget.press('Enter')
      await expect(page).toHaveURL(url => url.searchParams.get('folder') === target.id)
      await expect(itemById(page, child.id).getByRole('link', { name: updatedFolderName })).toBeVisible()
    })

    await test.step('Open the old folder and file links and verify the shared download', async () => {
      const sourceAfter = await folderContents(owner, source.id, { q: suffix })
      expect(sourceAfter.data.items.map(item => item.id)).toEqual([neighbor.id])
      const targetAfter = await folderContents(owner, target.id, { q: suffix })
      expect(targetAfter.data.items).toContainEqual(expect.objectContaining({ id: child.id, name: updatedFolderName, parentId: target.id }))
      await page.goto(oldFolderUrl)
      const breadcrumb = page.getByRole('navigation', { name: /đường dẫn thư mục|folder path/i })
      await expect(breadcrumb.getByText(target.name, { exact: true })).toBeVisible()
      await expect(breadcrumb.getByText(updatedFolderName, { exact: true })).toBeVisible()
      await expect(breadcrumb.getByText(source.name, { exact: true })).toHaveCount(0)
      await expect(itemById(page, fileId).getByText(fileName, { exact: true })).toBeVisible()
      const file = await viewer.get(`${api}${filePath}`)
      expect(file.status()).toBe(200)
      expect(await file.json()).toMatchObject({ data: { id: fileId, folderId: child.id, originalName: fileName } })
      await expectApiError(await viewer.get(`${api}/folders/${child.id}/contents`), 404, 'NOT_FOUND')

      const { viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent } = testInfo.project.use
      const viewerContext = await browser.newContext({
        baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent,
        storageState: await viewer.storageState(), acceptDownloads: true,
      })
      try {
        const viewerPage = await viewerContext.newPage()
        await viewerPage.goto(filePath)
        const detail = viewerPage.getByTestId('file-detail')
        await expect(detail.getByRole('heading', { name: fileName, exact: true })).toBeVisible()
        const downloaded = viewerPage.waitForEvent('download')
        await detail.getByTestId('file-detail-download').click()
        const download = await downloaded
        expect(download.suggestedFilename()).toBe(fileName)
        expect(await readFile(await download.path())).toEqual(bytes)
      } finally {
        await viewerContext.close()
      }
    })
  } finally {
    await owner.delete(`${api}${filePath}/shares/${grant.data.recipientId}`)
  }
})
