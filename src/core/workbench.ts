export type WorkbenchInstance = {
  id: string
  name: string
  basePath: string
  theme: string
  databaseTablePrefix: string
  staticSnapshotPath: string
  localStatePath: string
  readOnlyMessage: string
}

export type ReviewValue = -1 | 0 | 1

export type WorkbenchRecordProvenance = {
  stage: string
  adapter: string
  source: string
  sourceKind: string
  sourceUrl: string
  evidenceUrl: string
  subject: string
  matchedKeywords: string[]
}

export type WorkbenchRecord = {
  id: string
  title: string
  source: string
  sourceKind: string
  url: string
  observedAt: string
  subject: string
  topic: string
  summary: string
  tags: string[]
  score: number
  review: ReviewValue
  provenance?: WorkbenchRecordProvenance
}

export type WorkbenchFocus = {
  id: string
  text: string
  scope: 'this_week' | 'ongoing'
  createdAt: string
}

export type SourceRunStatus = 'ok' | 'error' | 'pending' | 'skipped'

export type WorkbenchSourceRun = {
  source: string
  kind: string
  status: SourceRunStatus
  itemCount: number
  message: string
  subjectCounts: Record<string, number>
}

export type WorkbenchReviewTarget = {
  source: string
  label: string
  url: string
  adapter: string
}

export type WorkbenchCollectionPlan = {
  subject: string
  topic: string
  query: string
  liveTerms: string[]
  tags: string[]
  reviewTargets: WorkbenchReviewTarget[]
  focusTerms: string[]
}

export type WorkbenchSnapshot = {
  generatedAt: string
  instance: WorkbenchInstance
  editorialPersistence: 'database' | 'local_file' | 'browser'
  records: WorkbenchRecord[]
  focuses: WorkbenchFocus[]
  sourceRuns: WorkbenchSourceRun[]
  collectionPlans: WorkbenchCollectionPlan[]
}

export type WorkbenchStateExport = {
  reviews: Record<string, ReviewValue>
  focuses: Array<{
    id: string
    text: string
    scope: 'this_week' | 'ongoing'
    created_at: string
  }>
}
