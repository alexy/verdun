import { allowMethods, parseBody, sendApiError, sendJson, type ApiRequest, type ApiResponse } from '../core/http.js'
import { writeWorkbenchFocus } from './_db.js'
import type { WorkbenchFocus } from '../../src/core/workbench'
import { resolveWorkbenchInstance } from '../../src/instances/registry'

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
    const instance = resolveWorkbenchInstance(req.query.instance)
    const focus = await writeWorkbenchFocus(text, scope, instance)
    sendJson(res, { ok: true, instance: instance.id, focus })
  } catch (error) {
    sendApiError(res, error)
  }
}

function normalizeScope(value: unknown): WorkbenchFocus['scope'] {
  return value === 'ongoing' ? 'ongoing' : 'this_week'
}
