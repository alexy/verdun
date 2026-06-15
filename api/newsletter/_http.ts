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
  res.status(500).json({
    error: 'newsletter_api_error',
    message: 'Newsletter API request failed.',
  })
}
