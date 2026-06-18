export async function validateDraftApi({
  origin,
  draftProfile,
  requireReady,
  fetchJson,
  fetchTextContent,
}) {
  const draftUrl = new URL(draftProfile.apiPath, origin)
  const draft = await fetchJson(draftUrl, 'draft API')
  if (!draft?.draft?.markdown?.includes('## Weekly throughline')) {
    throw new Error('draft API did not return generated Markdown with a weekly throughline')
  }
  if (!draft?.manifest?.issue?.slug || !Array.isArray(draft?.manifest?.itemIds)) {
    throw new Error('draft API did not return a publish manifest with issue identity')
  }
  if (!draft?.readiness?.checks?.length || !draft?.proseQuality?.checks?.length) {
    throw new Error('draft API did not return readiness and prose-quality checks')
  }

  const markdownUrl = new URL(`${draftProfile.apiPath}?format=markdown`, origin)
  const markdown = await fetchTextContent(markdownUrl, 'draft Markdown API', 'text/markdown')
  for (const expectedText of arrayValue(draftProfile.markdownIncludes)) {
    if (!markdown.includes(expectedText)) {
      throw new Error(`draft Markdown API did not include expected text: ${expectedText}`)
    }
  }

  const manifestUrl = new URL(`${draftProfile.apiPath}?format=manifest`, origin)
  const manifest = await fetchJson(manifestUrl, 'draft manifest API')
  if (manifest?.snapshotInput !== draftProfile.manifestSnapshotInput || manifest?.issue?.selectedItemCount !== manifest?.itemIds?.length) {
    throw new Error('draft manifest API did not return a coherent publish manifest')
  }

  if (requireReady) {
    const readyUrl = new URL(`${draftProfile.apiPath}?require-ready=true`, origin)
    const readyDraft = await fetchJson(readyUrl, 'ready draft API')
    if (readyDraft?.manifest?.readiness?.status !== 'ready' || readyDraft?.manifest?.proseQuality?.status !== 'ready') {
      throw new Error('ready draft API did not return a ready publish manifest')
    }
  }
}

export function deploymentReadiness(snapshot) {
  const items = arrayValue(snapshot.items ?? snapshot.records)
  const sourceRuns = arrayValue(snapshot.sourceRuns ?? snapshot.source_runs)
  const focuses = arrayValue(snapshot.focuses)
  const selectedItems = draftSelection(items)
  const upvotedCount = items.filter((item) => reviewValue(item) > 0).length
  const liveSourceCount = sourceRuns.filter((run) => sourceRunStatus(run) === 'ok' && itemCount(run) > 0).length
  const liveProjectCount = new Set(sourceRuns.flatMap((run) => Object.keys(projectCounts(run)))).size
  const focusCount = focuses.filter((focus) => typeof focus?.text === 'string' && focus.text.trim()).length
  const selectedProjectCount = new Set(selectedItems.map((item) => item?.project ?? item?.subject).filter(Boolean)).size
  const sourceErrorCount = sourceRuns.filter((run) => sourceRunStatus(run) === 'error').length
  const freshness = snapshotFreshness(snapshot.generatedAt ?? snapshot.generated_at)
  const checks = [
    {
      label: 'Editorial picks',
      passed: upvotedCount > 0,
      detail: upvotedCount > 0 ? `${upvotedCount} upvoted items will lead the draft.` : 'Upvote at least one item before publishing.',
    },
    {
      label: 'Live source coverage',
      passed: liveSourceCount >= 3 && liveProjectCount >= 3,
      detail: `${liveSourceCount} sources returned live items across ${liveProjectCount} projects.`,
    },
    {
      label: 'Project spread',
      passed: selectedProjectCount >= 2 || selectedItems.length <= 1,
      detail: selectedItems.length ? `${selectedProjectCount} projects represented in the selected spine.` : 'No items are selected yet.',
    },
    {
      label: 'Editorial intent',
      passed: focusCount > 0,
      detail: focusCount > 0 ? `${focusCount} saved focus signals will shape the brief.` : 'Add this-week or ongoing focus before drafting.',
    },
    {
      label: 'Source health',
      passed: sourceErrorCount === 0,
      detail: sourceErrorCount === 0 ? 'No watched source is currently reporting an error.' : `${sourceErrorCount} watched sources need attention.`,
    },
    {
      label: 'Snapshot freshness',
      passed: freshness.fresh,
      detail: freshness.detail,
    },
  ]
  const passedCount = checks.filter((check) => check.passed).length
  const status = checks.every((check) => check.passed) ? 'ready' : 'needs_review'
  return {
    status,
    summary: status === 'ready' ? 'Ready for deployment publishing.' : `${passedCount}/${checks.length} readiness checks pass.`,
    checks,
  }
}

function snapshotFreshness(generatedAt) {
  const generated = Date.parse(generatedAt ?? '')
  if (!Number.isFinite(generated)) {
    return {
      fresh: false,
      detail: 'Snapshot generated_at is not a valid date.',
    }
  }
  const ageDays = Math.floor(Math.max(0, Date.now() - generated) / (24 * 60 * 60 * 1000))
  if (ageDays <= 14) {
    return {
      fresh: true,
      detail: ageDays === 0 ? 'Snapshot was generated today.' : `Snapshot was generated ${ageDays} day${ageDays === 1 ? '' : 's'} ago.`,
    }
  }
  return {
    fresh: false,
    detail: `Snapshot was generated ${ageDays} days ago; rerun collect --live before publishing.`,
  }
}

function draftSelection(items, limit = 7) {
  const sorted = [...items].sort((left, right) => {
    const voteDelta = reviewValue(right) - reviewValue(left)
    if (voteDelta !== 0) return voteDelta
    const scoreDelta = Number(right?.score ?? 0) - Number(left?.score ?? 0)
    if (scoreDelta !== 0) return scoreDelta
    return Date.parse(right?.publishedAt ?? right?.published_at ?? right?.observedAt ?? right?.observed_at ?? '') - Date.parse(left?.publishedAt ?? left?.published_at ?? left?.observedAt ?? left?.observed_at ?? '')
  })
  const included = sorted.filter((item) => reviewValue(item) > 0)
  return (included.length ? included : sorted.filter((item) => reviewValue(item) >= 0)).slice(0, limit)
}

function reviewValue(item) {
  return Number(item?.vote ?? item?.review ?? 0)
}

function itemCount(run) {
  return Number(run?.itemCount ?? run?.item_count ?? 0)
}

function projectCounts(run) {
  const value = run?.projectCounts ?? run?.project_counts ?? run?.subjectCounts ?? run?.subject_counts
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sourceRunStatus(run) {
  return run?.status === 'ok' || run?.status === 'error' || run?.status === 'pending' || run?.status === 'skipped' ? run.status : 'pending'
}

function arrayValue(value) {
  return Array.isArray(value) ? value : []
}
