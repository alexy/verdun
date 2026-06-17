import { allowMethods, sendApiError, sendJson, type ApiRequest, type ApiResponse } from '../newsletter/_http.js'
import { readWorkbenchStatus } from './_db.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!allowMethods(req, res, ['GET', 'HEAD'])) return
  try {
    sendJson(res, await readWorkbenchStatus())
  } catch (error) {
    sendApiError(res, error)
  }
}
