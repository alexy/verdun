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

export function sendJson(res: ApiResponse, body: unknown): void {
  res.setHeader('cache-control', 's-maxage=15, stale-while-revalidate=60')
  res.status(200).json(body)
}

export function sendApiError(res: ApiResponse, error: unknown): void {
  console.error(error)
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const statusCode = Number(record.statusCode)
  res.status(Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500).json({
    error: typeof record.code === 'string' ? record.code : 'newsletter_api_error',
    message: error instanceof Error ? error.message : 'Newsletter API request failed.',
  })
}
