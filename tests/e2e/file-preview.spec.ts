import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, type APIRequestContext } from '@playwright/test'
import type { components } from '../../src/lib/api-schema'
import { fixtureAccounts, ownerTest as test } from './fixtures'

function samplePdf() {
  const instructions = 'BT /F1 16 Tf 15 45 Td (Cloud Drive preview) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 260 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${instructions.length} >>\nstream\n${instructions}\nendstream`,
  ]
  let bytes = '%PDF-1.4\n'
  const offsets: number[] = [0]
  objects.forEach((object, index) => {
    offsets.push(bytes.length)
    bytes += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const directory = bytes.length
  bytes += 'xref\n0 6\n0000000000 65535 f \n'
  for (const offset of offsets.slice(1)) bytes += `${String(offset).padStart(10, '0')} 00000 n \n`
  return Buffer.from(bytes + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${directory}\n%%EOF\n`)
}

async function upload(owner: APIRequestContext, name: string, mimeType: string, buffer: Buffer) {
  const response = await owner.post('/api/v1/files', { multipart: { file: { name, mimeType, buffer } } })
  expect(response.status()).toBe(201)
  return (await response.json() as components['schemas']['FileResponse']).data
}

test('PREVIEW-01 displays plain text and PDF safely and rechecks shared access', async ({ page, ownerRequest: owner, viewerRequest: viewer }) => {
  test.setTimeout(75_000)
  const id = randomUUID().slice(0, 8)
  const content = 'Mô tả thử <strong>văn bản</strong>\nDòng tiếp theo'
  const file = await upload(owner, `Ghi chú ${id}.md`, 'text/markdown', Buffer.from(content))
  const path = `/files/${file.id}`
  await page.goto(path)
  const toggle = page.getByTestId('file-preview-toggle')
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const preview = page.getByTestId('file-preview-text')
  await expect(preview).toHaveText(content)
  await expect(preview.locator('strong')).toHaveCount(0)
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(scan.violations).toEqual([])
  await toggle.press('Enter')
  await expect(preview).toHaveCount(0)

  const denied = await viewer.get(`/api/v1${path}/preview`)
  expect(denied.status()).toBe(404)
  const grant = await owner.put(`/api/v1${path}/shares`, { data: { email: fixtureAccounts.viewer } })
  expect(grant.status()).toBe(200)
  const recipient = (await grant.json() as components['schemas']['FileShareResponse']).data.recipientId
  const authorized = await viewer.get(`/api/v1${path}/preview`)
  expect(authorized.status()).toBe(200)
  expect(authorized.headers()['cache-control']).toBe('private, no-store')
  expect(await authorized.text()).toBe(content)
  expect((await owner.delete(`/api/v1${path}/shares/${recipient}`)).status()).toBe(200)
  expect((await viewer.get(`/api/v1${path}/preview`)).status()).toBe(404)

  const pdf = await upload(owner, `Tài liệu ${id}.pdf`, 'application/pdf', samplePdf())
  await page.goto(`/files/${pdf.id}`)
  await page.getByTestId('file-preview-toggle').press('Enter')
  await expect(page.getByTestId('file-preview-pdf')).toBeVisible({ timeout: 15_000 })
  const caption = page.getByText(/văn bản của trang|page text/i)
  await caption.press('Enter')
  await expect(page.getByText('Cloud Drive preview', { exact: true })).toBeVisible()
})
