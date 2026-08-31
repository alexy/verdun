import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import ts from 'typescript'

const source = await readFile('src/core/auth-ui.ts', 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: 'auth-ui.ts',
  reportDiagnostics: true,
})
if (javascript.diagnostics?.length) {
  throw new Error(ts.formatDiagnostics(javascript.diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }))
}

const server = createServer((request, response) => {
  if (request.url === '/auth-ui.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    response.end(javascript.outputText)
    return
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(`<!doctype html><html><body><main id="auth"></main><script type="module">
    window.authUi = await import('/auth-ui.js')
    window.authReady = true
  </script></body></html>`)
})

await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})

const address = server.address()
if (!address || typeof address === 'string') throw new Error('auth UI smoke server did not bind')

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${address.port}/`)
  await page.waitForFunction(() => window.authReady === true)
  await page.evaluate(() => {
    window.authCalls = []
    window.authPending = {}
    const deferred = (key) => new Promise((resolve, reject) => {
      window.authPending[key] = { resolve, reject }
    })
    window.authController = window.authUi.mountVerdunAuth(document.querySelector('#auth'), {
      initialIntent: 'sign_up',
      continuations: { signUp: 'to continue', logIn: 'to return' },
      note: 'Context <strong>stays text</strong>.',
      adapters: {
        signUp(input) {
          window.authCalls.push({ action: 'sign_up', input })
          return deferred('sign_up')
        },
        requestLoginCode(input) {
          window.authCalls.push({ action: 'request_code', input })
          return deferred('request_code')
        },
        logInWithPassword(input) {
          window.authCalls.push({ action: 'password', input })
          return deferred('password')
        },
        completeChallenge(input) {
          window.authCalls.push({ action: 'challenge', input })
          return deferred('challenge')
        },
        async mountGoogle() {
          return false
        },
      },
      onAuthenticated(account) {
        window.authCalls.push({ action: 'authenticated', account })
      },
      onNotice(message) {
        window.authCalls.push({ action: 'notice', message })
      },
      errorMessage(error) {
        return error instanceof Error ? error.message : String(error)
      },
    })
  })

  await expectText(page, '.verdun-auth__heading', 'Sign up to continue')
  await expectText(page, '.verdun-auth__note', 'Context <strong>stays text</strong>.')
  await assertCount(page, '.verdun-auth__note strong', 0, 'app notes must be escaped')
  await assertCount(page, '[role="tab"][data-verdun-auth-intent]', 2, 'persistent Sign up / Log in choices')
  await page.waitForFunction(() => !document.querySelector('[data-verdun-auth-google-group]'))

  await page.getByLabel('Email').fill('friend@example.test')
  await page.getByLabel('Choose a password (10+ characters)').fill('correct horse battery staple')
  await page.getByRole('button', { name: 'Sign up', exact: true }).last().click()
  await expectText(page, '.verdun-auth__submit', 'Sending verification…')
  await assert(page, '.verdun-auth__submit:disabled', 'sign-up submit should disable immediately')
  await assertCount(page, '[data-verdun-auth-google-group]', 0, 'unavailable provider must stay hidden while email is pending')
  await page.locator('.verdun-auth__submit').dispatchEvent('click')
  await assertCallCount(page, 'sign_up', 1, 'sign-up must not submit twice while pending')
  await page.evaluate(() => window.authPending.sign_up.resolve({ challengeId: 'signup-challenge' }))

  await expectText(page, '.verdun-auth__heading', 'Check your email to finish signing up')
  await expectText(page, '.verdun-auth__challenge-copy', 'If this email can be used to sign up')
  await assertCount(page, '[role="tab"][data-verdun-auth-intent]', 2, 'intent choices during challenge')
  await assertState(page, { intent: 'sign_up', stage: 'challenge', email: 'friend@example.test', challengePurpose: 'verify_email' })

  await page.getByRole('tab', { name: 'Log in' }).click()
  await expectText(page, '.verdun-auth__heading', 'Log in to return')
  await expectText(page, '.verdun-auth__hint', 'For existing accounts only. A login code does not create an account.')
  await assertInputValue(page, '#auth input[name="email"]', 'friend@example.test', 'email should survive intent changes')
  await assertState(page, { intent: 'log_in', loginMethod: 'email_code', stage: 'credentials', challengePurpose: null })

  await page.getByRole('button', { name: 'Email me a login code' }).click()
  await expectText(page, '.verdun-auth__submit', 'Sending code…')
  await assert(page, '.verdun-auth__submit:disabled', 'login-code submit should disable immediately')
  await page.locator('.verdun-auth__submit').dispatchEvent('click')
  await assertCallCount(page, 'request_code', 1, 'login code must not submit twice while pending')
  await page.evaluate(() => window.authPending.request_code.reject(new Error('Delivery failed safely.')))
  await expectText(page, '.verdun-auth__error', 'Delivery failed safely.')
  await assertInputValue(page, '#auth input[name="email"]', 'friend@example.test', 'email should survive errors')

  await page.getByRole('tab', { name: 'Password', exact: true }).click()
  await assertCount(page, '.verdun-auth__error:not(:empty)', 0, 'changing methods should clear inline errors')
  await page.getByLabel('Password', { exact: true }).fill('wrong password value')
  await page.getByRole('tab', { name: 'Email code' }).click()
  await page.getByRole('tab', { name: 'Password', exact: true }).click()
  await assertInputValue(page, '#auth input[name="password"]', '', 'password should clear on method changes')
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery staple')
  await page.getByRole('button', { name: 'Log in', exact: true }).last().click()
  await expectText(page, '.verdun-auth__submit', 'Logging in…')
  await page.evaluate(() => window.authPending.password.resolve({ id: 'account-1' }))
  await page.waitForFunction(() => window.authCalls.some((entry) => entry.action === 'authenticated'))

  await page.getByRole('tab', { name: 'Email code' }).click()
  await page.getByRole('button', { name: 'Email me a login code' }).click()
  await page.evaluate(() => window.authPending.request_code.resolve({ challengeId: 'login-challenge' }))
  await expectText(page, '.verdun-auth__heading', 'Check your email to log in')
  await expectText(page, '.verdun-auth__challenge-copy', 'If an account uses that address')
  await page.getByLabel('Six-digit code').fill('12a34b56')
  await assertInputValue(page, '#auth input[name="code"]', '123456', 'code input should retain only six digits')
  await page.getByRole('button', { name: 'Confirm code' }).click()
  await expectText(page, '.verdun-auth__submit', 'Confirming…')
  await page.evaluate(() => window.authPending.challenge.reject(new Error('That code did not work.')))
  await expectText(page, '.verdun-auth__error', 'That code did not work.')
  await assertInputValue(page, '#auth input[name="code"]', '', 'code should clear after a failed attempt')
  await page.getByRole('tab', { name: 'Sign up' }).click()
  await assertState(page, { intent: 'sign_up', stage: 'credentials', email: 'friend@example.test', challengePurpose: null })
  if (await page.locator('input[name="code"]').count()) throw new Error('code input survived leaving its challenge')

  await page.evaluate(() => window.authController.destroy())
  await assertCount(page, '#auth > *', 0, 'destroy should clear the mounted UI')

  await page.evaluate(() => {
    const resolved = async () => ({ challengeId: 'unused' })
    window.authController = window.authUi.mountVerdunAuth(document.querySelector('#auth'), {
      adapters: {
        signUp: resolved,
        requestLoginCode: resolved,
        logInWithPassword: async () => ({ id: 'unused' }),
        completeChallenge: async () => ({ id: 'unused' }),
        mountGoogle(host) {
          host.innerHTML = '<button type="button">Continue with Google</button>'
          return true
        },
      },
      onAuthenticated() {},
    })
  })
  await expectText(page, '.verdun-auth__provider-hint', 'Continue with Google signs you up if you’re new and logs you in if you already have an account.')
  await expectText(page, '[data-verdun-auth-google]', 'Continue with Google')
  await page.evaluate(() => window.authController.destroy())
  console.log('auth UI smoke passed')
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}

async function expectText(page, selector, expected) {
  await page.waitForFunction(([target, text]) => document.querySelector(target)?.textContent?.includes(text), [selector, expected])
}

async function assert(page, selector, message) {
  if (await page.locator(selector).count() === 0) throw new Error(message)
}

async function assertCount(page, selector, expected, label) {
  const actual = await page.locator(selector).count()
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, found ${actual}`)
}

async function assertCallCount(page, action, expected, label) {
  const actual = await page.evaluate((name) => window.authCalls.filter((entry) => entry.action === name).length, action)
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, found ${actual}`)
}

async function assertInputValue(page, selector, expected, label) {
  const actual = await page.locator(selector).inputValue()
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`)
}

async function assertState(page, expected) {
  const actual = await page.evaluate(() => window.authController.getState())
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`auth state ${key}: expected ${JSON.stringify(value)}, found ${JSON.stringify(actual[key])}`)
  }
}
