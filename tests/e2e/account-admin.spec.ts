import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page } from '@playwright/test'
import type { components } from '../../src/lib/api-schema'
import { fixturePassword, test } from './fixtures'

const api = '/api/v1'
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? 'admin@example.test'
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? fixturePassword
const actionTimeout = 12_000

// Links and credentials in this suite are synthetic and should still remain outside artifacts.
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  const [response] = await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `${api}/auth/login`, { timeout: actionTimeout }),
    page.getByTestId('login-submit').press('Enter'),
  ])
  expect(response.status()).toBe(200)
  await expect(page).toHaveURL(url => url.pathname === '/drive')
}

async function openAccountLink(page: Page, link: string, pathname: '/invite' | '/reset-password') {
  try {
    await page.goto(link, { timeout: actionTimeout })
  } catch {
    throw new Error('Could not open the synthetic account link')
  }
  await expect.poll(() => {
    const url = new URL(page.url())
    return url.pathname === pathname && !url.hash && !url.search
  }).toBe(true)
}

async function fillNewPassword(page: Page, password: string) {
  await page.getByTestId('new-password').fill(password)
  await page.getByTestId('confirm-password').fill(password)
}

async function issueInvite(page: Page, email: string) {
  await openControl(page.getByTestId('admin-tab-invites'))
  await openControl(page.getByTestId('admin-invite-open'))
  const dialog = page.getByTestId('admin-action-dialog')
  await expect(dialog.getByTestId('admin-invite-email')).toBeFocused()
  await dialog.getByTestId('admin-invite-email').fill(email)
  await openControl(dialog.getByTestId('admin-action-submit'))
  const issued = dialog.getByTestId('admin-issued-url')
  await expect(issued).toBeFocused()
  const url = await issued.inputValue()
  const parsed = new URL(url)
  expect(parsed.pathname === '/invite' && !parsed.search && /^#token=[A-Za-z0-9_-]{43}$/.test(parsed.hash)).toBe(true)
  const close = dialog.getByTestId('admin-issued-close')
  await expect(close).toBeEnabled()
  await openControl(close)
  await expect(dialog).toBeHidden()
  return url
}

async function openControl(opener: Locator) {
  await opener.page().bringToFront()
  if (test.info().project.use.isMobile) await opener.tap()
  else await opener.click()
}

async function updateUser(page: Page, row: Locator, change: (dialog: Locator) => Promise<void>) {
  const opener = row.getByTestId('admin-user-edit')
  await openControl(opener)
  const dialog = page.getByRole('dialog').and(page.getByTestId('admin-action-dialog'))
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('admin-user-role')).toBeFocused()
  await change(dialog)
  const save = dialog.getByTestId('admin-action-submit')
  await expect(save).toBeEnabled()
  await openControl(save)
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
}

test('ACCOUNT and ADMIN manage one-time links, profile, quota, roles, sessions and audit', async ({ page, browser, playwright, baseURL, ownerRequest: ordinary }, testInfo) => {
  test.setTimeout(150_000)
  const suffix = randomUUID().slice(0, 8)
  const email = `account-${suffix}@example.test`
  const revokedEmail = `revoked-${suffix}@example.test`
  const displayName = `Tài khoản thử ${suffix}`
  const initialPassword = `Thử-nghiệm-1-${suffix}`
  const newPassword = `Thử-nghiệm-2-${suffix}`
  const resetPassword = `Thử-nghiệm-3-${suffix}`
  const auth = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: new URL(baseURL!).origin }, storageState: { cookies: [], origins: [] } })
  const { viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent } = testInfo.project.use
  const guest = await browser.newContext({ baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, userAgent, storageState: { cookies: [], origins: [] } })
  page.setDefaultTimeout(actionTimeout)
  page.setDefaultNavigationTimeout(actionTimeout)
  guest.setDefaultTimeout(actionTimeout)
  guest.setDefaultNavigationTimeout(actionTimeout)
  try {
    await test.step('Open admin as the fixture administrator', async () => {
      const login = await auth.post(`${api}/auth/login`, { data: { email: adminEmail, password: adminPassword }, timeout: actionTimeout })
      expect(login.status()).toBe(200)
      expect((await login.json()).data.role).toBe('admin')
      await page.context().addCookies((await auth.storageState()).cookies)
      await page.goto('/admin')
      await expect(page.getByTestId('admin-tab-users')).toBeVisible()
      expect((await ordinary.get(`${api}/admin/users`, { timeout: actionTimeout })).status()).toBe(403)
    })

    const userPage = await guest.newPage()
    const { account, inviteUrl } = await test.step('Issue and consume an invitation', async () => {
      const inviteUrl = await issueInvite(page, email)
      await openAccountLink(userPage, inviteUrl, '/invite')
      await userPage.getByTestId('invite-name').fill(displayName)
      await fillNewPassword(userPage, initialPassword)
      const [accepted] = await Promise.all([
        userPage.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `${api}/auth/accept-invite`, { timeout: actionTimeout }),
        userPage.getByTestId('account-link-submit').press('Enter'),
      ])
      expect(accepted.status()).toBe(201)
      const account = (await accepted.json() as components['schemas']['UserResponse']).data
      await expect(userPage.getByTestId('account-link-complete')).toBeVisible()
      return { account, inviteUrl }
    })
    await test.step('Reopen the same page with a consumed invitation', async () => {
      await openAccountLink(userPage, inviteUrl, '/invite')
      await userPage.getByTestId('invite-name').fill(displayName)
      await fillNewPassword(userPage, initialPassword)
      await userPage.getByTestId('account-link-submit').press('Enter')
      await expect(userPage.getByTestId('account-link-error')).toContainText(/đã được dùng|already used/i)
    })

    await test.step('Revoke a second invitation and reject its same-page link', async () => {
      const revokedUrl = await issueInvite(page, revokedEmail)
      await page.getByTestId('admin-invite-status').selectOption('active')
      const invited = page.getByTestId('admin-invite-row').filter({ hasText: revokedEmail })
      await openControl(invited.getByTestId('admin-invite-revoke'))
      const revokeDialog = page.getByTestId('admin-action-dialog')
      await expect(revokeDialog).toBeVisible()
      await expect(revokeDialog.getByTestId('admin-action-cancel')).toBeFocused()
      await openControl(revokeDialog.getByTestId('admin-action-submit'))
      await expect(revokeDialog).toBeHidden()
      await expect(invited).toHaveCount(0)
      await expect(page.locator('#admin-heading')).toBeFocused()
      await openAccountLink(userPage, revokedUrl, '/invite')
      await userPage.getByTestId('invite-name').fill(displayName)
      await fillNewPassword(userPage, initialPassword)
      await userPage.getByTestId('account-link-submit').press('Enter')
      await expect(userPage.getByTestId('account-link-error')).toContainText(/thu hồi|revoked/i)
    })

    await test.step('Update the profile and change the password as an ordinary user', async () => {
      await signIn(userPage, email, initialPassword)
      await userPage.goto('/admin')
      await expect(userPage).toHaveURL(url => url.pathname === '/drive')
      await userPage.goto('/account')
      await expect(userPage.getByTestId('account-quota')).toBeVisible()
      await userPage.getByTestId('account-name').fill(`${displayName} đã cập nhật`)
      await userPage.getByTestId('account-name-save').press('Enter')
      await expect(userPage.getByTestId('account-profile-status')).toBeVisible()
      await userPage.getByTestId('account-current-password').fill(initialPassword)
      await fillNewPassword(userPage, newPassword)
      await userPage.getByTestId('account-password-save').press('Enter')
      await expect(userPage).toHaveURL(url => url.pathname === '/login')
      expect((await userPage.request.get(`${api}/auth/me`, { timeout: actionTimeout })).status()).toBe(401)
      await signIn(userPage, email, newPassword)
    })

    const row = page.getByTestId('admin-user-row').and(page.locator(`[data-account-id="${account.id}"]`))
    await test.step('Update quota, role and account lock as administrator', async () => {
      await openControl(page.getByTestId('admin-tab-users'))
      const search = page.getByTestId('admin-user-search')
      await search.fill(email)
      await search.press('Enter')
      await expect(row).toContainText(`${displayName} đã cập nhật`)
      await updateUser(page, row, async (edit) => {
        await edit.getByTestId('admin-user-quota').fill('2147483648')
        await edit.getByTestId('admin-user-role').selectOption('admin')
      })
      await expect(row).toContainText(/quản trị viên|administrator/i)
      expect((await userPage.request.get(`${api}/auth/me`, { timeout: actionTimeout })).status()).toBe(401)
      await updateUser(page, row, async (edit) => {
        await edit.getByTestId('admin-user-role').selectOption('user')
        await edit.getByTestId('admin-user-lock').check()
      })
      await expect(row).toContainText(/đã khóa|locked/i)
      await updateUser(page, row, edit => edit.getByTestId('admin-user-lock').uncheck())
      await expect(row).toContainText(/đang hoạt động|active/i)
      await signIn(userPage, email, newPassword)
    })

    await test.step('Issue a reset, consume it and sign in with the new password', async () => {
      await openControl(row.getByTestId('admin-user-reset'))
      const reset = page.getByTestId('admin-action-dialog')
      await openControl(reset.getByTestId('admin-action-submit'))
      const issuedReset = reset.getByTestId('admin-issued-url')
      await expect(issuedReset).toBeFocused()
      const resetUrl = await issuedReset.inputValue()
      const parsedReset = new URL(resetUrl)
      expect(parsedReset.pathname === '/reset-password' && !parsedReset.search && /^#token=[A-Za-z0-9_-]{43}$/.test(parsedReset.hash)).toBe(true)
      const close = reset.getByTestId('admin-issued-close')
      await expect(close).toBeEnabled()
      await openControl(close)
      await openAccountLink(userPage, resetUrl, '/reset-password')
      await fillNewPassword(userPage, resetPassword)
      await userPage.getByTestId('account-link-submit').press('Enter')
      await expect(userPage.getByTestId('account-link-complete')).toBeVisible()
      expect((await userPage.request.get(`${api}/auth/me`, { timeout: actionTimeout })).status()).toBe(401)
      await signIn(userPage, email, resetPassword)
    })

    await test.step('Verify the audit log and accessibility', async () => {
      await openControl(page.getByTestId('admin-tab-audit'))
      for (const action of ['account_role_changed', 'account_quota_changed', 'account_disabled', 'account_enabled', 'password_reset_issued']) {
        await expect(page.getByTestId('admin-audit-row').filter({ hasText: email }).and(page.locator(`[data-action="${action}"]`)).first()).toBeVisible()
      }
      const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    })
  } finally {
    await Promise.allSettled([guest.close(), auth.dispose()])
  }
})
