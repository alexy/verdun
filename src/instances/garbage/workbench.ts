import type {
  WorkbenchCollectionPlan,
  WorkbenchRecord,
  WorkbenchRecordProvenance,
  WorkbenchSnapshot,
  WorkbenchSourceRun,
} from '../../core/workbench'
import type { NewsItem, NewsletterSnapshot, ProjectQueryPlan, SourceRun } from '../../lib/newsletter'
import { garbageInstance } from './config'

export function garbageSnapshotToWorkbench(snapshot: NewsletterSnapshot): WorkbenchSnapshot {
  return {
    generatedAt: snapshot.generatedAt,
    instance: garbageInstance,
    editorialPersistence: snapshot.editorialPersistence,
    records: snapshot.items.map(newsItemToWorkbenchRecord),
    focuses: snapshot.focuses,
    sourceRuns: snapshot.sourceRuns.map(sourceRunToWorkbenchSourceRun),
    collectionPlans: snapshot.queryPlans.map(queryPlanToWorkbenchCollectionPlan),
  }
}

export function newsItemToWorkbenchRecord(item: NewsItem): WorkbenchRecord {
  return {
    id: item.id,
    title: item.title,
    source: item.source,
    sourceKind: item.sourceKind,
    url: item.url,
    observedAt: item.publishedAt,
    subject: item.project,
    topic: item.topic,
    summary: item.summary,
    tags: item.tags,
    score: item.score,
    review: item.vote,
    provenance: item.provenance ? newsProvenanceToWorkbench(item.provenance) : undefined,
  }
}

export function sourceRunToWorkbenchSourceRun(run: SourceRun): WorkbenchSourceRun {
  return {
    source: run.source,
    kind: run.kind,
    status: run.status,
    itemCount: run.itemCount,
    message: run.message,
    subjectCounts: run.projectCounts,
  }
}

export function queryPlanToWorkbenchCollectionPlan(plan: ProjectQueryPlan): WorkbenchCollectionPlan {
  return {
    subject: plan.project,
    topic: plan.topic,
    query: plan.hackerNewsQuery,
    liveTerms: plan.liveTerms,
    tags: plan.devToTags,
    reviewTargets: plan.reviewTargets,
    focusTerms: plan.focusTerms,
  }
}

function newsProvenanceToWorkbench(provenance: NonNullable<NewsItem['provenance']>): WorkbenchRecordProvenance {
  return {
    stage: provenance.stage,
    adapter: provenance.adapter,
    source: provenance.source,
    sourceKind: provenance.sourceKind,
    sourceUrl: provenance.sourceUrl,
    evidenceUrl: provenance.evidenceUrl,
    subject: provenance.project,
    matchedKeywords: provenance.matchedKeywords,
  }
}
