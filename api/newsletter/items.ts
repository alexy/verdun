import { readSnapshot } from './_db'
import { allowMethods, sendApiError, sendJson, type ApiRequest, type ApiResponse } from './_http'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!allowMethods(req, res, ['GET', 'HEAD'])) return
  try {
    sendJson(res, await readSnapshot())
  } catch (error) {
    sendApiError(res, error)
  }
}
