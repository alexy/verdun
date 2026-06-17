import { writeVote, type VoteValue } from '../newsletter-store.js'
import { allowMethods, parseBody, sendApiError, sendJson, type ApiRequest, type ApiResponse } from '../../../core/http.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!allowMethods(req, res, ['POST'])) return
  const body = parseBody(req)
  const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : ''
  const vote = Number(body.vote)
  if (!itemId || ![-1, 0, 1].includes(vote)) {
    res.status(400).json({ error: 'invalid_vote' })
    return
  }
  try {
    await writeVote(itemId, vote as VoteValue)
    sendJson(res, { ok: true })
  } catch (error) {
    sendApiError(res, error)
  }
}
