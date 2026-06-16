import { readStatus } from './_db.js'
import { allowMethods, sendApiError, sendJson, type ApiRequest, type ApiResponse } from './_http.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!allowMethods(req, res, ['GET', 'HEAD'])) return
  try {
    sendJson(res, await readStatus())
  } catch (error) {
    sendApiError(res, error)
  }
}
