import { readSnapshot } from '../instances/garbage/newsletter-store.js'
import { allowMethods, sendApiError, sendJson, sendText, type ApiRequest, type ApiResponse } from './_http.js'
import {
  buildNewsletterDraft,
  buildPublishManifest,
  evaluateNewsletterProseQuality,
  evaluateNewsletterReadiness,
  evaluateSourceCoverage,
  type NewsletterDraft,
  type NewsletterSnapshot,
} from '../../src/instances/garbage/newsletter.js'

type DraftFormat = 'json' | 'markdown' | 'html' | 'manifest'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!allowMethods(req, res, ['GET', 'HEAD'])) return
  try {
    const snapshot = await readSnapshot()
    const draft = buildNewsletterDraft(snapshot)
    assertDraftAllowed(snapshot, draft, {
      requireReady: queryFlag(req, 'requireReady') || queryFlag(req, 'require-ready'),
      requireUpvotes: queryFlag(req, 'requireUpvotes') || queryFlag(req, 'require-upvotes'),
    })

    const format = queryFormat(req)
    const manifest = buildPublishManifest(draft, snapshot, {
      markdownPath: 'crawler/data/newsletter-draft.md',
      snapshotInput: 'api/newsletter/items',
      requireReady: queryFlag(req, 'requireReady') || queryFlag(req, 'require-ready'),
      requireUpvotes: queryFlag(req, 'requireUpvotes') || queryFlag(req, 'require-upvotes'),
    })

    if (format === 'markdown') {
      sendText(res, draft.markdown, 'text/markdown; charset=utf-8')
      return
    }
    if (format === 'html') {
      sendText(res, draft.html, 'text/html; charset=utf-8')
      return
    }
    if (format === 'manifest') {
      sendJson(res, manifest)
      return
    }
    sendJson(res, {
      draft,
      manifest,
      readiness: evaluateNewsletterReadiness(snapshot),
      proseQuality: evaluateNewsletterProseQuality(draft),
      sourceCoverage: evaluateSourceCoverage(snapshot),
    })
  } catch (error) {
    sendApiError(res, error)
  }
}

function assertDraftAllowed(
  snapshot: NewsletterSnapshot,
  draft: NewsletterDraft,
  options: { requireReady: boolean, requireUpvotes: boolean },
): void {
  if (options.requireUpvotes) {
    const votes = new Map(snapshot.items.map((item) => [item.id, item.vote]))
    if (!draft.itemIds.some((itemId) => votes.get(itemId) === 1)) {
      throw draftGateError('draft_requires_upvotes', 'Draft requires at least one upvoted item.')
    }
  }

  if (!options.requireReady) return
  const readiness = evaluateNewsletterReadiness(snapshot)
  if (readiness.status !== 'ready') {
    throw draftGateError('draft_not_ready', failedDetails(readiness.checks, readiness.summary))
  }
  const proseQuality = evaluateNewsletterProseQuality(draft)
  if (proseQuality.status !== 'ready') {
    throw draftGateError('draft_prose_not_ready', failedDetails(proseQuality.checks, proseQuality.summary))
  }
}

function failedDetails(checks: Array<{ passed: boolean, label: string, detail: string }>, fallback: string): string {
  const failed = checks
    .filter((check) => !check.passed)
    .map((check) => `${check.label}: ${check.detail}`)
  return failed.length ? failed.join(' ') : fallback
}

function draftGateError(code: string, message: string): Error {
  const error = new Error(message)
  Object.assign(error, { statusCode: 409, code })
  return error
}

function queryFormat(req: ApiRequest): DraftFormat {
  const format = singleQueryValue(req.query.format)
  return format === 'markdown' || format === 'html' || format === 'manifest' ? format : 'json'
}

function queryFlag(req: ApiRequest, name: string): boolean {
  const value = singleQueryValue(req.query[name])
  return value === '' || value === '1' || value === 'true' || value === 'yes'
}

function singleQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
