import { allowMethods, parseBody, sendApiError, sendJson, type ApiRequest, type ApiResponse } from '../newsletter/_http.js'
import { writeWorkbenchFocus } from './_db.js'
import type { WorkbenchFocus } from '../../src/core/workbench'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!allowMethods(req, res, ['POST'])) return
  const body = parseBody(req)
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const scope = normalizeScope(body.scope)
  if (!text) {
    res.status(400).json({ error: 'invalid_focus_request' })
    return
  }
  try {
    const focus = await writeWorkbenchFocus(text, scope)
    sendJson(res, { ok: true, focus })
  } catch (error) {
    sendApiError(res, error)
  }
}

function normalizeScope(value: unknown): WorkbenchFocus['scope'] {
  return value === 'ongoing' ? 'ongoing' : 'this_week'
}
