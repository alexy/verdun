import assert from 'node:assert/strict'
import {
  VercelProjectDomains,
  VercelProjectDomainsError,
} from '../lib/src/domains/vercel.js'

await attachUsesLiveRecommendations()
await existingAttachRequiresExactProjectProof()
await refreshToleratesPendingVerification()
await detach404RequiresProjectProof()
await listFollowsPagination()
await mismatchedProjectFailsClosed()

console.log('Vercel project-domain smoke passed')

async function attachUsesLiveRecommendations() {
  const fetch = queuedFetch([
    jsonResponse({
      name: 'example.com',
      apexName: 'example.com',
      projectId: 'prj_test',
      verified: false,
      verification: [{
        type: 'TXT',
        domain: '_vercel.example.com',
        value: 'vc-domain-verify=example.com,proof',
      }],
    }),
    jsonResponse({
      configuredBy: null,
      recommendedIPv4: [
        { rank: 2, value: ['192.0.2.2'] },
        { rank: 1, value: ['192.0.2.1'] },
      ],
      recommendedCNAME: [{ rank: 1, value: 'project.vercel-dns.example' }],
      misconfigured: true,
    }),
  ])

  const snapshot = await client(fetch).attach('example.com')
  assert.deepEqual(snapshot.trafficRecords, [{
    type: 'A',
    name: '@',
    value: '192.0.2.1',
    purpose: 'traffic',
  }])
  assert.deepEqual(snapshot.verificationRecords, [{
    type: 'TXT',
    name: '_vercel.example.com',
    value: 'vc-domain-verify=example.com,proof',
    purpose: 'verification',
  }])
  assert.match(fetch.calls[0].url, /\/v10\/projects\/prj_test\/domains\?slug=team-test$/)
  assert.equal(fetch.calls[0].init.headers.authorization, 'Bearer test-token')
}

async function existingAttachRequiresExactProjectProof() {
  const fetch = queuedFetch([
    jsonResponse({ error: { code: 'not_modified', message: 'Already exists.' } }, 400),
    jsonResponse({
      name: 'go.example.com',
      apexName: 'example.com',
      projectId: 'prj_test',
      verified: true,
    }),
    jsonResponse({
      configuredBy: 'CNAME',
      recommendedIPv4: [],
      recommendedCNAME: [{ rank: 1, value: 'project.vercel-dns.example' }],
      misconfigured: false,
    }),
  ])
  const snapshot = await client(fetch).attach('go.example.com', { allowExisting: true })
  assert.deepEqual(snapshot.trafficRecords, [{
    type: 'CNAME',
    name: 'go',
    value: 'project.vercel-dns.example',
    purpose: 'traffic',
  }])

  const conflictFetch = queuedFetch([
    jsonResponse({ error: { code: 'domain_taken', message: 'Owned elsewhere.' } }, 409),
  ])
  await assert.rejects(
    client(conflictFetch).attach('go.example.com', { allowExisting: true }),
    (error) => error instanceof VercelProjectDomainsError
      && error.code === 'api_error'
      && error.statusCode === 409,
  )
  assert.equal(conflictFetch.calls.length, 1)
}

async function refreshToleratesPendingVerification() {
  const domain = {
    name: 'pending.example.com',
    apexName: 'example.com',
    projectId: 'prj_test',
    verified: false,
  }
  const fetch = queuedFetch([
    jsonResponse(domain),
    jsonResponse({ error: { code: 'missing_txt', message: 'TXT is pending.' } }, 400),
    jsonResponse(domain),
    jsonResponse({
      configuredBy: null,
      recommendedIPv4: [],
      recommendedCNAME: [{ rank: 1, value: 'project.vercel-dns.example' }],
      misconfigured: true,
    }),
  ])
  const snapshot = await client(fetch).refresh('pending.example.com')
  assert.equal(snapshot.verified, false)
  assert.equal(snapshot.misconfigured, true)
  assert.match(fetch.calls[1].url, /\/verify\?slug=team-test$/)
}

async function detach404RequiresProjectProof() {
  const fetch = queuedFetch([
    jsonResponse({ error: { code: 'not_found', message: 'Not found.' } }, 404),
    jsonResponse({ id: 'prj_test' }),
  ])
  await client(fetch).detach('gone.example.com')
  assert.match(fetch.calls[1].url, /\/v9\/projects\/prj_test\?slug=team-test$/)

  const badScopeFetch = queuedFetch([
    jsonResponse({ error: { code: 'not_found', message: 'Not found.' } }, 404),
    jsonResponse({ error: { code: 'not_found', message: 'Project not found.' } }, 404),
  ])
  await assert.rejects(
    client(badScopeFetch).detach('gone.example.com'),
    (error) => error instanceof VercelProjectDomainsError
      && error.code === 'api_error'
      && error.statusCode === 404,
  )
}

async function listFollowsPagination() {
  const fetch = queuedFetch([
    jsonResponse({
      domains: [projectDomain('one.example.com'), projectDomain('two.example.com')],
      pagination: { count: 2, next: 123, prev: null },
    }),
    jsonResponse({
      domains: [projectDomain('three.example.com')],
      pagination: { count: 1, next: null, prev: 456 },
    }),
  ])
  const domains = await client(fetch).list({ pageSize: 2 })
  assert.deepEqual(domains.map((domain) => domain.name), [
    'one.example.com',
    'two.example.com',
    'three.example.com',
  ])
  assert.match(fetch.calls[0].url, /limit=2&slug=team-test$/)
  assert.match(fetch.calls[1].url, /limit=2&until=123&slug=team-test$/)
}

async function mismatchedProjectFailsClosed() {
  const fetch = queuedFetch([
    jsonResponse({
      ...projectDomain('other.example.com'),
      projectId: 'prj_other',
    }),
  ])
  await assert.rejects(
    client(fetch).attach('other.example.com'),
    (error) => error instanceof VercelProjectDomainsError
      && error.code === 'invalid_response',
  )
}

function client(fetch) {
  return new VercelProjectDomains({
    token: 'test-token',
    projectId: 'prj_test',
    teamSlug: 'team-test',
    fetch,
  })
}

function projectDomain(name) {
  return {
    name,
    apexName: 'example.com',
    projectId: 'prj_test',
    verified: true,
  }
}

function queuedFetch(responses) {
  const queue = [...responses]
  const calls = []
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    const response = queue.shift()
    assert.ok(response, `Unexpected Vercel request to ${url}`)
    return response
  }
  fetch.calls = calls
  return fetch
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
