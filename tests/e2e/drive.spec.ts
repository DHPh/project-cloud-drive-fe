import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page, type Response, type TestInfo } from '@playwright/test'

const fixture = {
  email: 'demo@example.test',
  password: process.env.DEMO_PASSWORD ?? 'CloudDrive-Demo-2025!',
  documents: '10000000-0000-4000-8000-000000000101',
  projects: '10000000-0000-4000-8000-000000000102',
  empty: '10000000-0000-4000-8000-000000000103',
  viewerPrivate: '10000000-0000-4000-8000-000000000201',
}

const api = '/api/v1'

type SessionState = Awaited<ReturnType<APIRequestContext['storageState']>>

// Authenticated scenarios share one real session per project worker so the matrix
// can run with the normal authentication rate limit enabled.
const authenticatedTest = test.extend<object, { sessionState: SessionState }>({
  sessionState: [async ({ playwright }, use, workerInfo) => {
    const baseURL = workerInfo.project.use.baseURL!
    const request = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: new URL(baseURL).origin } })
    let state: SessionState
    try {
      const response = await request.post(`${api}/auth/login`, { data: { email: fixture.email, password: fixture.password } })
      expect(response.status()).toBe(200)
      state = await request.storageState()
    } finally {
      await request.dispose()
    }
    await use(state)
  }, { scope: 'worker' }],
  storageState: ({ sessionState }, provideStorageState) => provideStorageState(sessionState),
})

function driveUrl(folder?: string) {
  return folder ? `/drive?folder=${folder}` : '/drive'
}

function driveItems(page: Page) {
  return page.getByTestId('drive-item')
}

function fileItem(page: Page, fileId: string) {
  return driveItems(page).and(page.locator(`[data-item-id="${fileId}"]`))
}

function folderLink(page: Page, name: string) {
  return driveItems(page).getByRole('link', { name, exact: true })
}

function apiResponse(page: Page, method: string, path: string) {
  return page.waitForResponse(response =>
    response.request().method() === method && new URL(response.url()).pathname === `${api}${path}`,
  )
}

function expectPrivate(response: { headers(): Record<string, string> }) {
  const cache = response.headers()['cache-control']?.split(',').map(value => value.trim())
  expect(cache).toEqual(expect.arrayContaining(['private', 'no-store']))
}

async function signIn(page: Page, destination = '/drive') {
  await page.goto(destination)
  await expect(page).toHaveURL(url =>
    url.pathname === '/login' && (url.searchParams.get('redirect') ?? '/drive') === destination,
  )
  await page.getByTestId('login-email').fill(fixture.email)
  await page.getByTestId('login-password').fill(fixture.password)
  const login = apiResponse(page, 'POST', '/auth/login')
  await page.getByTestId('login-submit').click()
  const response = await login
  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ success: true, data: { email: fixture.email } })
  expectPrivate(response)
  const cookieAttributes = (await response.headerValues('set-cookie'))
    .filter(header => header.startsWith('cloud_drive_session='))
    .flatMap(header => header.split(';').slice(1).map(part => part.trim()))
  expect(cookieAttributes).toEqual(expect.arrayContaining(['HttpOnly', 'SameSite=Lax']))
  await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === destination)
  await expect(page.getByTestId('drive-search')).toBeVisible()
}

async function openDrive(page: Page, destination = '/drive') {
  await page.goto(destination)
  await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === destination)
  await expect(page.getByTestId('drive-search')).toBeVisible()
}

async function openUpload(page: Page) {
  await page.getByTestId('drive-new').click()
  await page.getByTestId('upload-open').click()
  const dialog = page.getByRole('dialog').and(page.getByTestId('upload-dialog'))
  await expect(dialog).toBeVisible()
  return dialog
}

async function recordScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, animations: 'disabled' })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

test('login is disabled before client hydration', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto('/login')
    await expect(page.locator('form')).toHaveAttribute('method', 'post')
    await expect(page.getByTestId('login-email')).toBeDisabled()
    await expect(page.getByTestId('login-password')).toBeDisabled()
    await expect(page.getByTestId('login-submit')).toBeDisabled()
  } finally {
    await context.close()
  }
})

test('deep link, upload, Unicode rename, download bytes, and logout', async ({ page }, testInfo) => {
  const suffix = randomUUID().slice(0, 8)
  const destination = `${driveUrl(fixture.projects)}&q=${suffix}`
  await signIn(page, destination)

  const session = (await page.context().cookies()).find(cookie => cookie.name === 'cloud_drive_session')
  expect(session?.httpOnly).toBe(true)

  const originalName = `Fixture ${suffix}.txt`
  const newName = `Báo cáo thử nghiệm ${suffix}.txt`
  const bytes = Buffer.from(`Cloud Drive UAT ${suffix}\nDữ liệu mẫu\n`)

  const uploadDialog = await openUpload(page)
  await uploadDialog.getByTestId('upload-input').setInputFiles({ name: originalName, mimeType: 'text/plain', buffer: bytes })
  const created = apiResponse(page, 'POST', '/files')
  await uploadDialog.getByTestId('upload-submit').click()
  const upload = await created
  expect(upload.status()).toBe(201)
  const uploaded = await upload.json()
  expect(uploaded).toMatchObject({ success: true, data: { folderId: fixture.projects, originalName, size: bytes.length } })
  const fileId: string = uploaded.data.id

  await expect(uploadDialog.getByTestId('upload-item')).toHaveAttribute('data-status', 'complete')
  await uploadDialog.getByTestId('upload-close').click()
  await expect(uploadDialog).toBeHidden()
  const file = fileItem(page, fileId)
  await expect(file.getByText(originalName, { exact: true })).toBeVisible()
  await file.getByTestId('file-rename').click()
  const rename = page.getByRole('dialog').and(page.getByTestId('rename-dialog'))
  await expect(rename).toHaveAccessibleName(/đổi tên|chỉnh sửa|rename|edit/i)
  const renameInput = rename.getByTestId('rename-input')
  await expect(renameInput).toHaveValue(originalName)
  await expect(renameInput).toBeFocused()
  await renameInput.fill(newName)
  await recordScreenshot(page, testInfo, 'rename-dialog')

  const updated = apiResponse(page, 'PATCH', `/files/${fileId}`)
  await rename.getByTestId('rename-save').click()
  const update = await updated
  expect(update.status()).toBe(200)
  expect(await update.json()).toMatchObject({ success: true, data: { id: fileId, originalName: newName } })
  await expect(rename).toBeHidden()
  await page.reload()
  await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === destination)
  await expect(file.getByText(newName, { exact: true })).toBeVisible()

  const downloadReady = page.waitForEvent('download')
  await file.getByTestId('file-download').click()
  const download = await downloadReady
  expect(download.suggestedFilename()).toBe(newName)
  expect(await readFile(await download.path())).toEqual(bytes)
  const downloadResponse = await page.request.get(`${api}/files/${fileId}/download`)
  expect(downloadResponse.status()).toBe(200)
  expectPrivate(downloadResponse)
  expect(downloadResponse.headers()['content-disposition']).toBe(`attachment; filename*=UTF-8''${encodeURIComponent(newName)}`)
  expect(await downloadResponse.body()).toEqual(bytes)
  await recordScreenshot(page, testInfo, 'drive-after-rename')

  const loggedOut = apiResponse(page, 'POST', '/auth/logout')
  await page.getByTestId('logout').click()
  expect((await loggedOut).status()).toBe(200)
  await expect(page).toHaveURL(url => url.pathname === '/login')
  const expired = await page.request.get(`${api}/auth/me`)
  expect(expired.status()).toBe(401)
  expectPrivate(expired)
  expect(await expired.json()).toMatchObject({ success: false, error: { code: 'SESSION_REQUIRED' } })
})

authenticatedTest('folder links, pagination, scoped search, and empty states follow the URL', async ({ page }, testInfo) => {
  await openDrive(page)
  await expect(folderLink(page, 'Documents')).toHaveAttribute('href', driveUrl(fixture.documents))
  await recordScreenshot(page, testInfo, 'drive-root')
  await folderLink(page, 'Documents').click()
  await expect(page).toHaveURL(url => url.searchParams.get('folder') === fixture.documents)
  await expect(folderLink(page, 'Projects')).toHaveAttribute('href', driveUrl(fixture.projects))
  const firstPageIds = await driveItems(page).evaluateAll(items => items.map(item => item.getAttribute('data-item-id')))
  expect(firstPageIds).toHaveLength(20)

  await page.getByTestId('drive-pagination-next').click()
  await expect(page).toHaveURL(url => url.searchParams.get('page') === '2')
  await expect(folderLink(page, 'Projects')).toHaveCount(0)
  await expect(driveItems(page).first()).toBeVisible()
  const secondPageIds = await driveItems(page).evaluateAll(items => items.map(item => item.getAttribute('data-item-id')))
  expect(secondPageIds.length).toBeGreaterThan(0)
  expect(secondPageIds.some(id => firstPageIds.includes(id))).toBe(false)

  const search = page.getByTestId('drive-search')
  await search.fill('Scope sample')
  await search.press('Enter')
  await expect(page).toHaveURL(url =>
    url.searchParams.get('folder') === fixture.documents && url.searchParams.get('q') === 'Scope sample' &&
    (url.searchParams.get('page') ?? '1') === '1',
  )
  await expect(driveItems(page)).toHaveCount(1)
  await expect(driveItems(page).getByText('Scope sample - Documents.txt', { exact: true })).toBeVisible()

  await search.fill('fixture-with-no-matches')
  await search.press('Enter')
  await expect(page.getByTestId('drive-empty-search')).toBeVisible()
  await expect(page.getByTestId('drive-empty-folder')).toHaveCount(0)

  await page.getByRole('link', { name: /xóa tìm kiếm|clear search/i }).click()
  await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === driveUrl(fixture.documents))
  await folderLink(page, 'Projects').press('Enter')
  await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === driveUrl(fixture.projects))
  const breadcrumbs = page.getByRole('navigation', { name: /đường dẫn thư mục|folder path/i })
  await expect(breadcrumbs.getByText('Projects', { exact: true })).toBeVisible()
  await expect(page.getByRole('main')).toBeFocused()
  await page.goBack()
  await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === driveUrl(fixture.documents))
  await expect(folderLink(page, 'Projects')).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === driveUrl(fixture.projects))

  await page.goto(driveUrl(fixture.empty))
  await expect(page.getByTestId('drive-empty-folder')).toBeVisible()
  await expect(page.getByTestId('drive-empty-search')).toHaveCount(0)
  await recordScreenshot(page, testInfo, 'drive-empty-folder')
  const inaccessible = await page.request.get(`${api}/folders/${fixture.viewerPrivate}/contents`)
  expect(inaccessible.status()).toBe(404)
  expectPrivate(inaccessible)
  expect(await inaccessible.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } })
})

authenticatedTest('Vietnamese composition commits search only after composition ends', async ({ page }) => {
  await openDrive(page, driveUrl(fixture.documents))
  const search = page.getByTestId('drive-search')
  const query = 'báo cáo tổng hợp'
  const prematureRequest = page.waitForRequest(request => {
    const url = new URL(request.url())
    return url.pathname.endsWith(`/folders/${fixture.documents}/contents`) && url.searchParams.has('q')
  }, { timeout: 700 }).then(() => true, (error: Error) => {
    if (error.name !== 'TimeoutError') throw error
    return false
  })

  await search.evaluate(input => input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
  await search.fill(query)
  await search.evaluate((input, value) => {
    input.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: value }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))
  }, query)
  expect(await prematureRequest).toBe(false)
  await expect(page).toHaveURL(url => !url.searchParams.has('q'))
  await search.evaluate((input, value) =>
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: value })), query,
  )
  await expect(page).toHaveURL(url => url.searchParams.get('q') === query)
  await expect(page.getByTestId('drive-empty-search')).toBeVisible()
})

authenticatedTest('upload dialog traps and restores keyboard focus, and accepts a reselected file', async ({ page }, testInfo) => {
  await openDrive(page, driveUrl(fixture.empty))
  const emptyState = page.getByTestId('drive-empty-folder')
  await expect(emptyState).toBeVisible()
  const opener = emptyState.getByTestId('upload-empty-open')
  await opener.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog').and(page.getByTestId('upload-dialog'))
  await expect(dialog).toHaveAccessibleName(/tải tệp|tải lên|upload/i)

  for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key)
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
  }
  const uploadInput = dialog.getByTestId('upload-input')
  const file = { name: 'reselect.txt', mimeType: 'text/plain', buffer: Buffer.from('Select this file twice.') }
  await uploadInput.setInputFiles(file)
  await expect(uploadInput).toHaveValue('')
  const selected = dialog.getByTestId('upload-item')
  await expect(selected).toHaveCount(1)
  await selected.getByTestId('upload-remove').click()
  await expect(selected).toHaveCount(0)
  await uploadInput.setInputFiles(file)
  await expect(selected).toHaveCount(1)
  await expect(selected).toHaveAttribute('data-status', 'queued')
  await recordScreenshot(page, testInfo, 'upload-dialog')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /bỏ thay đổi|discard changes/i }).click()
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await expect(selected).toHaveCount(0)
})

authenticatedTest('multi-file upload reports progress and retries only the rejected file', async ({ page }) => {
  await openDrive(page, driveUrl(fixture.projects))
  const dialog = await openUpload(page)
  const good = `Batch fixture ${randomUUID().slice(0, 8)}.txt`
  const bad = `${'x'.repeat(256)}.txt`
  const input = dialog.getByTestId('upload-input')
  await input.setInputFiles([
    { name: good, mimeType: 'text/plain', buffer: Buffer.from('Valid payload.') },
    { name: bad, mimeType: 'text/plain', buffer: Buffer.from('Invalid name.') },
  ])
  await dialog.evaluate(element => {
    const observer = new MutationObserver(() => {
      const progress = element.querySelector<HTMLProgressElement>('progress[data-testid="upload-progress"]')
      if (progress?.max === 100 && progress.getAttribute('aria-label')) {
        element.setAttribute('data-uat-progress-observed', 'true')
        observer.disconnect()
      }
    })
    observer.observe(element, { childList: true, subtree: true, attributes: true })
  })
  const statuses: number[] = []
  const track = (response: Response) => {
    if (response.request().method() === 'POST' && new URL(response.url()).pathname === `${api}/files`) {
      statuses.push(response.status())
    }
  }
  page.on('response', track)
  try {
    const completeItem = dialog.getByTestId('upload-item').filter({ hasText: good })
    const rejectedItem = dialog.getByTestId('upload-item').filter({ hasText: bad })
    await dialog.getByTestId('upload-submit').click()
    await expect(completeItem).toHaveAttribute('data-status', 'complete')
    await expect(rejectedItem).toHaveAttribute('data-status', 'failed')
    await expect(dialog).toHaveAttribute('data-uat-progress-observed', 'true')
    expect([...statuses].sort((left, right) => left - right)).toEqual([201, 400])

    const retry = apiResponse(page, 'POST', '/files')
    await rejectedItem.getByTestId('upload-retry').click()
    expect((await retry).status()).toBe(400)
    await expect(rejectedItem).toHaveAttribute('data-status', 'failed')
    await expect(completeItem).toHaveAttribute('data-status', 'complete')
    expect([...statuses].sort((left, right) => left - right)).toEqual([201, 400, 400])
  } finally {
    page.off('response', track)
  }
})

authenticatedTest('Drive and the upload dialog meet automated accessibility and viewport checks', async ({ page }, testInfo) => {
  await openDrive(page)
  await expect(folderLink(page, 'Documents')).toBeVisible()
  const scan = async () => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
  }
  const checkViewport = async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  }
  await scan()
  await checkViewport()

  const dialog = await openUpload(page)
  await scan()
  await checkViewport()
  const bounds = await dialog.boundingBox()
  expect(bounds).not.toBeNull()
  const viewport = page.viewportSize()!
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1)
  await recordScreenshot(page, testInfo, 'upload-dialog-viewport')
})
