export type ApiRequest = {
  method?: string
  query: Record<string, string | string[] | undefined>
  body?: unknown
}

export type ApiResponse = {
  status: (code: number) => ApiResponse
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
  end: (body?: string) => void
}

export function allowMethods(req: ApiRequest, res: ApiResponse, methods: string[]): boolean {
  if (!req.method || methods.includes(req.method)) return true
  res.setHeader('allow', methods.join(', '))
  res.status(405).json({ error: 'method_not_allowed' })
  return false
}

export function parseBody(req: ApiRequest): Record<string, unknown> {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body as Record<string, unknown>
  return {}
}

// Cache behavior for sendJson/sendText. Default ('public') keeps the historical
// shared-cache header; 'private' opts authenticated/per-user responses out of
// shared caches; false sets no cache-control header at all.
export type SendCacheOption = 'public' | 'private' | false

export type SendOptions = {
  cache?: SendCacheOption
}

function applyCacheHeader(res: ApiResponse, cache: SendCacheOption | undefined): void {
  if (cache === false) return
  if (cache === 'private') {
    res.setHeader('cache-control', 'private, no-store')
    return
  }
  res.setHeader('cache-control', 's-maxage=15, stale-while-revalidate=60')
}

export function sendJson(res: ApiResponse, body: unknown, options: SendOptions = {}): void {
  applyCacheHeader(res, options.cache)
  res.status(200).json(body)
}

export function sendText(res: ApiResponse, body: string, contentType = 'text/plain; charset=utf-8', options: SendOptions = {}): void {
  applyCacheHeader(res, options.cache)
  res.setHeader('content-type', contentType)
  res.status(200).end(body)
}

export function sendApiError(res: ApiResponse, error: unknown): void {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const statusCode = Number(record.statusCode)
  const responseStatus = Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500
  if (responseStatus >= 500) console.error(error)
  res.status(responseStatus).json({
    error: typeof record.code === 'string' ? record.code : 'api_error',
    message: error instanceof Error ? error.message : 'API request failed.',
  })
}
