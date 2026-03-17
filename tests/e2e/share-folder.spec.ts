import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, type APIRequestContext, type APIResponse, type Locator, type Page, type TestInfo } from '@playwright/test'
import type { components } from '../../src/lib/api-schema'
import { fixtureAccounts, fixturePassword, ownerTest as test } from './fixtures'

const api = '/api/v1'
const archiveId = '10000000-0000-4000-8000-000000000104'
const vietnamOffsetMs = 7 * 60 * 60 * 1000

function expiryAfterVietnamMonth(issuedAt: string) {
  const vietnamTime = new Date(Date.parse(issuedAt) + vietnamOffsetMs)
  const nextMonth = vietnamTime.getUTCMonth() + 1
  const finalDay = new Date(Date.UTC(vietnamTime.getUTCFullYear(), nextMonth + 1, 0)).getUTCDate()
  vietnamTime.setUTCMonth(nextMonth, Math.min(vietnamTime.getUTCDate(), finalDay))
  return new Date(vietnamTime.getTime() - vietnamOffsetMs).toISOString()
}

function folderUrl(id: string) {
  return `/drive?folder=${id}`
}

function apiResponse(page: Page, method: string, path: string) {
  return page.waitForResponse(response =>
    response.request().method() === method && new URL(response.url()).pathname === `${api}${path}`,
  )
}

function itemById(page: Page, testId: 'drive-item' | 'shared-folder' | 'trash-item', id: string) {
  return page.getByTestId(testId).and(page.locator(`[data-item-id="${id}"]`))
}

async function createFolder(owner: APIRequestContext, name: string, parentId: string) {
  const response = await owner.post(`${api}/folders`, { data: { name, parentId } })
  expect(response.status()).toBe(201)
  const payload: components['schemas']['FolderResponse'] = await response.json()
  expect(payload.data).toMatchObject({ name, parentId })
  return payload.data
}

async function uploadFixture(owner: APIRequestContext, folderId: string, name: string, buffer: Buffer) {
  const response = await owner.post(`${api}/files`, { multipart: { folderId, file: { name, mimeType: 'text/plain', buffer } } })
  expect(response.status()).toBe(201)
  const payload: components['schemas']['FileResponse'] = await response.json()
  expect(payload.data).toMatchObject({ folderId, originalName: name, size: buffer.length })
  return payload.data
}

async function openFolderShare(page: Page, folder: Locator) {
  await folder.getByTestId('folder-share').press('Enter')
  const dialog = page.getByRole('dialog').and(page.getByTestId('share-dialog'))
  await expect(dialog).toHaveAccessibleName(/chia sẻ thư mục|share folder/i)
  await expect(dialog.getByTestId('share-email')).toBeFocused()
  return dialog
}

async function expectPrivateDenial(response: APIResponse) {
  expect(response.status()).toBe(404)
  expect(response.headers()['cache-control']).toBe('private, no-store')
  expect(await response.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } })
}

async function expectFileDenied(request: APIRequestContext, fileId: string) {
  await expectPrivateDenial(await request.get(`${api}/files/${fileId}`))
  await expectPrivateDenial(await request.get(`${api}/files/${fileId}/download`))
}

async function verifyAccessibility(page: Page, testInfo: TestInfo, name: string) {
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await testInfo.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
}

test('SHARE-02 inherits folder access, restores privately, and respects the folder boundary', async ({ page, browser, baseURL, ownerRequest: owner, viewerRequest: viewer, reviewerRequest: reviewer }, testInfo) => {
  test.setTimeout(90_000)
  const suffix = randomUUID().slice(0, 8)
  const parent = await createFolder(owner, `Nội bộ ${suffix}`, archiveId)
  const shared = await createFolder(owner, `Thư mục chia sẻ ${suffix}`, parent.id)
  const nested = await createFolder(owner, `Thư mục con ${suffix}`, shared.id)
  const sibling = await createFolder(owner, `Thư mục riêng ${suffix}`, parent.id)
  const siblingFile = await uploadFixture(owner, sibling.id, `Riêng tư ${suffix}.txt`, Buffer.from(`Private fixture ${suffix}\n`))
  const bytes = Buffer.from(`SHARE-02 ${suffix}\nNội dung thử nghiệm\n`)
  const fileName = `Biên bản chia sẻ ${suffix}.txt`
  const sharePath = `/folders/${shared.id}/shares`
  const parentUrl = folderUrl(parent.id)
  const { viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent } = testInfo.project.use
  const viewerContext = await browser.newContext({
    baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent,
    acceptDownloads: true, storageState: { cookies: [], origins: [] },
  })

  let grant: components['schemas']['ShareGrant'] | undefined
  try {
    const link = await test.step('Grant one month of access from the owner’s folder dialog', async () => {
      await page.goto(parentUrl)
      const row = itemById(page, 'drive-item', shared.id)
      const dialog = await openFolderShare(page, row)
      await expect(dialog.getByTestId('share-empty')).toBeVisible()
      await dialog.getByTestId('share-email').fill(fixtureAccounts.viewer)
      await expect(dialog.getByTestId('share-expiry')).toHaveValue('')
      const granted = apiResponse(page, 'PUT', sharePath)
      await dialog.getByTestId('share-submit').press('Enter')
      const response = await granted
      expect(response.status()).toBe(200)
      const payload: { success: boolean; data: components['schemas']['ShareGrant'] } = await response.json()
      grant = payload.data
      expect(payload).toMatchObject({ success: true, data: { recipientEmail: fixtureAccounts.viewer, isActive: true } })
      expect(payload.data.expiresAt).toBe(expiryAfterVietnamMonth(payload.data.grantedAt))
      await expect(dialog.getByTestId('share-recipient')).toContainText(fixtureAccounts.viewer)
      await expect(dialog.getByTestId('share-status')).toContainText(/đã lưu quyền|access saved/i)
      await expect(dialog.getByTestId('share-link')).toHaveValue(new URL(folderUrl(shared.id), baseURL).href)
      const link = await dialog.getByTestId('share-link').inputValue()
      await verifyAccessibility(page, testInfo, 'folder-share-dialog')
      await dialog.getByTestId('share-close').press('Enter')
      await expect(dialog).toBeHidden()
      await expect(row.getByTestId('folder-share')).toBeFocused()
      return link
    })

    const file = await uploadFixture(owner, nested.id, fileName, bytes)
    const filePath = `/files/${file.id}`
    const viewerPage = await viewerContext.newPage()
    await test.step('Sign in from the folder link, use the Folders tab and download as a viewer', async () => {
      await viewerPage.goto(link)
      await expect(viewerPage).toHaveURL(url => url.pathname === '/login' && url.searchParams.get('redirect') === folderUrl(shared.id))
      await viewerPage.getByTestId('login-email').fill(fixtureAccounts.viewer)
      await viewerPage.getByTestId('login-password').fill(fixturePassword)
      const login = apiResponse(viewerPage, 'POST', '/auth/login')
      await viewerPage.getByTestId('login-submit').click()
      expect((await login).status()).toBe(200)
      await expect(viewerPage).toHaveURL(url => `${url.pathname}${url.search}` === folderUrl(shared.id))
      await expect(viewerPage.getByTestId('drive-read-only')).toBeVisible()

      await viewerPage.goto('/shared-with-me')
      await viewerPage.getByTestId('shared-tab-folders').press('Enter')
      await expect(viewerPage).toHaveURL(url => url.pathname === '/shared-with-me' && url.searchParams.get('tab') === 'folders')
      const folders = await viewer.get(`${api}/shared-folders`)
      expect(folders.status()).toBe(200)
      const list: components['schemas']['SharedFoldersResponse'] = await folders.json()
      const grantItem = list.data.items.find(item => item.id === shared.id)
      expect(grantItem).toMatchObject({ id: shared.id, name: shared.name })
      expect(grantItem).not.toHaveProperty('parentId')
      const sharedLink = itemById(viewerPage, 'shared-folder', shared.id).getByTestId('shared-folder-link')
      await expect(sharedLink).toHaveAttribute('href', folderUrl(shared.id))
      await expect(sharedLink).toHaveAccessibleName(shared.name)
      await verifyAccessibility(viewerPage, testInfo, 'shared-folders-tab')
      await sharedLink.press('Enter')
      const childRow = itemById(viewerPage, 'drive-item', nested.id)
      const childLink = childRow.getByRole('link', { name: nested.name, exact: true })
      await expect(childLink).toBeVisible()
      for (const action of ['folder-rename', 'folder-move', 'folder-share']) {
        await expect(childRow.getByTestId(action)).toHaveCount(0)
      }
      await childLink.press('Enter')
      await expect(viewerPage).toHaveURL(url => `${url.pathname}${url.search}` === folderUrl(nested.id))

      const breadcrumbs = viewerPage.getByRole('navigation', { name: /đường dẫn thư mục|folder path/i })
      await expect(breadcrumbs.getByText(shared.name, { exact: true })).toBeVisible()
      await expect(breadcrumbs.getByText(nested.name, { exact: true })).toBeVisible()
      await expect(breadcrumbs.getByText(parent.name, { exact: true })).toHaveCount(0)
      await expect(breadcrumbs.getByText('Archive', { exact: true })).toHaveCount(0)
      const row = itemById(viewerPage, 'drive-item', file.id)
      await expect(row.getByTestId('drive-file-link')).toHaveAttribute('href', filePath)
      for (const action of ['drive-new', 'file-rename', 'file-move', 'file-share', 'file-trash', 'folder-share']) {
        await expect(viewerPage.getByTestId(action)).toHaveCount(0)
      }
      await verifyAccessibility(viewerPage, testInfo, 'shared-folder-read-only')
      const downloaded = viewerPage.waitForEvent('download')
      await row.getByTestId('file-download').click()
      const download = await downloaded
      expect(download.suggestedFilename()).toBe(fileName)
      expect(await readFile(await download.path())).toEqual(bytes)
    })

    await test.step('Verify the known boundary excludes the private ancestor, sibling and third account', async () => {
      const root = await viewer.get(`${api}/folders/${shared.id}/contents`)
      expect(root.status()).toBe(200)
      expect(await root.json()).toMatchObject({ data: {
        access: 'viewer', folder: { id: shared.id, parentId: null }, breadcrumbs: [{ id: shared.id, name: shared.name }],
      } })
      const child = await viewer.get(`${api}/folders/${nested.id}/contents`)
      expect(child.status()).toBe(200)
      expect(await child.json()).toMatchObject({ data: {
        access: 'viewer', folder: { id: nested.id, parentId: shared.id },
        breadcrumbs: [{ id: shared.id, name: shared.name }, { id: nested.id, name: nested.name }],
      } })
      await expectPrivateDenial(await viewer.get(`${api}/folders/${parent.id}/contents`))
      await expectPrivateDenial(await viewer.get(`${api}/folders/${sibling.id}/contents`))
      await expectFileDenied(viewer, siblingFile.id)
      await expectPrivateDenial(await reviewer.get(`${api}/folders/${shared.id}/contents`))
      const directlyShared = await viewer.get(`${api}/shared-with-me`)
      expect(directlyShared.status()).toBe(200)
      expect((await directlyShared.json()).data.items).not.toContainEqual(expect.objectContaining({ id: file.id }))
    })

    await test.step('Restore the file privately, then move it back into the shared tree', async () => {
      await page.goto(folderUrl(nested.id))
      await itemById(page, 'drive-item', file.id).getByTestId('file-trash').press('Enter')
      const trashed = apiResponse(page, 'POST', `${filePath}/trash`)
      await page.getByTestId('trash-dialog').getByTestId('trash-confirm').press('Enter')
      expect((await trashed).status()).toBe(200)
      await expectFileDenied(viewer, file.id)
      await page.goto('/trash')
      const restored = apiResponse(page, 'POST', `${filePath}/restore`)
      await itemById(page, 'trash-item', file.id).getByTestId('trash-restore').press('Enter')
      const response = await restored
      expect(response.status()).toBe(200)
      expect(await response.json()).toMatchObject({ success: true, data: { id: file.id, trashedAt: null, folderId: null } })
      await expect(page.getByTestId('trash-status')).toContainText(/giữ riêng tư|keep.*private/i)
      await expectFileDenied(viewer, file.id)

      await page.goto(`/drive?q=${suffix}`)
      const row = itemById(page, 'drive-item', file.id)
      await row.getByTestId('file-move').press('Enter')
      const picker = page.getByRole('dialog').and(page.getByTestId('file-move-dialog'))
      const current = picker.getByTestId('move-picker-current')
      await expect(current).toHaveAttribute('data-folder-id', 'root')
      await expect(current).toBeFocused()
      for (const id of [archiveId, parent.id, shared.id, nested.id]) {
        const folder = picker.getByTestId('move-picker-folder').and(picker.locator(`[data-folder-id="${id}"]`))
        await folder.press('Enter')
        await expect(current).toHaveAttribute('data-folder-id', id)
      }
      const confirmMove = picker.getByTestId('file-move-submit')
      await expect(current).toBeFocused()
      await expect(confirmMove).toBeEnabled()
      const moved = apiResponse(page, 'PATCH', filePath)
      await confirmMove.press('Enter')
      const updated = await moved
      expect(updated.status()).toBe(200)
      expect(await updated.json()).toMatchObject({ success: true, data: { id: file.id, folderId: nested.id, originalName: fileName } })
      await expect(picker).toBeHidden()
      await expect(page.getByTestId('folder-move-destination')).toHaveAttribute('href', folderUrl(nested.id))
      await viewerPage.reload()
      await expect(itemById(viewerPage, 'drive-item', file.id).getByTestId('drive-file-link')).toHaveAttribute('href', filePath)
      const download = await viewer.get(`${api}${filePath}/download`)
      expect(download.status()).toBe(200)
      expect(await download.body()).toEqual(bytes)
      await expectFileDenied(viewer, siblingFile.id)
    })

    await test.step('Revoke folder access with the keyboard and verify the existing link loses access', async () => {
      await page.goto(parentUrl)
      const dialog = await openFolderShare(page, itemById(page, 'drive-item', shared.id))
      await dialog.getByTestId('share-recipient').getByTestId('share-revoke').press('Enter')
      await expect(dialog.getByTestId('share-revoke-cancel')).toBeFocused()
      const revoked = apiResponse(page, 'DELETE', `${sharePath}/${grant!.recipientId}`)
      await dialog.getByTestId('share-revoke-confirm').press('Enter')
      expect((await revoked).status()).toBe(200)
      grant = undefined
      await expect(dialog.getByTestId('share-empty')).toBeVisible()
      await expect(dialog.getByTestId('share-email')).toBeFocused()
      await expectPrivateDenial(await viewer.get(`${api}/folders/${nested.id}/contents`))
      await expectFileDenied(viewer, file.id)
      const list = await viewer.get(`${api}/shared-folders`)
      expect(list.status()).toBe(200)
      expect((await list.json()).data.items).not.toContainEqual(expect.objectContaining({ id: shared.id }))
    })
  } finally {
    await viewerContext.close()
    if (grant) await owner.delete(`${api}${sharePath}/${grant.recipientId}`)
  }
})
