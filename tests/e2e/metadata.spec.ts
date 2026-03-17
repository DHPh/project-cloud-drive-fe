import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, type TestInfo } from '@playwright/test'
import type { components } from '../../src/lib/api-schema'
import { fixtureAccounts, ownerTest as test } from './fixtures'

const api = '/api/v1'
const projects = '10000000-0000-4000-8000-000000000102'

function driveRow(page: Page, id: string) {
  return page.getByTestId('drive-item').and(page.locator(`[data-item-id="${id}"]`))
}

function waitForWrite(page: Page, method: 'POST' | 'PATCH', path: string) {
  return page.waitForResponse(response => response.request().method() === method && new URL(response.url()).pathname === `${api}${path}`)
}

async function auditAccessibility(page: Page, testInfo: TestInfo, name: string) {
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await testInfo.attach(name, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
}

test('DRIVE-03 edits folder and file metadata while preserving read-only sharing', async ({ page, browser, baseURL, ownerRequest: owner, viewerRequest: viewer }, testInfo) => {
  test.setTimeout(120_000)
  const suffix = randomUUID().slice(0, 8)
  const parentPath = `/drive?folder=${projects}&q=${suffix}`
  const initialFolderName = `Thư mục thông tin ${suffix}`
  const folderName = `Thư mục đã đổi tên ${suffix}`
  const folderDescription = 'Thông tin cho nhóm đọc\nDòng thứ hai có dấu'
  const fileDescription = 'Ghi chú tiếng Việt\nGiữ <ký hiệu> nguyên văn'
  const originalTags = ['Kế hoạch, quý IV', 'Nhóm', 'nhóm', '  thẻ cũ  ']
  const tagPrefix = 'Hồ sơ, bản cuối '
  const extraTag = tagPrefix + '🙂'.repeat(64 - [...tagPrefix].length)

  const folder = await test.step('Create a folder with a description and preserve a concurrent name on edit', async () => {
    await page.goto(parentPath)
    await page.getByTestId('drive-new').press('Enter')
    await page.getByTestId('folder-create-open').press('Enter')
    const create = page.getByTestId('folder-create-dialog')
    await expect(create.getByTestId('folder-name-input')).toBeFocused()
    await create.getByTestId('folder-name-input').fill(initialFolderName)
    await create.getByTestId('folder-description-input').fill('Mô tả lúc tạo')
    const pending = waitForWrite(page, 'POST', '/folders')
    await create.getByTestId('folder-name-submit').press('Enter')
    const response = await pending
    expect(response.status()).toBe(201)
    const folder = (await response.json() as components['schemas']['FolderResponse']).data
    expect(folder).toMatchObject({ name: initialFolderName, description: 'Mô tả lúc tạo', parentId: projects })
    await expect(create).toBeHidden()
    await expect(page.getByTestId('drive-new')).toBeFocused()

    const opener = driveRow(page, folder.id).getByTestId('folder-rename')
    await expect(opener).toHaveAccessibleName(/mô tả|description/i)
    await opener.press('Enter')
    const edit = page.getByTestId('folder-rename-dialog')
    await expect(edit).toHaveAccessibleName(/mô tả|description/i)
    await expect(edit.getByTestId('folder-description-input')).toHaveValue('Mô tả lúc tạo')
    expect((await owner.patch(`${api}/folders/${folder.id}`, { data: { name: folderName } })).status()).toBe(200)
    await edit.getByTestId('folder-description-input').fill(folderDescription)
    const saved = waitForWrite(page, 'PATCH', `/folders/${folder.id}`)
    await edit.getByTestId('folder-name-submit').press('Enter')
    const edited = await saved
    expect(edited.status()).toBe(200)
    expect(edited.request().postDataJSON()).toEqual({ description: folderDescription })
    expect(await edited.json()).toMatchObject({ data: { id: folder.id, name: folderName, description: folderDescription } })
    await expect(edit).toBeHidden()
    await expect(opener).toBeFocused()
    return folder
  })

  const folderPath = `/drive?folder=${folder.id}`
  const bytes = Buffer.from(`Thông tin tệp thử nghiệm ${suffix}\n`)
  const upload = await owner.post(`${api}/files`, {
    multipart: { folderId: folder.id, file: { name: `Thông tin ${suffix}.txt`, mimeType: 'text/plain', buffer: bytes } },
  })
  expect(upload.status()).toBe(201)
  const file = (await upload.json() as components['schemas']['FileResponse']).data
  const filePath = `/files/${file.id}`
  expect((await owner.patch(`${api}${filePath}`, { data: { tags: originalTags } })).status()).toBe(200)

  await test.step('Open from owner Drive and keep the draft after a simulated transient save error', async () => {
    await driveRow(page, folder.id).getByRole('link', { name: folderName, exact: true }).press('Enter')
    await expect(page.getByTestId('drive-folder-description')).toHaveText(folderDescription)
    const link = driveRow(page, file.id).getByTestId('drive-file-link')
    await expect(link).toHaveAttribute('href', filePath)
    await link.press('Enter')
    await expect(page.getByTestId('file-detail-back')).toHaveAttribute('href', folderPath)
    const opener = page.getByTestId('file-metadata-open')
    await opener.press('Enter')
    const editor = page.getByRole('dialog').and(page.getByTestId('file-metadata-dialog'))
    const description = editor.getByTestId('file-metadata-description')
    await expect(description).toBeFocused()
    await auditAccessibility(page, testInfo, 'file-metadata-editor')
    await description.fill('a'.repeat(1999) + '🙂🙂')
    await editor.getByTestId('file-metadata-save').press('Enter')
    await expect(editor.getByTestId('file-metadata-error')).toContainText(/2[.,]000/)
    await expect(description).toBeFocused()
    await description.fill(fileDescription)

    testInfo.annotations.push({ type: 'simulated', description: 'The first metadata PATCH receives a simulated transient 500.' })
    const operation = (url: URL) => url.pathname === `${api}${filePath}`
    let faulted = false
    await page.route(operation, async (route) => {
      if (!faulted && route.request().method() === 'PATCH') {
        faulted = true
        await route.fulfill({ status: 500, json: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Simulated transient error.' } } })
      } else await route.continue()
    })
    await editor.getByTestId('file-metadata-save').press('Enter')
    await expect(editor.getByTestId('file-metadata-error')).toBeVisible()
    await expect(description).toHaveValue(fileDescription)
    await expect(editor.getByTestId('file-metadata-tag')).toHaveCount(originalTags.length)
    await page.unroute(operation)
    const pending = waitForWrite(page, 'PATCH', filePath)
    await editor.getByTestId('file-metadata-save').press('Enter')
    const response = await pending
    expect(response.status()).toBe(200)
    expect(response.request().postDataJSON()).toEqual({ description: fileDescription })
    expect(await response.json()).toMatchObject({ data: { tags: originalTags } })
    await expect(editor).toBeHidden()
    await expect(opener).toBeFocused()
    await expect(page.getByTestId('file-detail-description')).toHaveText(fileDescription)
  })

  await test.step('Edit tags as separate values and reopen from list view', async () => {
    await page.getByTestId('file-metadata-open').press('Enter')
    const editor = page.getByTestId('file-metadata-dialog')
    const tag = editor.getByTestId('file-metadata-tag-input')
    await tag.fill(extraTag + '🙂')
    await tag.press('Enter')
    await expect(editor.getByTestId('file-metadata-tag-error')).toContainText('64')
    await tag.fill(extraTag)
    await tag.press('Enter')
    await expect(editor.getByTestId('file-metadata-tag')).toHaveCount(originalTags.length + 1)
    const pending = waitForWrite(page, 'PATCH', filePath)
    await editor.getByTestId('file-metadata-save').press('Enter')
    const response = await pending
    expect(response.status()).toBe(200)
    expect(response.request().postDataJSON()).toEqual({ tags: [...originalTags, extraTag] })
    await expect(editor).toBeHidden()

    await page.getByTestId('file-detail-back').press('Enter')
    await expect(page).toHaveURL(url => url.pathname + url.search === folderPath)
    await page.getByRole('button', { name: /danh sách|list view/i }).press('Enter')
    await expect(page).toHaveURL(url => url.searchParams.get('view') === 'list')
    await driveRow(page, file.id).getByTestId('drive-file-link').press('Enter')
    await expect(page).toHaveURL(url => url.pathname === filePath)
    await expect(page.getByTestId('file-detail-tag').filter({ hasText: extraTag })).toHaveCount(1)
    await page.goBack()
    await expect(page).toHaveURL(url => url.searchParams.get('folder') === folder.id && url.searchParams.get('view') === 'list')
    await driveRow(page, file.id).getByTestId('drive-file-link').press('Enter')
  })

  expect((await owner.put(`${api}/folders/${folder.id}/shares`, { data: { email: fixtureAccounts.viewer } })).status()).toBe(200)
  const { viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent } = testInfo.project.use
  const viewerContext = await browser.newContext({ baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent, storageState: await viewer.storageState() })
  try {
    const viewerPage = await viewerContext.newPage()
    await viewerPage.goto(folderPath)
    await expect(viewerPage.getByTestId('drive-folder-description')).toHaveText(folderDescription)
    await expect(viewerPage.getByTestId('drive-read-only')).toBeVisible()
    await expect(viewerPage.getByTestId('folder-rename')).toHaveCount(0)
    await driveRow(viewerPage, file.id).getByTestId('drive-file-link').press('Enter')
    await expect(viewerPage.getByTestId('file-detail-description')).toHaveText(fileDescription)
    await expect(viewerPage.getByTestId('file-detail-tag')).toHaveCount(originalTags.length + 1)
    await expect(viewerPage.getByTestId('file-detail-back')).toHaveAttribute('href', '/shared-with-me')
    await expect(viewerPage.getByTestId('file-metadata-open')).toHaveCount(0)

    await test.step('Clear metadata and keep unauthorized mutations excluded', async () => {
      expect((await viewer.patch(`${api}${filePath}`, { data: { description: 'Chỉnh thử bằng tài khoản chỉ xem' } })).status()).toBe(404)
      expect((await viewer.patch(`${api}/folders/${folder.id}`, { data: { description: null } })).status()).toBe(404)
      await page.getByTestId('file-metadata-open').press('Enter')
      const editor = page.getByTestId('file-metadata-dialog')
      await editor.getByTestId('file-metadata-description').fill('Bản nháp sẽ hủy')
      await page.keyboard.press('Escape')
      await editor.getByTestId('file-metadata-discard').press('Enter')
      await expect(editor).toBeHidden()
      const opener = page.getByTestId('file-metadata-open')
      await expect(opener).toBeFocused()
      await opener.press('Enter')
      await expect(editor.getByTestId('file-metadata-description')).toHaveValue(fileDescription)
      await editor.getByTestId('file-metadata-description').fill('')
      const remove = editor.getByTestId('file-metadata-remove-tag')
      while (await remove.count() > 0) await remove.first().press('Enter')
      const pendingFile = waitForWrite(page, 'PATCH', filePath)
      await editor.getByTestId('file-metadata-save').press('Enter')
      const cleared = await pendingFile
      expect(cleared.status()).toBe(200)
      expect(cleared.request().postDataJSON()).toEqual({ description: null, tags: [] })
      await expect(editor).toBeHidden()
      await page.reload()
      await expect(page.getByTestId('file-detail')).toBeVisible()
      await expect(page.getByTestId('file-detail-description')).toHaveCount(0)
      await expect(page.getByTestId('file-detail-tag')).toHaveCount(0)

      await page.goto(parentPath)
      await driveRow(page, folder.id).getByTestId('folder-rename').press('Enter')
      const folderEditor = page.getByTestId('folder-rename-dialog')
      await folderEditor.getByTestId('folder-description-input').fill('')
      const pendingFolder = waitForWrite(page, 'PATCH', `/folders/${folder.id}`)
      await folderEditor.getByTestId('folder-name-submit').press('Enter')
      const clearedFolder = await pendingFolder
      expect(clearedFolder.status()).toBe(200)
      expect(clearedFolder.request().postDataJSON()).toEqual({ description: null })
      await expect(folderEditor).toBeHidden()
      await viewerPage.goto(folderPath)
      await expect(viewerPage.getByTestId('drive-read-only')).toBeVisible()
      await expect(viewerPage.getByTestId('drive-folder-description')).toHaveCount(0)
    })
  } finally {
    await viewerContext.close()
  }
})
