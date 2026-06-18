export function createGarbageDeployedCheckSmokeFixture({ profile, rawSnapshot, generatedAt }) {
  let reviewedSnapshot = {
    ...rawSnapshot,
    generated_at: generatedAt,
    editorial_persistence: 'database',
    items: rawSnapshot.items.map((item) => ({
      ...item,
      vote: ['grust-sail-3683deba292c', 'lakesail-e5ce5d36852a'].includes(item.id) ? 1 : 0,
    })),
    focuses: [
      {
        id: 'focus-smoke-check-deployed-ready',
        text: 'More typed lakehouse execution and graph lowering evidence.',
        scope: 'this_week',
        created_at: new Date().toISOString(),
      },
    ],
  }
  const draftMarkdown = `# Strongly Typed AI/Data Notes: June 16, 2026

## Weekly throughline

Typed lakehouse and graph systems are moving from experiments into practical infrastructure.

## Sources watched

- Hacker News: 5 items
`
  const draftManifest = {
    snapshotInput: profile.draft.manifestSnapshotInput,
    issue: {
      date: '2026-06-16',
      slug: 'strongly-typed-ai-data-notes-june-16-2026',
      title: 'Strongly Typed AI/Data Notes: June 16, 2026',
      selectedItemCount: 2,
    },
    title: 'Strongly Typed AI/Data Notes: June 16, 2026',
    itemIds: ['grust-sail-3683deba292c', 'lakesail-e5ce5d36852a'],
    readiness: { status: 'ready', checks: [{ id: 'upvotes', passed: true }] },
    proseQuality: { status: 'ready', checks: [{ id: 'throughline', passed: true }] },
  }
  const fixture = {
    setGeneratedAt(value) {
      reviewedSnapshot = {
        ...reviewedSnapshot,
        generated_at: value,
      }
    },
    snapshotJson() {
      return JSON.stringify(reviewedSnapshot)
    },
    databaseStatusJson() {
      return JSON.stringify({
        editorialPersistence: 'database',
        generatedAt: reviewedSnapshot.generated_at,
        recordCount: reviewedSnapshot.items.length,
        itemCount: reviewedSnapshot.items.length,
        focusCount: reviewedSnapshot.focuses.length,
        reviewCount: 2,
        voteCount: 2,
        sourceRunCount: reviewedSnapshot.source_runs.length,
        collectionPlanCount: reviewedSnapshot.query_plans.length,
        queryPlanCount: reviewedSnapshot.query_plans.length,
        writable: true,
      })
    },
    browserStatusJson() {
      return JSON.stringify({
        editorialPersistence: 'browser',
        generatedAt: reviewedSnapshot.generated_at,
        recordCount: reviewedSnapshot.items.length,
        itemCount: reviewedSnapshot.items.length,
        focusCount: reviewedSnapshot.focuses.length,
        reviewCount: 0,
        voteCount: 0,
        sourceRunCount: reviewedSnapshot.source_runs.length,
        collectionPlanCount: reviewedSnapshot.query_plans.length,
        queryPlanCount: reviewedSnapshot.query_plans.length,
        writable: false,
      })
    },
    healthJson(statusJson) {
      const status = JSON.parse(statusJson)
      const databaseConfigured = status.editorialPersistence === 'database'
      return JSON.stringify({
        ok: true,
        service: 'workbench',
        surface: 'health',
        state: databaseConfigured ? 'database_configured' : 'database_not_configured',
        databaseConfigured,
        editorialPersistence: status.editorialPersistence,
        readSurfaces: ['records', 'status', 'health'],
        writeSurfaces: ['review', 'focus', 'state'],
        collectionSurfaces: ['crawler verify', 'crawler collect', 'crawler export-sql', 'db:deploy'],
        activeSnapshot: status,
      })
    },
    handleDraftRequest(url, response) {
      if (url.pathname !== profile.draft.apiPath) return false
      const format = url.searchParams.get('format')
      if (format === 'markdown') {
        response.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' })
        response.end(draftMarkdown)
        return true
      }
      if (format === 'manifest') {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify(draftManifest))
        return true
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        draft: {
          title: draftManifest.title,
          markdown: draftMarkdown,
          html: '<h1>Strongly Typed AI/Data Notes: June 16, 2026</h1>',
          itemIds: draftManifest.itemIds,
        },
        manifest: draftManifest,
        readiness: draftManifest.readiness,
        proseQuality: draftManifest.proseQuality,
        sourceCoverage: { watchedProjects: [], coveredProjects: [], uncoveredProjects: [] },
      }))
      return true
    },
  }
  return fixture
}

export const createDeployedCheckSmokeFixture = createGarbageDeployedCheckSmokeFixture
