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
  await page.locator('.source-health').getByText('Coverage gaps').waitFor()
  const apacheArrowGap = page.locator('.source-gaps li', { hasText: 'Apache Arrow' })
  await apacheArrowGap.waitFor()
  await apacheArrowGap.getByText(/apache arrow/).waitFor()
  await page.locator('.query-plans').getByText('Crawler query plan · 23 projects').waitFor()
  await page.locator('.query-plans summary').click()
  await page.locator('.query-plans').getByText('BAML baml').waitFor()
  await page.locator('.query-plans').getByText('#dspy').waitFor()
  await page.getByText('CocoIndex belongs in this week').first().waitFor()
  if (await page.getByText(/Local fallback:/).count()) throw new Error('app fell back to the embedded seed instead of the static snapshot')
  await page.locator('.readiness').getByRole('heading', { name: 'Publishing readiness' }).waitFor()
  const markdownLink = page.locator('.draft-actions').getByRole('link', { name: /Markdown/ })
  await markdownLink.waitFor()
  const markdownHref = await markdownLink.getAttribute('href')
  if (!markdownHref?.startsWith('data:text/markdown')) throw new Error('draft Markdown download link is missing')
  const stateLink = page.locator('.draft-actions').getByRole('link', { name: /Editorial state/ })
  await stateLink.waitFor()
  const initialStateHref = await stateLink.getAttribute('href')
  if (!initialStateHref?.startsWith('data:application/json')) throw new Error('editorial state download link is missing')
  await page.locator('.news-card').first().getByText('Credo fit').waitFor()
  await page.locator('.news-card').first().getByText('Evidence').waitFor()
  await page.locator('.news-card').first().getByRole('link', { name: /permalink/i }).waitFor()
  await page.getByTitle('Upvote').first().click()
  await page.locator('.news-card.included').first().waitFor()
  await page.getByTitle('Downvote').nth(1).click()
  await page.locator('.news-card.rejected').first().waitFor()
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
  const stateHref = await stateLink.getAttribute('href')
  const stateJson = JSON.parse(decodeURIComponent(stateHref.split(',')[1] ?? ''))
  if (!Object.values(stateJson.votes ?? {}).includes(1) || !Object.values(stateJson.votes ?? {}).includes(-1)) {
    throw new Error('editorial state export did not include current votes')
  }
  if (!stateJson.focuses?.some((focus) => focus.text.includes('More local-first Rust graph databases'))) {
    throw new Error('editorial state export did not include the saved focus')
  }
  await page.locator('.draft-preview__body').getByRole('heading', { name: 'Editorial brief' }).waitFor()
  await page.locator('.draft-preview__body').getByText('This week: More local-first Rust graph databases and typed query planners.').waitFor()
} finally {
  await browser.close()
}
