import { writeEditorialState } from '../instances/garbage/newsletter-store.js'
import { allowMethods, parseBody, sendApiError, sendJson, type ApiRequest, type ApiResponse } from './_http.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!allowMethods(req, res, ['POST'])) return
  const body = parseBody(req)
  try {
    sendJson(res, { ok: true, ...(await writeEditorialState(body)) })
  } catch (error) {
    sendApiError(res, error)
  }
}
