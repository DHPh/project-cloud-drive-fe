import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'
import type { components, operations } from '../../src/lib/api-schema'
import { fixturePassword, ownerTest as test } from './fixtures'

const api = '/api/v1'
const archive = '10000000-0000-4000-8000-000000000104'
const guestState = { cookies: [], origins: [] }

async function upload(owner: APIRequestContext, name: string, buffer: Buffer) {
  const response = await owner.post(api + '/files', {
    multipart: { folderId: archive, file: { name, mimeType: 'text/plain', buffer } },
  })
  expect(response.status()).toBe(201)
  return (await response.json() as components['schemas']['FileResponse']).data
}

async function checkScreen(page: Page, testInfo: TestInfo, label: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await testInfo.attach(label, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
}

test('BOARD-01 publishes chosen files, keeps restored files private and allows admin moderation', async ({
  page, browser, playwright, ownerRequest: owner, viewerRequest: viewer, baseURL,
}, testInfo) => {
  test.setTimeout(150_000)
  const suffix = randomUUID().slice(0, 8)
  const title = 'Bảng thử ' + suffix
  const original = 'Nội dung bảng ' + suffix + '.txt'
  const alternate = 'Tệp sắp xếp ' + suffix + '.txt'
  const privateNotes = 'Ghi chú riêng ' + suffix
  const contents = 'Ký tự Unicode và <dấu ngoặc> & văn bản ' + suffix
  const bytes = Buffer.from(contents, 'utf8')
  const file = await upload(owner, original, bytes)
  await upload(owner, alternate, Buffer.from('Thứ tự thử ' + suffix))
  expect((await owner.patch(api + '/files/' + file.id, { data: { description: privateNotes } })).status()).toBe(200)

  const { viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent } = testInfo.project.use
  const device = { baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent }
  const visitorContext = await browser.newContext({ ...device, storageState: guestState })
  const adminRequest = await playwright.request.newContext({
    baseURL, extraHTTPHeaders: { Origin: new URL(baseURL!).origin }, storageState: guestState,
  })
  const adminContext = await browser.newContext({ ...device, storageState: guestState })
  try {
    const guest = await visitorContext.newPage()
    const heading = page.getByTestId('board-heading')
    let boardId = ''
    let publicId = ''
    let publicItemId = ''
    let publicHref = ''

    await test.step('Create a private draft from the real owner UI', async () => {
      await page.goto('/boards')
      const opener = page.getByTestId('board-create-open')
      await opener.press('Enter')
      const dialog = page.getByTestId('board-create-dialog')
      await expect(dialog.getByTestId('board-title')).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(opener).toBeFocused()
      await opener.press('Enter')
      await dialog.getByTestId('board-title').fill(title)
      await dialog.getByTestId('board-description').fill('Mô tả công khai ' + suffix)
      const pending = page.waitForResponse(response => new URL(response.url()).pathname === api + '/boards' && response.request().method() === 'POST')
      await dialog.getByTestId('board-create-submit').press('Enter')
      const created = await pending
      expect(created.status()).toBe(201)
      const board = (await created.json() as operations['createBoard']['responses'][201]['content']['application/json']).data
      expect(board.visibility).toBe('draft')
      boardId = board.id
      publicId = board.publicId
      publicHref = '/public/boards/' + publicId
      await expect(heading).toHaveText(title)
      await expect(page.getByTestId('board-public-link')).toHaveCount(0)
      expect((await viewer.get(api + '/boards/' + boardId)).status()).toBe(404)
      expect((await guest.request.get(api + '/public/boards/' + publicId)).status()).toBe(404)
    })

    await test.step('Attach owned files through Drive search and change their order', async () => {
      const opener = page.getByTestId('board-attach-open')
      const dialog = page.getByTestId('board-attach-dialog')
      for (const name of [original, alternate]) {
        await opener.press('Enter')
        const search = dialog.getByTestId('board-file-search')
        await expect(search).toBeFocused()
        await search.fill(name)
        await search.press('Enter')
        await dialog.getByTestId('board-file-result').filter({ hasText: name }).getByTestId('board-file-add').press('Enter')
        await expect(dialog).toBeHidden()
        await expect(opener).toBeFocused()
      }
      await expect(page.getByTestId('board-item').first()).toContainText(original)
      const item = page.getByTestId('board-item').filter({ hasText: original })
      publicItemId = (await item.getAttribute('data-item-id'))!
      expect(publicItemId).toBeTruthy()
      await expect(item.getByTestId('board-item-published')).not.toBeChecked()
      await expect(item.getByTestId('board-item-download')).not.toBeChecked()
      await item.getByTestId('board-item-move-down').press('Enter')
      await expect(page.getByTestId('board-item').first()).toContainText(alternate)
      await expect(item.getByTestId('board-item-move-down')).toBeDisabled()
      await checkScreen(page, testInfo, 'board-owner')
    })

    await test.step('Publish by link with independent download and show only safe public content', async () => {
      const item = page.getByTestId('board-item').filter({ hasText: original })
      const publish = item.getByTestId('board-item-published')
      const download = item.getByTestId('board-item-download')
      await publish.press('Space')
      await expect(publish).toBeChecked()
      await expect(download).not.toBeChecked()
      await page.getByTestId('board-visibility').selectOption('link')
      await page.getByTestId('board-settings-save').press('Enter')
      const publicLink = page.getByTestId('board-public-link')
      await expect(publicLink).toHaveValue(new URL(publicHref, baseURL).href)
      await guest.goto(await publicLink.inputValue())
      await expect(guest.getByTestId('public-board-heading')).toHaveText(title)
      await expect(guest.getByTestId('public-board-item')).toHaveCount(1)
      await expect(guest.getByTestId('public-board-item')).toContainText(original)
      await expect(guest.getByTestId('public-board-download')).toHaveCount(0)
      await expect(guest.getByText(privateNotes)).toHaveCount(0)

      const publicResponse = await guest.request.get(api + '/public/boards/' + publicId)
      expect(publicResponse.status()).toBe(200)
      expect((await publicResponse.json()).data).toEqual({
        publicId, title, description: 'Mô tả công khai ' + suffix,
        items: [{ id: publicItemId, originalName: original, mimeType: 'text/plain', size: bytes.length, allowDownload: false, canPreview: true }],
      })
      const downloadPath = api + publicHref + '/items/' + publicItemId + '/download'
      expect((await guest.request.get(downloadPath)).status()).toBe(404)
      const explore = await guest.request.get(api + '/public/boards')
      expect((await explore.json()).data.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ publicId })]))

      const previewOpener = guest.getByTestId('public-board-preview-open')
      await previewOpener.press('Enter')
      const preview = guest.getByTestId('public-board-preview-dialog')
      await expect(preview.getByTestId('public-board-preview-close')).toBeFocused()
      await expect(preview.getByTestId('public-board-preview')).toHaveText(contents)
      await checkScreen(guest, testInfo, 'board-public-preview')
      await guest.keyboard.press('Escape')
      await expect(preview).toBeHidden()
      await expect(previewOpener).toBeFocused()

      await download.press('Space')
      await expect(download).toBeChecked()
      await guest.reload()
      const pendingDownload = guest.waitForEvent('download')
      await guest.getByTestId('public-board-download').click()
      const attachment = await pendingDownload
      expect(attachment.suggestedFilename()).toBe(original)
      expect(await readFile(await attachment.path())).toEqual(bytes)

      await page.getByTestId('board-visibility').selectOption('discoverable')
      await page.getByTestId('board-settings-save').press('Enter')
      await expect(page.getByTestId('board-status')).toHaveText('Đã lưu bảng.')
      await guest.goto('/explore')
      const card = guest.getByTestId('public-board-card').and(guest.locator('[data-public-id="' + publicId + '"]'))
      await expect(card).toContainText(title)
      await card.getByRole('link').press('Enter')
      await expect(guest.getByTestId('public-board-heading')).toHaveText(title)
    })

    await test.step('Trash and restore the file without republishing it', async () => {
      const safeDownload = api + publicHref + '/items/' + publicItemId + '/download'
      const drive = '/drive?' + new URLSearchParams({ folder: archive, q: original })
      await page.goto(drive)
      const driveItem = page.getByTestId('drive-item').and(page.locator('[data-item-id="' + file.id + '"]'))
      await driveItem.getByTestId('file-trash').press('Enter')
      await page.getByTestId('trash-confirm').press('Enter')
      await expect(driveItem).toHaveCount(0)
      await guest.reload()
      await expect(guest.getByTestId('public-board-empty')).toBeVisible()
      expect((await guest.request.get(safeDownload)).status()).toBe(404)
      await page.goto('/trash')
      const trashedItem = page.getByTestId('trash-item').and(page.locator('[data-item-id="' + file.id + '"]'))
      await trashedItem.getByTestId('trash-restore').press('Enter')
      await expect(trashedItem).toHaveCount(0)
      await guest.reload()
      await expect(guest.getByTestId('public-board-empty')).toBeVisible()
      expect((await guest.request.get(safeDownload)).status()).toBe(404)
      await page.goto('/boards/' + boardId)
      const publish = page.getByTestId('board-item').filter({ hasText: original }).getByTestId('board-item-published')
      await expect(publish).toBeEnabled()
      await expect(publish).not.toBeChecked()
      await publish.press('Space')
      await expect(publish).toBeChecked()
    })

    await test.step('Admin hides the board and its original download', async () => {
      const login = await adminRequest.post(api + '/auth/login', {
        data: { email: process.env.PLAYWRIGHT_ADMIN_EMAIL ?? 'admin@example.test', password: process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? fixturePassword },
      })
      expect(login.status()).toBe(200)
      expect((await login.json()).data.role).toBe('admin')
      await adminContext.addCookies((await adminRequest.storageState()).cookies)
      const moderator = await adminContext.newPage()
      await moderator.goto('/admin/boards')
      const row = moderator.getByTestId('moderation-board-row').and(moderator.locator('[data-board-id="' + boardId + '"]'))
      const hide = row.getByTestId('moderation-board-hide')
      await hide.press('Enter')
      const dialog = moderator.getByTestId('moderation-board-dialog')
      await expect(dialog.getByTestId('moderation-board-cancel')).toBeFocused()
      await checkScreen(moderator, testInfo, 'board-moderation')
      await dialog.getByTestId('moderation-board-confirm').press('Enter')
      await expect(dialog).toBeHidden()
      await expect(moderator.getByTestId('moderation-board-status')).toContainText(/đã ẩn|hidden/i)
      await guest.reload()
      await expect(guest.getByTestId('public-board-error')).toBeVisible()
      expect((await guest.request.get(api + publicHref + '/items/' + publicItemId + '/download')).status()).toBe(404)
      await guest.goto('/explore')
      await expect(guest.getByRole('heading', { name: /khám phá|explore/i })).toBeVisible()
      await expect(guest.getByTestId('public-board-card').and(guest.locator('[data-public-id="' + publicId + '"]'))).toHaveCount(0)

      await page.reload()
      await expect(page.getByTestId('board-public-link')).toHaveCount(0)
      await page.getByTestId('board-delete-open').press('Enter')
      await page.getByTestId('board-delete-confirm').press('Enter')
      await expect(page).toHaveURL(url => url.pathname === '/boards')
      expect(await (await owner.get(api + '/files/' + file.id + '/download')).body()).toEqual(bytes)
    })
  } finally {
    await Promise.all([visitorContext.close(), adminContext.close(), adminRequest.dispose()])
  }
})
