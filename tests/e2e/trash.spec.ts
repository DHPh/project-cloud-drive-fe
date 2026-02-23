import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, test as base, type APIRequestContext, type APIResponse, type Page, type TestInfo } from '@playwright/test'

const api = '/api/v1'
const projects = '10000000-0000-4000-8000-000000000102'
const password = process.env.DEMO_PASSWORD ?? 'CloudDrive-Demo-2025!'

type Sessions = { owner: APIRequestContext; viewer: APIRequestContext }

const test = base.extend<object, { sessions: Sessions }>({
  sessions: [async ({ playwright }, provideSessions, workerInfo) => {
    const baseURL = workerInfo.project.use.baseURL!
    const options = { baseURL, extraHTTPHeaders: { Origin: new URL(baseURL).origin } }
    const owner = await playwright.request.newContext(options)
    const viewer = await playwright.request.newContext(options)
    try {
      for (const [request, email] of [[owner, 'demo@example.test'], [viewer, 'viewer@example.test']] as const) {
        const login = await request.post(`${api}/auth/login`, { data: { email, password } })
        expect(login.status()).toBe(200)
        expect(await login.json()).toMatchObject({ success: true, data: { email } })
      }
      await provideSessions({ owner, viewer })
    } finally {
      await Promise.all([owner.dispose(), viewer.dispose()])
    }
  }, { scope: 'worker' }],
  storageState: async ({ sessions }, provideState) => provideState(await sessions.owner.storageState()),
})

function apiResponse(page: Page, method: string, path: string) {
  return page.waitForResponse(response =>
    response.request().method() === method && new URL(response.url()).pathname === `${api}${path}`,
  )
}

function itemById(page: Page, testId: 'drive-item' | 'trash-item', id: string) {
  return page.getByTestId(testId).and(page.locator(`[data-item-id="${id}"]`))
}

async function expectNotFound(response: APIResponse) {
  expect(response.status()).toBe(404)
  expect(response.headers()['cache-control']).toBe('private, no-store')
  expect(await response.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } })
}

async function openTrashFromDrive(page: Page) {
  const link = page.getByRole('link', { name: /^(thùng rác|trash)$/i })
  if (!await link.isVisible()) {
    await page.getByRole('button', { name: /mở điều hướng|open navigation/i }).press('Enter')
  }
  await expect(link).toHaveAttribute('href', '/trash')
  await link.press('Enter')
  await expect(page).toHaveURL(url => url.pathname === '/trash')
}

async function verifyTrashAccessibility(page: Page, testInfo: TestInfo, screenshotName: string) {
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  const path = testInfo.outputPath(`${screenshotName}.png`)
  await page.screenshot({ path, animations: 'disabled' })
  await testInfo.attach(screenshotName, { path, contentType: 'image/png' })
}

test('TRASH-01 moves and restores the same file without exposing it to another user', async ({ page, sessions }, testInfo) => {
  const suffix = randomUUID().slice(0, 8)
  const driveUrl = `/drive?folder=${projects}&q=${suffix}`
  const originalName = `Bản nháp ${suffix}.txt`
  const bytes = Buffer.from(`TRASH-01 ${suffix}\nDữ liệu thử nghiệm\n`)

  await page.goto(driveUrl)
  await expect(page.getByTestId('drive-empty-search')).toBeVisible()
  await page.getByTestId('drive-new').click()
  await page.getByTestId('upload-open').click()
  const uploadDialog = page.getByTestId('upload-dialog')
  await uploadDialog.getByTestId('upload-input').setInputFiles({ name: originalName, mimeType: 'text/plain', buffer: bytes })
  const uploaded = apiResponse(page, 'POST', '/files')
  await uploadDialog.getByTestId('upload-submit').click()
  const upload = await uploaded
  expect(upload.status()).toBe(201)
  const { data: file } = await upload.json()
  expect(file).toMatchObject({ folderId: projects, originalName, size: bytes.length })
  const fileId: string = file.id
  await expect(uploadDialog.getByTestId('upload-item')).toHaveAttribute('data-status', 'complete')
  await uploadDialog.getByTestId('upload-close').click()
  await expect(uploadDialog).toBeHidden()

  const driveItem = itemById(page, 'drive-item', fileId)
  const trashAction = driveItem.getByTestId('file-trash')
  const confirmation = page.getByRole('dialog').and(page.getByTestId('trash-dialog'))
  await expect(trashAction).toHaveAccessibleName(/đưa vào thùng rác|move to trash/i)
  await trashAction.press('Enter')
  await expect(confirmation).toHaveAccessibleName(/đưa vào thùng rác|move to trash/i)
  await expect(confirmation.getByTestId('trash-cancel')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirmation).toBeHidden()
  await expect(trashAction).toBeFocused()

  await page.keyboard.press('Enter')
  const moved = apiResponse(page, 'POST', `/files/${fileId}/trash`)
  await confirmation.getByTestId('trash-confirm').press('Enter')
  const trashResponse = await moved
  expect(trashResponse.status()).toBe(200)
  const trashResult = await trashResponse.json()
  expect(trashResult).toMatchObject({ success: true, data: { id: fileId, trashedAt: expect.any(String) } })
  await expect(confirmation).toBeHidden()
  await expect(page.getByTestId('drive-status')).toContainText(/đã đưa.+thùng rác|moved.+trash/i)
  await expect(page.locator('#drive-main')).toBeFocused()

  await page.reload()
  await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === driveUrl)
  await expect(page.getByTestId('drive-empty-search')).toBeVisible()
  await expect(driveItem).toHaveCount(0)
  const folder = await sessions.owner.get(`${api}/folders/${projects}/contents`)
  expect(folder.status()).toBe(200)
  const folderResult = await folder.json()
  expect(folderResult.data.items).not.toContainEqual(expect.objectContaining({ id: fileId }))
  await expectNotFound(await sessions.owner.get(`${api}/files/${fileId}/download`))
  await expectNotFound(await sessions.owner.patch(`${api}/files/${fileId}`, { data: { originalName: 'Could not rename.txt' } }))

  const repeatedMove = await sessions.owner.post(`${api}/files/${fileId}/trash`)
  expect(repeatedMove.status()).toBe(200)
  expect(await repeatedMove.json()).toEqual(trashResult)
  const foreignList = await sessions.viewer.get(`${api}/trash`, { params: { page: 1, limit: 20 } })
  expect(foreignList.status()).toBe(200)
  expect((await foreignList.json()).data.items).not.toContainEqual(expect.objectContaining({ id: fileId }))
  await expectNotFound(await sessions.viewer.post(`${api}/files/${fileId}/trash`))
  await expectNotFound(await sessions.viewer.post(`${api}/files/${fileId}/restore`))

  await openTrashFromDrive(page)
  const archive = await sessions.owner.get(`${api}/trash`, { params: { page: 1, limit: 20 } })
  expect(archive.status()).toBe(200)
  expect(await archive.json()).toMatchObject({
    success: true,
    data: { items: expect.arrayContaining([expect.objectContaining({
      id: fileId, originalName, folderId: projects, size: bytes.length, trashedAt: trashResult.data.trashedAt,
    })]) },
    pagination: { page: 1, limit: 20, total: expect.any(Number), totalPages: expect.any(Number) },
  })
  const trashItem = itemById(page, 'trash-item', fileId)
  await expect(trashItem.getByText(originalName, { exact: true })).toBeVisible()
  await verifyTrashAccessibility(page, testInfo, 'trash-list')
  const listedIds = await page.getByTestId('trash-item').evaluateAll(rows => rows.map(row => row.getAttribute('data-item-id')))
  const position = listedIds.indexOf(fileId)
  const nextFocusId = listedIds[position + 1] ?? listedIds[position - 1]
  const restoreAction = trashItem.getByTestId('trash-restore')
  await expect(restoreAction).toHaveAccessibleName(/khôi phục|restore/i)
  const restoredInBrowser = apiResponse(page, 'POST', `/files/${fileId}/restore`)
  await restoreAction.press('Enter')
  const restored = await restoredInBrowser
  expect(restored.status()).toBe(200)
  expect(await restored.json()).toEqual({ success: true, data: { id: fileId, trashedAt: null } })
  await expect(trashItem).toHaveCount(0)
  await expect(page.getByTestId('trash-status')).toContainText(/đã khôi phục|restored/i)
  const nextFocus = nextFocusId
    ? itemById(page, 'trash-item', nextFocusId).getByTestId('trash-restore')
    : page.locator('#trash-heading')
  await expect(nextFocus).toBeFocused()

  const repeatedRestore = await sessions.owner.post(`${api}/files/${fileId}/restore`)
  expect(repeatedRestore.status()).toBe(200)
  expect(await repeatedRestore.json()).toEqual({ success: true, data: { id: fileId, trashedAt: null } })

  await page.goto(driveUrl)
  await expect(driveItem.getByText(originalName, { exact: true })).toBeVisible()
  const downloadReady = page.waitForEvent('download')
  await driveItem.getByTestId('file-download').click()
  const download = await downloadReady
  expect(download.suggestedFilename()).toBe(originalName)
  expect(await readFile(await download.path())).toEqual(bytes)
})

test.describe('empty Trash for the viewer fixture', () => {
  test.use({ storageState: async ({ sessions }, provideState) => provideState(await sessions.viewer.storageState()) })

  test('TRASH-01 shows loading and recovers from a transient list error', async ({ page }, testInfo) => {
    let releaseInitialRequest!: () => void
    const waitForRelease = new Promise<void>(resolve => { releaseInitialRequest = resolve })
    // Only the first query fails at the transport boundary. Retry reads the real API.
    await page.route(url => url.pathname === `${api}/trash`, async route => {
      await waitForRelease
      await route.abort('failed')
    }, { times: 1 })

    try {
      await page.goto('/trash', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('trash-loading')).toBeVisible()
    } finally {
      releaseInitialRequest()
    }
    await expect(page.getByTestId('trash-error')).toBeVisible()
    const retried = apiResponse(page, 'GET', '/trash')
    await page.getByTestId('trash-retry').press('Enter')
    const response = await retried
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, data: { items: [] }, pagination: { total: 0 } })
    await expect(page.getByTestId('trash-empty')).toBeVisible()
    await expect(page.getByTestId('trash-item')).toHaveCount(0)
    await verifyTrashAccessibility(page, testInfo, 'trash-empty')
  })
})
