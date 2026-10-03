import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const javascript = await readFile('lib/src/core/photo-upload.js', 'utf8')
const css = await readFile('src/core/photo-style.css', 'utf8')
const server = createServer((request, response) => {
  if (request.url === '/photo.js') {
    response.writeHead(200, { 'content-type': 'text/javascript' })
    response.end(javascript)
  } else if (request.url === '/photo.css') {
    response.writeHead(200, { 'content-type': 'text/css' })
    response.end(css)
  } else {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/photo.css"></head><body><main id="picker"></main><script type="module">
      import { mountPhotoPicker } from '/photo.js'
      window.mount = (photo = null) => {
        window.events = []
        window.errors = []
        window.busy = []
        window.picker = mountPhotoPicker(document.querySelector('#picker'), {
          photo,
          onChange: photo => window.events.push(photo),
          onError: error => window.errors.push(error),
          onBusyChange: busy => window.busy.push(busy),
        })
      }
      window.mount()
      window.ready = true
    </script></body></html>`)
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true })
const image = (width, height, color) => sharp({ create: { width, height, channels: 3, background: color } })
const fixtures = {
  png: await image(64, 32, '#246').png().toBuffer(),
  webp: await image(50, 25, '#482').webp().toBuffer(),
  large: await image(3072, 2048, '#d83').jpeg().toBuffer(),
  oriented: await image(80, 40, '#456').withMetadata({ orientation: 6 }).jpeg().toBuffer(),
}
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', error => errors.push(error))
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => window.ready)
  assert.equal(await page.evaluate(() => window.events.length), 0, 'mount must not emit an initial change')
  await page.evaluate(() => { window.originalInput = document.querySelector('input[type=file]') })

  await select(page, 'photo.png', 'image/png', fixtures.png)
  const initial = await draft(page)
  assert.match(initial.imageDataUrl, /^data:image\/jpeg;base64,/)
  assert.equal(initial.imageAlt, '')
  assert.equal((await metadata(initial)).width, 64)
  assert.ok(await page.getByRole('button', { name: 'Replace photo', exact: true }).isVisible())
  assert.ok(await page.locator('.verdun-photo__image').isVisible())
  await page.getByLabel('Photo description (optional)').fill('<script>leaf</script>')
  assert.equal((await draft(page)).imageAlt, '<script>leaf</script>')
  assert.equal(await page.locator('.verdun-photo__image').getAttribute('alt'), '<script>leaf</script>')
  assert.equal(await page.locator('#picker script').count(), 0)
  assert.equal(await page.evaluate(() => window.originalInput === document.querySelector('input[type=file]')), true, 'input identity remains stable')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile layout stays within viewport')
  const cloned = await page.evaluate(() => { const x = window.picker.getPhoto(); x.imageAlt = 'mutated'; return window.picker.getPhoto() })
  assert.equal(cloned.imageAlt, '<script>leaf</script>', 'callers cannot mutate picker state')

  await select(page, 'photo.webp', 'image/webp', fixtures.webp)
  assert.equal((await metadata(await draft(page))).width, 50)
  assert.equal((await draft(page)).imageAlt, '', 'replacement starts a new description')
  await select(page, 'large.jpeg', 'image/jpeg', fixtures.large)
  assert.equal((await metadata(await draft(page))).width, 2048)
  assert.ok(Buffer.from((await draft(page)).imageDataUrl.split(',')[1], 'base64').length <= 1024 * 1024)
  await select(page, 'oriented.jpeg', 'image/jpeg', fixtures.oriented)
  const oriented = await metadata(await draft(page))
  assert.equal(oriented.width, 40)
  assert.equal(oriented.height, 80)
  assert.equal(oriented.exif, undefined)
  assert.equal(oriented.orientation, undefined)

  const retained = await draft(page)
  await select(page, 'broken.png', 'image/png', Buffer.from('not an image'))
  await page.getByRole('alert').waitFor({ state: 'visible' })
  assert.deepEqual(await draft(page), retained, 'failed replacement preserves the previous photo')
  await select(page, 'not-photo.svg', 'image/svg+xml', Buffer.from('<svg/>'))
  assert.match(await page.getByRole('alert').textContent(), /JPEG, PNG, or WebP/)
  await select(page, 'too-large.jpg', 'image/jpeg', Buffer.alloc(20 * 1024 * 1024 + 1))
  assert.match(await page.getByRole('alert').textContent(), /20 MiB/)
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click()
  assert.equal(await draft(page), null)
  assert.equal(await page.getByRole('alert').isVisible(), false)
  assert.equal(await page.evaluate(() => window.errors.at(-1)), '')
  assert.equal(await page.locator('.verdun-photo__preview').isVisible(), false)

  await transfer(page, 'paste', fixtures.png)
  await waitReady(page)
  assert.equal((await metadata(await draft(page))).width, 64)
  await transfer(page, 'drop', fixtures.webp, 'image/webp')
  await waitReady(page)
  assert.equal((await metadata(await draft(page))).width, 50)

  // Hold the first decode while a second selection completes. It must neither
  // overwrite the new photo nor clear its busy state when eventually released.
  await page.evaluate(() => {
    window.nativeBitmap = window.createImageBitmap.bind(window)
    window.closedBitmaps = 0
    window.createImageBitmap = async (file, ...args) => {
      if (file.name.startsWith('held')) await new Promise(resolve => { window.releaseBitmap = resolve })
      const bitmap = await window.nativeBitmap(file, ...args)
      const close = bitmap.close.bind(bitmap)
      bitmap.close = () => { window.closedBitmaps++; close() }
      return bitmap
    }
  })
  await page.locator('input[type=file]').setInputFiles({ name: 'held.png', mimeType: 'image/png', buffer: fixtures.png })
  await page.waitForFunction(() => window.releaseBitmap && window.picker.isBusy())
  await select(page, 'new.webp', 'image/webp', fixtures.webp)
  const recent = await draft(page)
  await page.evaluate(() => window.releaseBitmap())
  await page.waitForFunction(() => window.closedBitmaps === 2)
  assert.deepEqual(await draft(page), recent)
  assert.equal(await page.evaluate(() => window.picker.isBusy()), false)

  await page.evaluate(() => { window.releaseBitmap = null })
  await page.locator('input[type=file]').setInputFiles({ name: 'held-remove.png', mimeType: 'image/png', buffer: fixtures.png })
  await page.waitForFunction(() => !!window.releaseBitmap)
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click()
  await page.evaluate(() => window.releaseBitmap())
  await page.waitForFunction(() => window.closedBitmaps === 3)
  assert.equal(await draft(page), null, 'removal wins over an in-flight selection')
  assert.equal(await page.evaluate(() => window.picker.isBusy()), false)

  await page.evaluate(() => { window.releaseBitmap = null })
  await page.locator('input[type=file]').setInputFiles({ name: 'held-destroy.png', mimeType: 'image/png', buffer: fixtures.png })
  await page.waitForFunction(() => !!window.releaseBitmap)
  const beforeDestroy = await page.evaluate(() => { const count = window.events.length; window.picker.destroy(); window.releaseBitmap(); return count })
  await page.waitForFunction(() => window.closedBitmaps === 4)
  assert.equal(await page.locator('#picker > *').count(), 0)
  assert.equal(await page.evaluate(() => window.events.length), beforeDestroy, 'destroy suppresses late change delivery')
  assert.equal(await page.evaluate(() => window.busy.at(-1)), false)

  // Exercise the Image.decode fallback and prove every temporary object URL is
  // revoked, including on a decoder failure.
  await page.evaluate((photo) => {
    window.createImageBitmap = undefined
    window.urlsCreated = 0
    window.urlsRevoked = 0
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = value => { window.urlsCreated++; return create(value) }
    URL.revokeObjectURL = value => { window.urlsRevoked++; return revoke(value) }
    window.mount(photo)
  }, retained)
  assert.deepEqual(await draft(page), retained, 'serialized local draft restores')
  assert.equal(await page.evaluate(() => window.events.length), 0)
  await select(page, 'fallback.png', 'image/png', fixtures.png)
  assert.equal((await metadata(await draft(page))).width, 64)
  await select(page, 'fallback-bad.png', 'image/png', Buffer.from('no image here'))
  assert.equal(await page.evaluate(() => window.urlsCreated), 2)
  assert.equal(await page.evaluate(() => window.urlsRevoked), 2)
  await page.evaluate(() => window.picker.destroy())
  assert.deepEqual(errors, [])
  console.log('photo UI smoke passed: selection, conversion, preview/alt/removal, paste/drop, metadata/orientation, mobile layout, async replacement/removal/destroy, URL cleanup, draft restore')
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}

async function waitReady(page) {
  await page.waitForFunction(() => !window.picker.isBusy())
}
async function select(page, name, mimeType, buffer) {
  await page.locator('input[type=file]').setInputFiles({ name, mimeType, buffer })
  await waitReady(page)
}
async function draft(page) { return page.evaluate(() => window.picker.getPhoto()) }
async function metadata(photo) { return sharp(Buffer.from(photo.imageDataUrl.split(',')[1], 'base64')).metadata() }
async function transfer(page, eventType, buffer, mimeType = 'image/png') {
  await page.evaluate(({ eventType, base64, mimeType }) => {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'transferred-photo', { type: mimeType }))
    const event = eventType === 'paste'
      ? new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })
      : new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })
    document.querySelector('.verdun-photo').dispatchEvent(event)
    if (!event.defaultPrevented) throw new Error('image transfer did not prevent default navigation/paste')
  }, { eventType, base64: buffer.toString('base64'), mimeType })
}
