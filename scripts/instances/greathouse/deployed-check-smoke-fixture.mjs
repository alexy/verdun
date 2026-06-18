export function createDeployedCheckSmokeFixture({ profile, generatedAt }) {
  const snapshot = {
    instance: {
      id: profile.id,
      name: 'Greathouse',
      basePath: profile.basePath,
    },
    generatedAt,
    editorialPersistence: 'database',
    records: [
      {
        id: 'greathouse-listing-1',
        title: 'Berkeley two-bedroom near transit',
        url: 'https://example.com/listings/1',
        subject: 'Berkeley 2BR',
        summary: 'Fresh listing with source provenance and comparable evidence.',
        review: 1,
        score: 94,
        observedAt: generatedAt,
      },
      {
        id: 'greathouse-diagnostic-1',
        title: 'Source diagnostic for protected listing endpoint',
        url: 'https://example.com/diagnostics/redfin',
        subject: 'Oakland blocked source',
        summary: 'Blocked-source diagnostic retained as normalized review evidence.',
        review: 0,
        score: 71,
        observedAt: generatedAt,
      },
    ],
    sourceRuns: [
      {
        source: 'local-listing-json',
        status: 'ok',
        itemCount: 1,
        subjectCounts: { 'Berkeley 2BR': 1 },
        message: 'Loaded local listing fixture.',
        collectedAt: generatedAt,
      },
      {
        source: 'http-status-diagnostic',
        status: 'ok',
        itemCount: 1,
        subjectCounts: { 'Oakland blocked source': 1 },
        message: 'Recorded blocked-source diagnostic.',
        collectedAt: generatedAt,
      },
    ],
    collectionPlans: [
      {
        subject: 'Berkeley 2BR',
        query: 'Berkeley 2BR homes source diagnostics',
        liveTerms: ['Berkeley 2BR', 'listing freshness'],
      },
      {
        subject: 'Oakland blocked source',
        query: 'Oakland blocked source diagnostics',
        liveTerms: ['Oakland blocked source', 'retry'],
      },
    ],
    focuses: [
      {
        id: 'focus-greathouse-source-health',
        text: 'Prioritize source freshness and blocked-source diagnostics.',
        scope: 'ongoing',
        createdAt: generatedAt,
      },
    ],
  }

  return {
    snapshotJson() {
      return JSON.stringify(snapshot)
    },
    statusJson() {
      return JSON.stringify({
        instance: snapshot.instance,
        editorialPersistence: 'database',
        generatedAt: snapshot.generatedAt,
        recordCount: snapshot.records.length,
        focusCount: snapshot.focuses.length,
        reviewCount: 1,
        sourceRunCount: snapshot.sourceRuns.length,
        collectionPlanCount: snapshot.collectionPlans.length,
        writable: true,
      })
    },
    healthJson() {
      const status = JSON.parse(this.statusJson())
      return JSON.stringify({
        ok: true,
        service: 'workbench',
        surface: 'health',
        state: 'database_configured',
        databaseConfigured: true,
        editorialPersistence: 'database',
        readSurfaces: ['records', 'status', 'health'],
        writeSurfaces: ['review', 'focus'],
        collectionSurfaces: ['crawler verify', 'crawler collect', 'crawler export-sql', 'db:deploy'],
        activeSnapshot: status,
      })
    },
  }
}
