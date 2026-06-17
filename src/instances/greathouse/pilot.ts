import type { WorkbenchSnapshot } from '../../core/workbench'
import { greathouseInstance, greathouseSeedFocuses } from './config'

export function greathousePilotSnapshot(): WorkbenchSnapshot {
  return {
    generatedAt: '2026-06-16T12:00:00.000Z',
    instance: greathouseInstance,
    editorialPersistence: 'browser',
    records: [
      {
        id: 'listing-redfin-berkeley-01',
        title: 'Berkeley two-bedroom with transit access',
        source: 'Redfin',
        sourceKind: 'listing',
        url: 'https://example.com/greathouse/berkeley-two-bedroom',
        observedAt: '2026-06-16T12:00:00.000Z',
        subject: 'Berkeley 2BR',
        topic: 'buyer shortlist',
        summary: 'Listing candidate with walkable transit, recent observation time, and enough comparable context for review.',
        tags: ['berkeley', '2br', 'transit', 'shortlist'],
        score: 86,
        review: 1,
        provenance: {
          stage: 'live',
          adapter: 'property-listing-fixture',
          source: 'Redfin',
          sourceKind: 'listing',
          sourceUrl: 'https://example.com/redfin',
          evidenceUrl: 'https://example.com/greathouse/berkeley-two-bedroom',
          subject: 'Berkeley 2BR',
          matchedKeywords: ['berkeley', '2br', 'transit'],
        },
      },
      {
        id: 'listing-blocked-oakland-01',
        title: 'Oakland listing needing blocked-source follow-up',
        source: 'Redfin diagnostics',
        sourceKind: 'diagnostic',
        url: 'https://example.com/greathouse/oakland-diagnostic',
        observedAt: '2026-06-16T11:30:00.000Z',
        subject: 'Oakland blocked source',
        topic: 'source diagnostics',
        summary: 'Crawler observed a blocked listing source and retained enough context for retry or manual review.',
        tags: ['oakland', 'blocked-source', 'diagnostic'],
        score: 62,
        review: 0,
        provenance: {
          stage: 'live',
          adapter: 'blocked-source-diagnostic-fixture',
          source: 'Redfin diagnostics',
          sourceKind: 'diagnostic',
          sourceUrl: 'https://example.com/redfin-diagnostics',
          evidenceUrl: 'https://example.com/greathouse/oakland-diagnostic',
          subject: 'Oakland blocked source',
          matchedKeywords: ['blocked-source', 'retry'],
        },
      },
    ],
    focuses: greathouseSeedFocuses,
    sourceRuns: [
      {
        source: 'Redfin',
        kind: 'listing',
        status: 'ok',
        itemCount: 1,
        message: 'pilot listing fixture loaded through the generic workbench contract',
        subjectCounts: { 'Berkeley 2BR': 1 },
      },
      {
        source: 'Redfin diagnostics',
        kind: 'diagnostic',
        status: 'error',
        itemCount: 1,
        message: 'blocked source retained as diagnostic evidence',
        subjectCounts: { 'Oakland blocked source': 1 },
      },
    ],
    collectionPlans: [
      {
        subject: 'Berkeley 2BR',
        topic: 'buyer shortlist',
        query: 'Berkeley 2BR transit comparable',
        liveTerms: ['berkeley', '2br', 'transit'],
        tags: ['berkeley', '2br'],
        reviewTargets: [
          {
            source: 'Redfin',
            label: 'Redfin Berkeley 2BR',
            url: 'https://example.com/redfin/search/berkeley-2br',
            adapter: 'property-listing-fixture',
          },
        ],
        focusTerms: ['transit'],
      },
      {
        subject: 'Oakland blocked source',
        topic: 'source diagnostics',
        query: 'Oakland listing blocked source retry',
        liveTerms: ['oakland', 'blocked-source'],
        tags: ['oakland', 'diagnostic'],
        reviewTargets: [
          {
            source: 'Redfin diagnostics',
            label: 'Retry blocked Oakland listing',
            url: 'https://example.com/redfin-diagnostics/oakland',
            adapter: 'blocked-source-diagnostic-fixture',
          },
        ],
        focusTerms: ['retry'],
      },
    ],
  }
}
