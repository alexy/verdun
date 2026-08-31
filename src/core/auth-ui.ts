export const verdunAuthIntents = ['sign_up', 'log_in'] as const

export type VerdunAuthIntent = typeof verdunAuthIntents[number]
export type VerdunAuthLoginMethod = 'email_code' | 'password'
export type VerdunAuthChallengePurpose = 'verify_email' | 'passwordless_login'
export type VerdunAuthStage = 'credentials' | 'challenge'

export type VerdunAuthChallengeReceipt = {
  challengeId: string
}

export type VerdunAuthGoogleMountResult = boolean | void | (() => void)

export type VerdunAuthGoogleMountContext<Account> = {
  intent: VerdunAuthIntent
  onAuthenticated: (account: Account) => Promise<void>
  onError: (error: unknown) => void
}

export type VerdunAuthAdapters<Account> = {
  signUp: (input: { email: string, password: string }) => Promise<VerdunAuthChallengeReceipt>
  requestLoginCode: (input: { email: string }) => Promise<VerdunAuthChallengeReceipt>
  logInWithPassword: (input: { email: string, password: string }) => Promise<Account>
  completeChallenge: (input: {
    challengeId: string
    purpose: VerdunAuthChallengePurpose
    code: string
  }) => Promise<Account>
  mountGoogle?: (
    host: HTMLElement,
    context: VerdunAuthGoogleMountContext<Account>,
  ) => VerdunAuthGoogleMountResult | Promise<VerdunAuthGoogleMountResult>
}

export type VerdunAuthContinuationCopy = {
  signUp?: string
  logIn?: string
}

export type VerdunAuthMountOptions<Account> = {
  adapters: VerdunAuthAdapters<Account>
  initialIntent?: VerdunAuthIntent
  continuations?: VerdunAuthContinuationCopy
  note?: string
  onAuthenticated: (account: Account) => void | Promise<void>
  onNotice?: (message: string) => void
  errorMessage?: (error: unknown) => string
}

export type VerdunAuthState = Readonly<{
  intent: VerdunAuthIntent
  loginMethod: VerdunAuthLoginMethod
  stage: VerdunAuthStage
  email: string
  challengePurpose: VerdunAuthChallengePurpose | null
  busy: boolean
}>

export type VerdunAuthController = {
  getState: () => VerdunAuthState
  setIntent: (intent: VerdunAuthIntent) => void
  destroy: () => void
}

export const verdunAuthCopy = {
  signUp: 'Sign up',
  logIn: 'Log in',
  email: 'Email',
  newPassword: 'Choose a password (10+ characters)',
  currentPassword: 'Password',
  emailCode: 'Email code',
  password: 'Password',
  signUpSubmit: 'Sign up',
  signUpPending: 'Sending verification…',
  requestCodeSubmit: 'Email me a login code',
  requestCodePending: 'Sending code…',
  passwordSubmit: 'Log in',
  passwordPending: 'Logging in…',
  codeSubmit: 'Confirm code',
  codePending: 'Confirming…',
  loginCodeHint: 'For existing accounts only. A login code does not create an account.',
  providerHint: 'Continue with Google signs you up if you’re new and logs you in if you already have an account.',
  signUpChallenge: 'If this email can be used to sign up, we sent an email. Enter its six-digit code to continue.',
  loginChallenge: 'If an account uses that address, we sent an email. Enter its six-digit code to continue.',
} as const

type BusyAction = 'sign_up' | 'request_code' | 'password' | 'challenge' | 'google' | null

type MutableAuthState = {
  intent: VerdunAuthIntent
  loginMethod: VerdunAuthLoginMethod
  stage: VerdunAuthStage
  email: string
  password: string
  code: string
  challengeId: string
  challengePurpose: VerdunAuthChallengePurpose | null
  busyAction: BusyAction
  error: string
}

let nextAuthId = 0

/**
 * Mount Verdun's generic account-intent flow into an app-owned host.
 *
 * Verdun owns the Sign up / Log in state, markup, and privacy-safe copy. The
 * consuming app supplies its API adapters, optional continuation phrases, and
 * the behavior that follows authentication.
 */
export function mountVerdunAuth<Account>(
  host: HTMLElement,
  options: VerdunAuthMountOptions<Account>,
): VerdunAuthController {
  const id = `verdun-auth-${++nextAuthId}`
  const state: MutableAuthState = {
    intent: options.initialIntent === 'log_in' ? 'log_in' : 'sign_up',
    loginMethod: 'email_code',
    stage: 'credentials',
    email: '',
    password: '',
    code: '',
    challengeId: '',
    challengePurpose: null,
    busyAction: null,
    error: '',
  }

  let destroyed = false
  let renderVersion = 0
  let googleCleanup: (() => void) | null = null

  host.classList.add('verdun-auth-host')
  host.addEventListener('click', handleClick)
  host.addEventListener('input', handleInput)
  host.addEventListener('submit', handleSubmit)

  render()

  return {
    getState: () => ({
      intent: state.intent,
      loginMethod: state.loginMethod,
      stage: state.stage,
      email: state.email,
      challengePurpose: state.challengePurpose,
      busy: state.busyAction !== null,
    }),
    setIntent,
    destroy,
  }

  function render(): void {
    if (destroyed) return
    const version = ++renderVersion
    clearGoogleMount()
    const busy = state.busyAction !== null
    const heading = state.stage === 'challenge'
      ? state.challengePurpose === 'verify_email'
        ? 'Check your email to finish signing up'
        : 'Check your email to log in'
      : headingFor(state.intent, options.continuations)
    const signUpSelected = state.intent === 'sign_up'
    const logInSelected = state.intent === 'log_in'

    host.innerHTML = `
      <section class="verdun-auth" aria-labelledby="${id}-heading">
        <div class="verdun-auth__intents" role="tablist" aria-label="Account action">
          <button type="button" role="tab" id="${id}-sign-up-tab" aria-controls="${id}-panel"
            aria-selected="${signUpSelected}" class="verdun-auth__intent${signUpSelected ? ' is-active' : ''}"
            data-verdun-auth-intent="sign_up"${disabled(busy)}>${verdunAuthCopy.signUp}</button>
          <button type="button" role="tab" id="${id}-log-in-tab" aria-controls="${id}-panel"
            aria-selected="${logInSelected}" class="verdun-auth__intent${logInSelected ? ' is-active' : ''}"
            data-verdun-auth-intent="log_in"${disabled(busy)}>${verdunAuthCopy.logIn}</button>
        </div>
        <div id="${id}-panel" class="verdun-auth__panel" role="tabpanel"
          aria-labelledby="${state.intent === 'sign_up' ? `${id}-sign-up-tab` : `${id}-log-in-tab`}">
          <h2 id="${id}-heading" class="verdun-auth__heading">${escapeHtml(heading)}</h2>
          ${options.note?.trim() ? `<p class="verdun-auth__note">${escapeHtml(options.note.trim())}</p>` : ''}
          ${state.stage === 'challenge' ? challengeMarkup(busy) : credentialMarkup(busy)}
        </div>
      </section>`

    if (state.stage === 'credentials' && options.adapters.mountGoogle && !busy) {
      void mountGoogle(version)
    }
  }

  function credentialMarkup(busy: boolean): string {
    const google = options.adapters.mountGoogle && !busy ? `
      <div class="verdun-auth__google-group" data-verdun-auth-google-group>
        <div class="verdun-auth__google" data-verdun-auth-google></div>
        <p class="verdun-auth__provider-hint">${verdunAuthCopy.providerHint}</p>
        <div class="verdun-auth__divider"><span>or use email</span></div>
      </div>` : ''

    if (state.intent === 'sign_up') {
      return `${google}
        <p class="verdun-auth__hint">Create an account with your email and a password.</p>
        ${errorMarkup()}
        <form class="verdun-auth__form" data-verdun-auth-form="sign_up">
          ${emailField(busy)}
          <label class="verdun-auth__field" for="${id}-new-password">
            <span>${verdunAuthCopy.newPassword}</span>
            <input id="${id}-new-password" name="password" type="password" autocomplete="new-password"
              minlength="10" maxlength="1024" required${disabled(busy)}>
          </label>
          <button class="verdun-auth__submit" type="submit"${disabled(busy)}>
            ${state.busyAction === 'sign_up' ? verdunAuthCopy.signUpPending : verdunAuthCopy.signUpSubmit}
          </button>
        </form>
        <button class="verdun-auth__escape" type="button" data-verdun-auth-intent="log_in"${disabled(busy)}>
          Already have an account? ${verdunAuthCopy.logIn}
        </button>`
    }

    const codeSelected = state.loginMethod === 'email_code'
    return `${google}
      <div class="verdun-auth__methods" role="tablist" aria-label="Login method">
        <button type="button" role="tab" aria-selected="${codeSelected}"
          class="verdun-auth__method${codeSelected ? ' is-active' : ''}"
          data-verdun-auth-method="email_code"${disabled(busy)}>${verdunAuthCopy.emailCode}</button>
        <button type="button" role="tab" aria-selected="${!codeSelected}"
          class="verdun-auth__method${!codeSelected ? ' is-active' : ''}"
          data-verdun-auth-method="password"${disabled(busy)}>${verdunAuthCopy.password}</button>
      </div>
      <p class="verdun-auth__hint">${codeSelected
        ? verdunAuthCopy.loginCodeHint
        : 'Use the password for your existing account.'}</p>
      ${errorMarkup()}
      <form class="verdun-auth__form" data-verdun-auth-form="${codeSelected ? 'login_code' : 'login_password'}">
        ${emailField(busy)}
        ${codeSelected ? '' : `
          <label class="verdun-auth__field" for="${id}-current-password">
            <span>${verdunAuthCopy.currentPassword}</span>
            <input id="${id}-current-password" name="password" type="password" autocomplete="current-password"
              minlength="10" maxlength="1024" required${disabled(busy)}>
          </label>`}
        <button class="verdun-auth__submit" type="submit"${disabled(busy)}>
          ${loginSubmitCopy()}
        </button>
      </form>
      <button class="verdun-auth__escape" type="button" data-verdun-auth-intent="sign_up"${disabled(busy)}>
        Need an account? ${verdunAuthCopy.signUp}
      </button>`
  }

  function challengeMarkup(busy: boolean): string {
    const isSignUp = state.challengePurpose === 'verify_email'
    const notice = isSignUp ? verdunAuthCopy.signUpChallenge : verdunAuthCopy.loginChallenge
    return `
      <p class="verdun-auth__challenge-copy" role="status">${notice}</p>
      ${errorMarkup()}
      <form class="verdun-auth__form" data-verdun-auth-form="challenge">
        <label class="verdun-auth__field" for="${id}-code">
          <span>Six-digit code</span>
          <input id="${id}-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code"
            pattern="[0-9]{6}" placeholder="000000" required${disabled(busy)}>
        </label>
        <button class="verdun-auth__submit" type="submit"${disabled(busy)}>
          ${state.busyAction === 'challenge' ? verdunAuthCopy.codePending : verdunAuthCopy.codeSubmit}
        </button>
      </form>
      <div class="verdun-auth__challenge-actions">
        <button class="verdun-auth__escape" type="button" data-verdun-auth-restart${disabled(busy)}>Start over</button>
        <button class="verdun-auth__escape" type="button"
          data-verdun-auth-intent="${isSignUp ? 'log_in' : 'sign_up'}"${disabled(busy)}>
          ${isSignUp ? 'Already have an account? Log in' : 'Need an account? Sign up'}
        </button>
      </div>`
  }

  function emailField(busy: boolean): string {
    return `
      <label class="verdun-auth__field" for="${id}-email">
        <span>${verdunAuthCopy.email}</span>
        <input id="${id}-email" name="email" type="email" autocomplete="email"
          value="${escapeHtml(state.email)}" required${disabled(busy)}>
      </label>`
  }

  function errorMarkup(): string {
    return `<p class="verdun-auth__error" role="alert" aria-live="assertive">${escapeHtml(state.error)}</p>`
  }

  function loginSubmitCopy(): string {
    if (state.loginMethod === 'email_code') {
      return state.busyAction === 'request_code'
        ? verdunAuthCopy.requestCodePending
        : verdunAuthCopy.requestCodeSubmit
    }
    return state.busyAction === 'password'
      ? verdunAuthCopy.passwordPending
      : verdunAuthCopy.passwordSubmit
  }

  function handleInput(event: Event): void {
    const input = event.target as HTMLInputElement | null
    if (!input?.name) return
    if (input.name === 'email') state.email = input.value
    else if (input.name === 'password') state.password = input.value
    else if (input.name === 'code') {
      state.code = input.value.replace(/\D/g, '').slice(0, 6)
      input.value = state.code
    }
  }

  function handleClick(event: Event): void {
    const target = event.target as HTMLElement | null
    const button = target?.closest<HTMLButtonElement>('button')
    if (!button || !host.contains(button) || state.busyAction !== null) return
    const intent = button.dataset.verdunAuthIntent
    if (intent === 'sign_up' || intent === 'log_in') {
      setIntent(intent)
      return
    }
    const method = button.dataset.verdunAuthMethod
    if (method === 'email_code' || method === 'password') {
      selectLoginMethod(method)
      return
    }
    if (button.hasAttribute('data-verdun-auth-restart')) restart()
  }

  function handleSubmit(event: Event): void {
    event.preventDefault()
    if (state.busyAction !== null) return
    const form = event.target as HTMLFormElement | null
    const action = form?.dataset.verdunAuthForm
    if (action === 'sign_up') void submitSignUp()
    else if (action === 'login_code') void submitLoginCode()
    else if (action === 'login_password') void submitPasswordLogin()
    else if (action === 'challenge') void submitChallenge()
  }

  async function submitSignUp(): Promise<void> {
    const email = state.email.trim()
    const password = state.password
    beginBusy('sign_up')
    try {
      const receipt = await options.adapters.signUp({ email, password })
      beginChallenge(receipt, 'verify_email')
    } catch (error) {
      fail(error, { clearPassword: true })
    }
  }

  async function submitLoginCode(): Promise<void> {
    const email = state.email.trim()
    beginBusy('request_code')
    try {
      const receipt = await options.adapters.requestLoginCode({ email })
      beginChallenge(receipt, 'passwordless_login')
    } catch (error) {
      fail(error)
    }
  }

  async function submitPasswordLogin(): Promise<void> {
    const email = state.email.trim()
    const password = state.password
    beginBusy('password')
    try {
      const account = await options.adapters.logInWithPassword({ email, password })
      state.password = ''
      await authenticate(account)
    } catch (error) {
      fail(error, { clearPassword: true })
    }
  }

  async function submitChallenge(): Promise<void> {
    const challengeId = state.challengeId
    const purpose = state.challengePurpose
    const code = state.code
    if (!challengeId || !purpose) {
      fail(new Error('email_challenge_invalid'), { clearCode: true })
      return
    }
    beginBusy('challenge')
    try {
      const account = await options.adapters.completeChallenge({ challengeId, purpose, code })
      state.code = ''
      await authenticate(account)
    } catch (error) {
      fail(error, { clearCode: true })
    }
  }

  function beginBusy(action: Exclude<BusyAction, null>): void {
    state.busyAction = action
    state.error = ''
    render()
  }

  function beginChallenge(
    receipt: VerdunAuthChallengeReceipt,
    purpose: VerdunAuthChallengePurpose,
  ): void {
    if (destroyed) return
    const challengeId = receipt?.challengeId?.trim()
    if (!challengeId) {
      fail(new Error('email_challenge_invalid'))
      return
    }
    state.challengeId = challengeId
    state.challengePurpose = purpose
    state.stage = 'challenge'
    state.password = ''
    state.code = ''
    state.busyAction = null
    state.error = ''
    const notice = purpose === 'verify_email'
      ? verdunAuthCopy.signUpChallenge
      : verdunAuthCopy.loginChallenge
    notify(notice)
    render()
  }

  async function authenticate(account: Account): Promise<void> {
    if (destroyed) return
    try {
      await options.onAuthenticated(account)
      if (!destroyed) {
        state.busyAction = null
        state.error = ''
        render()
      }
    } catch (error) {
      fail(error)
    }
  }

  function fail(
    error: unknown,
    clear: { clearPassword?: boolean, clearCode?: boolean } = {},
  ): void {
    if (destroyed) return
    if (clear.clearPassword) state.password = ''
    if (clear.clearCode) state.code = ''
    state.busyAction = null
    state.error = messageFor(error, options.errorMessage)
    render()
  }

  function notify(message: string): void {
    try {
      options.onNotice?.(message)
    } catch {
      // Notices are auxiliary; an app toast must not break the auth state.
    }
  }

  function setIntent(intent: VerdunAuthIntent): void {
    if (destroyed || state.busyAction !== null || state.intent === intent && state.stage === 'credentials') return
    state.intent = intent
    state.loginMethod = 'email_code'
    resetTransientState()
    render()
  }

  function selectLoginMethod(method: VerdunAuthLoginMethod): void {
    if (destroyed || state.busyAction !== null || state.intent !== 'log_in' || state.loginMethod === method) return
    state.loginMethod = method
    resetTransientState()
    render()
  }

  function restart(): void {
    if (destroyed || state.busyAction !== null) return
    resetTransientState()
    render()
  }

  function resetTransientState(): void {
    state.stage = 'credentials'
    state.password = ''
    state.code = ''
    state.challengeId = ''
    state.challengePurpose = null
    state.error = ''
  }

  async function mountGoogle(version: number): Promise<void> {
    const googleHost = host.querySelector<HTMLElement>('[data-verdun-auth-google]')
    const googleGroup = host.querySelector<HTMLElement>('[data-verdun-auth-google-group]')
    if (!googleHost || !googleGroup || !options.adapters.mountGoogle) return
    try {
      const mounted = await options.adapters.mountGoogle(googleHost, {
        intent: state.intent,
        onAuthenticated: async (account) => {
          if (destroyed || version !== renderVersion || state.busyAction !== null) return
          beginBusy('google')
          await authenticate(account)
        },
        onError: (error) => {
          if (!destroyed && version === renderVersion) fail(error)
        },
      })
      if (destroyed || version !== renderVersion) {
        if (typeof mounted === 'function') mounted()
        return
      }
      if (mounted === false) googleGroup.remove()
      else if (typeof mounted === 'function') googleCleanup = mounted
    } catch {
      if (!destroyed && version === renderVersion) googleGroup.remove()
    }
  }

  function clearGoogleMount(): void {
    if (!googleCleanup) return
    try {
      googleCleanup()
    } finally {
      googleCleanup = null
    }
  }

  function destroy(): void {
    if (destroyed) return
    destroyed = true
    renderVersion += 1
    clearGoogleMount()
    host.removeEventListener('click', handleClick)
    host.removeEventListener('input', handleInput)
    host.removeEventListener('submit', handleSubmit)
    host.classList.remove('verdun-auth-host')
    host.replaceChildren()
    state.password = ''
    state.code = ''
    state.challengeId = ''
  }
}

function headingFor(
  intent: VerdunAuthIntent,
  continuations: VerdunAuthContinuationCopy | undefined,
): string {
  const label = intent === 'sign_up' ? verdunAuthCopy.signUp : verdunAuthCopy.logIn
  const continuation = (intent === 'sign_up' ? continuations?.signUp : continuations?.logIn)?.trim()
  return continuation ? `${label} ${continuation}` : label
}

function disabled(value: boolean): string {
  return value ? ' disabled aria-disabled="true"' : ''
}

function messageFor(error: unknown, format: VerdunAuthMountOptions<unknown>['errorMessage']): string {
  try {
    const formatted = format?.(error)?.trim()
    if (formatted) return formatted
  } catch {
    // Fall through to the generic browser-safe message.
  }
  return 'Something went wrong. Please try again.'
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character] ?? character)
}
