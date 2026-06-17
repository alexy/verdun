import { writeFocus } from '../instances/garbage/newsletter-store.js'
import { allowMethods, parseBody, sendApiError, sendJson, type ApiRequest, type ApiResponse } from './_http.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!allowMethods(req, res, ['POST'])) return
  const body = parseBody(req)
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const scope = body.scope === 'ongoing' ? 'ongoing' : 'this_week'
  if (text.length < 3) {
    res.status(400).json({ error: 'invalid_focus' })
    return
  }
  try {
    sendJson(res, { ok: true, focus: await writeFocus(text.slice(0, 2000), scope) })
  } catch (error) {
    sendApiError(res, error)
  }
}
