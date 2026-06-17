import { allowMethods, parseBody, sendApiError, sendJson, type ApiRequest, type ApiResponse } from '../newsletter/_http.js'
import { writeReview } from './_db.js'
import type { ReviewValue } from '../../src/core/workbench'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!allowMethods(req, res, ['POST'])) return
  const body = parseBody(req)
  const recordId = typeof body.recordId === 'string' ? body.recordId : ''
  const review = normalizeReview(body.review)
  if (!recordId || review === null) {
    res.status(400).json({ error: 'invalid_review_request' })
    return
  }
  try {
    await writeReview(recordId, review)
    sendJson(res, { ok: true, recordId, review })
  } catch (error) {
    sendApiError(res, error)
  }
}

function normalizeReview(value: unknown): ReviewValue | null {
  const review = Number(value)
  return review === -1 || review === 0 || review === 1 ? review : null
}
