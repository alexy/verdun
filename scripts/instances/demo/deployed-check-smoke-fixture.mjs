export function createDeployedCheckSmokeFixture({ profile, generatedAt }) {
  const snapshot = {
    instance: {
      id: profile.id,
      name: 'Verdun Demo',
      basePath: profile.basePath,
    },
    generatedAt,
    editorialPersistence: 'database',
    records: [
      {
        id: 'demo-live-record-01',
        title: 'Generic live source record',
        url: 'https://example.com/demo/live-record',
        subject: 'Reusable workbench',
        summary: 'Normalized record with provenance and review state.',
        review: 1,
        score: 82,
        observedAt: generatedAt,
      },
      {
        id: 'demo-diagnostic-record-01',
        title: 'Generic source diagnostic record',
        url: 'https://example.com/demo/diagnostic',
        subject: 'Source diagnostics',
        summary: 'Diagnostic record retained as reusable source-health evidence.',
        review: 0,
        score: 68,
        observedAt: generatedAt,
      },
    ],
    sourceRuns: [
      {
        source: 'demo-live-json',
        status: 'ok',
        itemCount: 1,
        subjectCounts: { 'Reusable workbench': 1 },
        message: 'Loaded demo live source fixture.',
        collectedAt: generatedAt,
      },
      {
        source: 'demo-diagnostic-json',
        status: 'ok',
        itemCount: 1,
        subjectCounts: { 'Source diagnostics': 1 },
        message: 'Recorded demo source diagnostic.',
        collectedAt: generatedAt,
      },
    ],
    collectionPlans: [
      {
        subject: 'Reusable workbench',
        query: 'generic workbench record provenance',
        liveTerms: ['generic', 'workbench'],
      },
      {
        subject: 'Source diagnostics',
        query: 'generic source diagnostic retry',
        liveTerms: ['diagnostic', 'retry'],
      },
    ],
    focuses: [
      {
        id: 'focus-demo-evidence',
        text: 'Prioritize reusable source evidence.',
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
