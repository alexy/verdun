import { allowMethods, sendApiError, sendJson, type ApiRequest, type ApiResponse } from '../newsletter/_http.js'
import { readWorkbenchSnapshot } from './_db.js'
import { resolveWorkbenchInstance } from '../../src/instances/registry'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!allowMethods(req, res, ['GET', 'HEAD'])) return
  try {
    sendJson(res, await readWorkbenchSnapshot(resolveWorkbenchInstance(req.query.instance)))
  } catch (error) {
    sendApiError(res, error)
  }
}
