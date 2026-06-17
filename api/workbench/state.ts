import { allowMethods, parseBody, sendApiError, sendJson, type ApiRequest, type ApiResponse } from '../core/http.js'
import { writeWorkbenchState } from './_db.js'
import { resolveWorkbenchInstance } from '../../src/instances/registry'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!allowMethods(req, res, ['POST'])) return
  const body = parseBody(req)
  try {
    const instance = resolveWorkbenchInstance(req.query.instance)
    sendJson(res, { ok: true, instance: instance.id, ...(await writeWorkbenchState(body, instance)) })
  } catch (error) {
    sendApiError(res, error)
  }
}
