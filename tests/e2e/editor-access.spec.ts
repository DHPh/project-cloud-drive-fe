import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import type { components } from '../../src/lib/api-schema'
import { fixtureAccounts, ownerTest as test } from './fixtures'

const api = '/api/v1'
const projects = '10000000-0000-4000-8000-000000000102'

function requestResponse(page: Page, method: string, path: string) {
  return page.waitForResponse(response => response.request().method() === method && new URL(response.url()).pathname === `${api}${path}`)
}

async function chargedBytes(account: APIRequestContext) {
  const result = await account.get(`${api}/account`)
  expect(result.status()).toBe(200)
  return (await result.json() as components['schemas']['AccountProfileResponse']).data.storage.usedBytes
}

test('ACCESS-01 applies editor controls, charges the owner, and falls back to remaining view access after revoke', async ({ page, browser, baseURL, ownerRequest: owner, viewerRequest: editor, reviewerRequest: viewer }, testInfo) => {
  test.setTimeout(115_000)
  const suffix = randomUUID().slice(0, 8)
  const response = await owner.post(`${api}/folders`, { data: { name: `Thư mục chỉnh sửa ${suffix}`, parentId: projects } })
  expect(response.status()).toBe(201)
  const folder = (await response.json() as components['schemas']['FolderResponse']).data
  const folderUrl = `/drive?folder=${folder.id}`
  const folderPath = `/folders/${folder.id}`
  const uploaded = await owner.post(`${api}/files`, { multipart: { folderId: folder.id, file: { name: `Cần sửa ${suffix}.txt`, mimeType: 'text/plain', buffer: Buffer.from('Nội dung tổng hợp') } } })
  expect(uploaded.status()).toBe(201)
  const file = (await uploaded.json() as components['schemas']['FileResponse']).data
  const filePath = `/files/${file.id}`
  expect((await owner.put(`${api}${filePath}/shares`, { data: { email: fixtureAccounts.viewer } })).status()).toBe(200)
  expect((await owner.put(`${api}${folderPath}/shares`, { data: { email: fixtureAccounts.reviewer } })).status()).toBe(200)

  await page.goto(`/drive?folder=${projects}&q=${suffix}`)
  const folderRow = page.getByTestId('drive-item').and(page.locator(`[data-item-id="${folder.id}"]`))
  await folderRow.getByTestId('folder-share').press('Enter')
  const share = page.getByTestId('share-dialog')
  await expect(share.getByTestId('share-email')).toBeFocused()
  await share.getByTestId('share-email').fill(fixtureAccounts.viewer)
  await share.getByTestId('share-access').selectOption('editor')
  const grantPending = requestResponse(page, 'PUT', `${folderPath}/shares`)
  await share.getByTestId('share-submit').press('Enter')
  const granted = await grantPending
  expect(granted.status()).toBe(200)
  const grant = (await granted.json() as components['schemas']['FileShareResponse']).data
  expect(grant.access).toBe('editor')
  const recipient = share.getByTestId('share-recipient').and(share.locator(`[data-recipient-id="${grant.recipientId}"]`))
  await expect(recipient.getByTestId('share-recipient-access')).toHaveText(/chỉnh sửa|edit/i)
  await share.getByTestId('share-close').press('Enter')
  await expect(folderRow.getByTestId('folder-share')).toBeFocused()

  await page.goto('/shared-by-me?type=folders')
  const outgoing = page.getByTestId('outgoing-row').and(page.locator(`[data-resource-id="${folder.id}"][data-recipient-id="${grant.recipientId}"]`))
  await outgoing.getByTestId('outgoing-renew').press('Enter')
  await expect(share.getByTestId('share-access')).toHaveValue('editor')
  const renewed = requestResponse(page, 'PUT', `${folderPath}/shares`)
  await share.getByTestId('share-submit').press('Enter')
  const renewal = await renewed
  expect(renewal.status()).toBe(200)
  expect(renewal.request().postDataJSON()).not.toHaveProperty('access')
  expect(await renewal.json()).toMatchObject({ data: { access: 'editor' } })
  await expect(share).toBeHidden()

  const { viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent } = testInfo.project.use
  const device = { baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent }
  const readerContext = await browser.newContext({ ...device, storageState: await editor.storageState() })
  const viewerContext = await browser.newContext({ ...device, storageState: await viewer.storageState() })
  try {
    const editPage = await readerContext.newPage()
    await editPage.goto(folderUrl)
    await expect(editPage.getByTestId('drive-editor')).toBeVisible()
    for (const control of ['drive-new', 'folder-create-open', 'file-trash', 'file-move', 'file-share', 'folder-share']) {
      await expect(editPage.getByTestId(control)).toHaveCount(0)
    }
    const descriptionOpener = editPage.getByTestId('folder-description-edit')
    await descriptionOpener.press('Enter')
    const description = editPage.getByTestId('folder-description-dialog')
    const descriptionInput = description.getByTestId('folder-description-input')
    await expect(descriptionInput).toBeFocused()
    await expect(description.getByTestId('folder-name-input')).toHaveCount(0)
    await descriptionInput.fill('Mô tả do người chỉnh sửa cập nhật')
    const descriptionPending = requestResponse(editPage, 'PATCH', folderPath)
    await description.getByTestId('folder-name-submit').press('Enter')
    const saved = await descriptionPending
    expect(saved.status()).toBe(200)
    expect(saved.request().postDataJSON()).toEqual({ description: 'Mô tả do người chỉnh sửa cập nhật' })
    await expect(description).toBeHidden()
    await expect(descriptionOpener).toBeFocused()
    await expect(editPage.getByTestId('drive-folder-description')).toContainText('Mô tả do người chỉnh sửa cập nhật')

    const ownerBefore = await chargedBytes(owner)
    const editorBefore = await chargedBytes(editor)
    const uploadBytes = Buffer.from(`Tệp của người chỉnh sửa ${suffix}\n`)
    await editPage.getByTestId('upload-open').press('Enter')
    const upload = editPage.getByTestId('upload-dialog')
    await expect(upload).toHaveAccessibleDescription(/dung lượng|quota/i)
    await upload.getByTestId('upload-input').setInputFiles({ name: `Tải lên chung ${suffix}.txt`, mimeType: 'text/plain', buffer: uploadBytes })
    const uploadPending = requestResponse(editPage, 'POST', '/files')
    await upload.getByTestId('upload-submit').press('Enter')
    expect((await uploadPending).status()).toBe(201)
    await expect(upload.getByTestId('upload-item')).toHaveAttribute('data-status', 'complete')
    await upload.getByTestId('upload-close').press('Enter')
    expect(await chargedBytes(owner)).toBe(ownerBefore + uploadBytes.length)
    expect(await chargedBytes(editor)).toBe(editorBefore)

    const editorScan = await new AxeBuilder({ page: editPage }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(editorScan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
    expect(await editPage.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    const reader = await viewerContext.newPage()
    await reader.goto(folderUrl)
    await expect(reader.getByTestId('drive-read-only')).toBeVisible()
    await expect(reader.getByTestId('folder-description-edit')).toHaveCount(0)
    await expect(reader.getByTestId('upload-open')).toHaveCount(0)

    await editPage.goto(filePath)
    await expect(editPage.getByTestId('file-editor-access')).toBeVisible()
    await expect(editPage.getByTestId('file-detail-back')).toHaveAttribute('href', '/shared-with-me')
    await editPage.getByTestId('file-detail-rename').press('Enter')
    const rename = editPage.getByTestId('rename-dialog')
    await expect(rename.getByTestId('rename-input')).toBeFocused()
    await rename.getByTestId('rename-input').fill(`Đã sửa tên ${suffix}.txt`)
    await rename.getByTestId('rename-save').press('Enter')
    await expect(rename).toBeHidden()
    await expect(editPage.getByTestId('file-detail')).toContainText(`Đã sửa tên ${suffix}.txt`)
    await editPage.getByTestId('file-metadata-open').press('Enter')
    const metadata = editPage.getByTestId('file-metadata-dialog')
    await metadata.getByTestId('file-metadata-description').fill('Đã chỉnh metadata')
    await metadata.getByTestId('file-metadata-save').press('Enter')
    await expect(metadata).toBeHidden()
    await expect(editPage.getByTestId('file-detail-description')).toHaveText('Đã chỉnh metadata')
    expect((await editor.patch(`${api}${filePath}`, { data: { folderId: null } })).status()).toBe(404)
    expect((await editor.patch(`${api}${folderPath}`, { data: { name: 'Không phải chủ' } })).status()).toBe(404)

    expect((await owner.delete(`${api}${folderPath}/shares/${grant.recipientId}`)).status()).toBe(200)
    await editPage.reload()
    await expect(editPage.getByTestId('file-detail')).toBeVisible()
    await expect(editPage.getByTestId('file-detail-rename')).toHaveCount(0)
    await expect(editPage.getByTestId('file-metadata-open')).toHaveCount(0)
    expect((await editor.patch(`${api}${filePath}`, { data: { description: 'Không được sửa nữa' } })).status()).toBe(404)
    expect((await editor.get(`${api}${folderPath}/contents`)).status()).toBe(404)
  } finally {
    await Promise.all([readerContext.close(), viewerContext.close()])
  }
})
