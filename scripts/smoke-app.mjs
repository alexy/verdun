import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5176'
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ?? (existsSync('/opt/homebrew/bin/chromium') ? '/opt/homebrew/bin/chromium' : undefined)
const browser = await chromium.launch(chromiumExecutable ? { executablePath: chromiumExecutable } : undefined)
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByText('Verdun').first().waitFor()
  await page.getByText('Strongly typed AI and data news').first().waitFor()
  await page.getByTitle('Include').first().click()
  await page.getByPlaceholder(/Ask for more/).fill('More local-first Rust graph databases and typed query planners.')
  await page.getByRole('button', { name: /Save/ }).click()
  await page.getByText('More local-first Rust graph databases').first().waitFor()
} finally {
  await browser.close()
}
