import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5174/rbage/'
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ?? (existsSync('/opt/homebrew/bin/chromium') ? '/opt/homebrew/bin/chromium' : undefined)
const browser = await chromium.launch(chromiumExecutable ? { executablePath: chromiumExecutable } : undefined)
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByText('Verdun').first().waitFor()
  await page.locator('.news-card').first().waitFor()

  const card = page.locator('.news-card').first()
  const include = card.getByRole('button', { name: /Include/ })
  const skip = card.getByRole('button', { name: /Skip/ })
  await include.scrollIntoViewIfNeeded()
  await include.waitFor()
  await skip.waitFor()

  const includeBox = await include.boundingBox()
  const skipBox = await skip.boundingBox()
  if (!includeBox || !skipBox) throw new Error('responsive vote buttons are not visible')
  if (includeBox.width < 84 || includeBox.height < 40 || skipBox.width < 72 || skipBox.height < 40) {
    throw new Error(`responsive vote buttons are too small: include=${JSON.stringify(includeBox)} skip=${JSON.stringify(skipBox)}`)
  }
  if (includeBox.x < 0 || includeBox.x + includeBox.width > 390 || skipBox.x < 0 || skipBox.x + skipBox.width > 390) {
    throw new Error(`responsive vote buttons overflow the viewport: include=${JSON.stringify(includeBox)} skip=${JSON.stringify(skipBox)}`)
  }

  await include.click()
  await page.locator('.news-card.included').first().waitFor()
  if (await include.getAttribute('aria-pressed') !== 'true') {
    throw new Error('responsive include button did not expose pressed state after click')
  }

  await page.getByPlaceholder(/Ask for more/).fill('More clickable mobile editorial controls.')
  await page.getByRole('button', { name: /Save/ }).click()
  await page.getByText('More clickable mobile editorial controls.').first().waitFor()
} finally {
  await browser.close()
}
