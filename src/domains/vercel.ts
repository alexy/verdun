export type VercelFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type VercelProjectDomainsConfig = {
  token: string
  projectId: string
  teamSlug: string
  fetch: VercelFetch
  apiBaseUrl?: string
  requestTimeoutMs?: number
}

export type VercelDomainVerification = {
  type?: string
  domain?: string
  value?: string
  reason?: string
}

export type VercelProjectDomain = {
  name: string
  apexName: string | null
  projectId: string
  verified: boolean
  verification: VercelDomainVerification[]
}

export type VercelDnsRecord = {
  type: 'A' | 'CNAME' | 'TXT'
  name: string
  value: string
  purpose: 'traffic' | 'verification'
}

export type VercelDomainSnapshot = {
  apexName: string | null
  verified: boolean
  misconfigured: boolean
  configuredBy: string | null
  trafficRecords: VercelDnsRecord[]
  verificationRecords: VercelDnsRecord[]
}

export type VercelProjectDomainPage = {
  domains: VercelProjectDomain[]
  pagination: {
    count: number
    next: number | null
    prev: number | null
  }
}

export type VercelProjectDomainPageOptions = {
  limit?: number
  until?: number
}

export type VercelProjectDomainListOptions = {
  pageSize?: number
  until?: number
  maxPages?: number
}

export type VercelProjectDomainsErrorCode =
  | 'invalid_configuration'
  | 'request_failed'
  | 'api_error'
  | 'invalid_response'

export class VercelProjectDomainsError extends Error {
  readonly code: VercelProjectDomainsErrorCode
  readonly statusCode: number | null
  readonly apiCode: string | null

  constructor(
    code: VercelProjectDomainsErrorCode,
    message: string,
    options: {
      statusCode?: number
      apiCode?: string
      cause?: unknown
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'VercelProjectDomainsError'
    this.code = code
    this.statusCode = options.statusCode ?? null
    this.apiCode = options.apiCode ?? null
  }
}

type ProjectIdentity = {
  id?: unknown
}

type DomainConfig = {
  configuredBy: string | null
  recommendedIPv4: Array<{
    rank: number
    value: string[]
  }>
  recommendedCNAME: Array<{
    rank: number
    value: string
  }>
  misconfigured: boolean
}

const DEFAULT_API_BASE_URL = 'https://api.vercel.com'
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000
const DEFAULT_PAGE_SIZE = 100
const DEFAULT_MAX_PAGES = 1_000

/**
 * Dependency-free client for the project-domain portion of Vercel's REST API.
 *
 * The project is always addressed by immutable ID. Callers must inject both
 * configuration and fetch so environment/error policy remains app-owned.
 */
export class VercelProjectDomains {
  private readonly token: string
  private readonly projectId: string
  private readonly teamSlug: string
  private readonly fetchImpl: VercelFetch
  private readonly apiBaseUrl: string
  private readonly requestTimeoutMs: number

  constructor(config: VercelProjectDomainsConfig) {
    this.token = requiredConfig(config.token, 'token')
    this.projectId = requiredConfig(config.projectId, 'projectId')
    this.teamSlug = requiredConfig(config.teamSlug, 'teamSlug')
    if (typeof config.fetch !== 'function') {
      throw configurationError('fetch must be provided.')
    }
    this.fetchImpl = config.fetch
    this.apiBaseUrl = apiBaseUrl(config.apiBaseUrl)
    this.requestTimeoutMs = positiveInteger(
      config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      'requestTimeoutMs',
    )
  }

  async attach(
    hostnameInput: string,
    options: { allowExisting?: boolean } = {},
  ): Promise<VercelDomainSnapshot> {
    const hostname = normalizedHostname(hostnameInput)
    let projectDomain: VercelProjectDomain
    try {
      const payload = await this.request<unknown>(
        `/v10/projects/${encodeURIComponent(this.projectId)}/domains`,
        {
          method: 'POST',
          body: JSON.stringify({ name: hostname }),
        },
      )
      projectDomain = projectDomainFrom(payload, this.projectId)
    } catch (error) {
      // An administrator retry is idempotent only after an exact GET proves
      // that this domain is already attached to this immutable project ID.
      // A cross-project 409/403 is never ownership proof.
      if (!options.allowExisting || !isApiError(error, 400)) throw error
      try {
        projectDomain = await this.getProjectDomain(hostname)
      } catch {
        throw error
      }
    }
    const config = await this.getConfig(hostname)
    return domainSnapshot(hostname, projectDomain, config, this.projectId)
  }

  async refresh(hostnameInput: string): Promise<VercelDomainSnapshot> {
    const hostname = normalizedHostname(hostnameInput)
    let projectDomain = await this.getProjectDomain(hostname)
    if (!projectDomain.verified) {
      try {
        const payload = await this.request<unknown>(
          `/v9/projects/${encodeURIComponent(this.projectId)}/domains/${encodeURIComponent(hostname)}/verify`,
          { method: 'POST' },
        )
        projectDomain = projectDomainFrom(payload, this.projectId)
      } catch (error) {
        if (!isApiError(error, 400)) throw error
        // A missing ownership TXT record is expected while DNS propagates.
        projectDomain = await this.getProjectDomain(hostname)
      }
    }
    const config = await this.getConfig(hostname)
    return domainSnapshot(hostname, projectDomain, config, this.projectId)
  }

  async detach(hostnameInput: string): Promise<void> {
    const hostname = normalizedHostname(hostnameInput)
    try {
      await this.request<unknown>(
        `/v9/projects/${encodeURIComponent(this.projectId)}/domains/${encodeURIComponent(hostname)}`,
        { method: 'DELETE' },
      )
    } catch (error) {
      if (
        error instanceof VercelProjectDomainsError
        && error.code === 'api_error'
        && error.statusCode === 404
        && error.apiCode === 'not_found'
      ) {
        // Vercel also returns 404 for a bad project/team scope. Treat the
        // domain as absent only after independently proving the project.
        await this.assertConfiguredProject()
        return
      }
      throw error
    }
  }

  async listPage(
    options: VercelProjectDomainPageOptions = {},
  ): Promise<VercelProjectDomainPage> {
    const limit = boundedPageSize(options.limit ?? DEFAULT_PAGE_SIZE)
    const params = new URLSearchParams({ limit: String(limit) })
    if (options.until !== undefined) {
      params.set('until', String(nonNegativeInteger(options.until, 'until')))
    }
    const payload = await this.request<unknown>(
      `/v9/projects/${encodeURIComponent(this.projectId)}/domains?${params}`,
    )
    return projectDomainPageFrom(payload, this.projectId)
  }

  async list(
    options: VercelProjectDomainListOptions = {},
  ): Promise<VercelProjectDomain[]> {
    const pageSize = boundedPageSize(options.pageSize ?? DEFAULT_PAGE_SIZE)
    const maxPages = positiveInteger(options.maxPages ?? DEFAULT_MAX_PAGES, 'maxPages')
    let until = options.until === undefined
      ? undefined
      : nonNegativeInteger(options.until, 'until')
    const seenCursors = new Set<number>()
    const domains: VercelProjectDomain[] = []

    for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
      const page = await this.listPage(until === undefined
        ? { limit: pageSize }
        : { limit: pageSize, until })
      domains.push(...page.domains)
      const next = page.pagination.next
      if (next === null) return domains
      if (next === until || seenCursors.has(next)) {
        throw invalidResponse('Vercel returned a repeated project-domain pagination cursor.')
      }
      seenCursors.add(next)
      until = next
    }

    throw invalidResponse('Vercel project-domain pagination exceeded the configured page limit.')
  }

  private async assertConfiguredProject(): Promise<void> {
    const payload = await this.request<ProjectIdentity>(
      `/v9/projects/${encodeURIComponent(this.projectId)}`,
    )
    if (!payload || typeof payload !== 'object' || payload.id !== this.projectId) {
      throw invalidResponse('Vercel returned a mismatched project identity.')
    }
  }

  private async getProjectDomain(hostname: string): Promise<VercelProjectDomain> {
    const payload = await this.request<unknown>(
      `/v9/projects/${encodeURIComponent(this.projectId)}/domains/${encodeURIComponent(hostname)}`,
    )
    return projectDomainFrom(payload, this.projectId)
  }

  private async getConfig(hostname: string): Promise<DomainConfig> {
    const project = encodeURIComponent(this.projectId)
    const payload = await this.request<unknown>(
      `/v6/domains/${encodeURIComponent(hostname)}/config?projectIdOrName=${project}`,
    )
    return domainConfigFrom(payload)
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = new URL(path, this.apiBaseUrl)
    url.searchParams.set('slug', this.teamSlug)

    let response: Response
    try {
      response = await this.fetchImpl(url.toString(), {
        ...init,
        headers: {
          authorization: `Bearer ${this.token}`,
          accept: 'application/json',
          ...(init.body ? { 'content-type': 'application/json' } : {}),
        },
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      })
    } catch (cause) {
      if (cause instanceof VercelProjectDomainsError) throw cause
      throw new VercelProjectDomainsError(
        'request_failed',
        'The Vercel project-domain request failed.',
        { cause },
      )
    }

    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      if (response.ok && response.status !== 204) {
        throw invalidResponse('Vercel returned a non-JSON project-domain response.')
      }
    }

    if (!response.ok) {
      const body = objectValue(payload)
      const nested = objectValue(body?.error) ?? body ?? {}
      throw new VercelProjectDomainsError(
        'api_error',
        typeof nested.message === 'string'
          ? nested.message
          : `Vercel returned HTTP ${response.status}.`,
        {
          statusCode: response.status,
          apiCode: typeof nested.code === 'string' ? nested.code : 'vercel_error',
        },
      )
    }

    return payload as T
  }
}

function projectDomainFrom(value: unknown, expectedProjectId: string): VercelProjectDomain {
  const domain = objectValue(value)
  if (
    !domain
    || typeof domain.name !== 'string'
    || typeof domain.projectId !== 'string'
    || domain.projectId !== expectedProjectId
    || typeof domain.verified !== 'boolean'
    || (domain.apexName !== undefined && typeof domain.apexName !== 'string')
    || (domain.verification !== undefined && !Array.isArray(domain.verification))
  ) {
    throw invalidResponse('Vercel returned an incomplete or mismatched project domain.')
  }

  return {
    name: domain.name.toLowerCase(),
    apexName: typeof domain.apexName === 'string' ? domain.apexName.toLowerCase() : null,
    projectId: domain.projectId,
    verified: domain.verified,
    verification: Array.isArray(domain.verification)
      ? domain.verification.flatMap((entry): VercelDomainVerification[] => {
          const record = objectValue(entry)
          if (!record) return []
          return [{
            ...(typeof record.type === 'string' ? { type: record.type } : {}),
            ...(typeof record.domain === 'string' ? { domain: record.domain } : {}),
            ...(typeof record.value === 'string' ? { value: record.value } : {}),
            ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
          }]
        })
      : [],
  }
}

function projectDomainPageFrom(
  value: unknown,
  expectedProjectId: string,
): VercelProjectDomainPage {
  const page = objectValue(value)
  const pagination = objectValue(page?.pagination)
  if (!page || !Array.isArray(page.domains) || !pagination) {
    throw invalidResponse('Vercel returned an incomplete project-domain page.')
  }
  const domains = page.domains.map((domain) => projectDomainFrom(domain, expectedProjectId))
  const count = nonNegativeIntegerValue(pagination.count, 'pagination.count')
  if (count !== domains.length) {
    throw invalidResponse('Vercel returned an inconsistent project-domain page count.')
  }
  return {
    domains,
    pagination: {
      count,
      next: nullableCursor(pagination.next, 'pagination.next'),
      prev: nullableCursor(pagination.prev, 'pagination.prev'),
    },
  }
}

function domainConfigFrom(value: unknown): DomainConfig {
  const config = objectValue(value)
  if (
    !config
    || typeof config.misconfigured !== 'boolean'
    || (config.configuredBy !== undefined && config.configuredBy !== null && typeof config.configuredBy !== 'string')
    || !Array.isArray(config.recommendedIPv4)
    || !Array.isArray(config.recommendedCNAME)
  ) {
    throw invalidResponse('Vercel returned an incomplete domain configuration.')
  }

  const recommendedIPv4 = config.recommendedIPv4.map((entry) => {
    const recommendation = objectValue(entry)
    if (
      !recommendation
      || typeof recommendation.rank !== 'number'
      || !Number.isFinite(recommendation.rank)
      || !Array.isArray(recommendation.value)
      || !recommendation.value.every((item) => typeof item === 'string' && item.length > 0)
    ) {
      throw invalidResponse('Vercel returned an invalid IPv4 recommendation.')
    }
    return { rank: recommendation.rank, value: recommendation.value as string[] }
  })
  const recommendedCNAME = config.recommendedCNAME.map((entry) => {
    const recommendation = objectValue(entry)
    if (
      !recommendation
      || typeof recommendation.rank !== 'number'
      || !Number.isFinite(recommendation.rank)
      || typeof recommendation.value !== 'string'
      || !recommendation.value
    ) {
      throw invalidResponse('Vercel returned an invalid CNAME recommendation.')
    }
    return { rank: recommendation.rank, value: recommendation.value }
  })

  return {
    configuredBy: typeof config.configuredBy === 'string' ? config.configuredBy : null,
    recommendedIPv4,
    recommendedCNAME,
    misconfigured: config.misconfigured,
  }
}

function domainSnapshot(
  hostname: string,
  projectDomain: VercelProjectDomain,
  config: DomainConfig,
  expectedProjectId: string,
): VercelDomainSnapshot {
  if (projectDomain.name !== hostname || projectDomain.projectId !== expectedProjectId) {
    throw invalidResponse('Vercel returned a mismatched project-domain status.')
  }
  const isApex = projectDomain.apexName === hostname
  return {
    apexName: projectDomain.apexName,
    verified: projectDomain.verified,
    misconfigured: config.misconfigured,
    configuredBy: config.configuredBy,
    trafficRecords: isApex
      ? ipv4Records(config.recommendedIPv4)
      : cnameRecords(hostname, projectDomain.apexName, config.recommendedCNAME),
    verificationRecords: projectDomain.verification.flatMap((record): VercelDnsRecord[] => {
      if (record.type?.toUpperCase() !== 'TXT' || !record.domain || !record.value) return []
      return [{
        type: 'TXT',
        name: record.domain,
        value: record.value,
        purpose: 'verification',
      }]
    }),
  }
}

function ipv4Records(
  recommendations: DomainConfig['recommendedIPv4'],
): VercelDnsRecord[] {
  const preferredRank = Math.min(...recommendations.map((entry) => entry.rank))
  if (!Number.isFinite(preferredRank)) return []
  return recommendations
    .filter((entry) => entry.rank === preferredRank)
    .flatMap((entry) => entry.value)
    .map((value) => ({ type: 'A', name: '@', value, purpose: 'traffic' }))
}

function cnameRecords(
  hostname: string,
  apexName: string | null,
  recommendations: DomainConfig['recommendedCNAME'],
): VercelDnsRecord[] {
  const preferred = [...recommendations].sort((a, b) => a.rank - b.rank)[0]
  if (!preferred) return []
  const relativeName = apexName && hostname.endsWith(`.${apexName}`)
    ? hostname.slice(0, -(apexName.length + 1))
    : hostname
  return [{ type: 'CNAME', name: relativeName, value: preferred.value, purpose: 'traffic' }]
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizedHostname(value: string): string {
  const hostname = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!hostname) throw configurationError('hostname must be provided.')
  return hostname
}

function requiredConfig(value: string, field: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw configurationError(`${field} must be provided.`)
  return normalized
}

function apiBaseUrl(value: string | undefined): string {
  const raw = value?.trim() || DEFAULT_API_BASE_URL
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw configurationError('apiBaseUrl must be an absolute HTTP(S) URL.')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw configurationError('apiBaseUrl must be an absolute HTTP(S) URL.')
  }
  return parsed.toString()
}

function boundedPageSize(value: number): number {
  const size = positiveInteger(value, 'limit')
  if (size > 100) throw configurationError('limit must be at most 100.')
  return size
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw configurationError(`${field} must be a positive integer.`)
  }
  return value
}

function nonNegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw configurationError(`${field} must be a non-negative integer.`)
  }
  return value
}

function nonNegativeIntegerValue(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidResponse(`Vercel returned an invalid ${field}.`)
  }
  return value
}

function nullableCursor(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null
  return nonNegativeIntegerValue(value, field)
}

function configurationError(message: string): VercelProjectDomainsError {
  return new VercelProjectDomainsError('invalid_configuration', message)
}

function invalidResponse(message: string): VercelProjectDomainsError {
  return new VercelProjectDomainsError('invalid_response', message)
}

function isApiError(error: unknown, statusCode: number): boolean {
  return error instanceof VercelProjectDomainsError
    && error.code === 'api_error'
    && error.statusCode === statusCode
}
