import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5176/rbage/'
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ?? (existsSync('/opt/homebrew/bin/chromium') ? '/opt/homebrew/bin/chromium' : undefined)
const browser = await chromium.launch(chromiumExecutable ? { executablePath: chromiumExecutable } : undefined)
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByText('Verdun').first().waitFor()
  await page.getByText('Strongly typed AI and data news').first().waitFor()
  await page.locator('.ontology').getByRole('heading', { name: 'Strongly Typed AI ontology' }).waitFor()
  await page.locator('.source-health').getByText(/projects covered by live\/manual source matches/).waitFor()
  await page.locator('.readiness').getByRole('heading', { name: 'Publishing readiness' }).waitFor()
  const markdownLink = page.locator('.draft-actions').getByRole('link', { name: /Markdown/ })
  await markdownLink.waitFor()
  const markdownHref = await markdownLink.getAttribute('href')
  if (!markdownHref?.startsWith('data:text/markdown')) throw new Error('draft Markdown download link is missing')
  await page.locator('.news-card').first().getByText('Credo fit').waitFor()
  await page.locator('.news-card').first().getByRole('link', { name: /permalink/i }).waitFor()
  await page.getByTitle('Upvote').first().click()
  await page.getByPlaceholder(/Search titles/).fill('Pydantic')
  await page.locator('.news-card', { hasText: 'Pydantic' }).first().waitFor()
  await page.getByTitle('Clear filters').click()
  await page.getByLabel('Project').selectOption('LakeSail')
  await page.locator('.news-card', { hasText: 'LakeSail' }).first().waitFor()
  await page.getByTitle('Clear filters').click()
  await page.getByLabel('Vote status').selectOption('upvoted')
  await page.locator('.news-card.included').first().waitFor()
  await page.getByTitle('Clear filters').click()
  await page.getByPlaceholder(/Ask for more/).fill('More local-first Rust graph databases and typed query planners.')
  await page.getByRole('button', { name: /Save/ }).click()
  await page.getByText('More local-first Rust graph databases').first().waitFor()
  await page.locator('.draft-preview__body').getByRole('heading', { name: 'Editorial brief' }).waitFor()
  await page.locator('.draft-preview__body').getByText('This week: More local-first Rust graph databases and typed query planners.').waitFor()
} finally {
  await browser.close()
}
