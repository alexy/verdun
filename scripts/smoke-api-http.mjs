import { allowMethods, parseBody, sendJson } from '../api/newsletter/_http.ts'

function responseRecorder() {
  return {
    body: undefined,
    code: undefined,
    headers: {},
    status(code) {
      this.code = code
      return this
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    json(body) {
      this.body = body
    },
    end(body) {
      this.body = body
    },
  }
}

const blocked = responseRecorder()
if (allowMethods({ method: 'DELETE', query: {} }, blocked, ['GET', 'HEAD'])) {
  throw new Error('DELETE was not blocked')
}
if (blocked.code !== 405 || blocked.headers.allow !== 'GET, HEAD') {
  throw new Error('method guard did not return a 405 with allow header')
}

const allowed = responseRecorder()
if (!allowMethods({ method: 'HEAD', query: {} }, allowed, ['GET', 'HEAD'])) {
  throw new Error('HEAD was not allowed')
}

const body = parseBody({ method: 'POST', query: {}, body: { itemId: 'item-1', vote: 1 } })
if (body.itemId !== 'item-1' || body.vote !== 1) {
  throw new Error('object body was not parsed')
}
if (Object.keys(parseBody({ method: 'POST', query: {}, body: ['bad'] })).length) {
  throw new Error('array body should not parse as an object')
}

const sent = responseRecorder()
sendJson(sent, { ok: true })
if (sent.code !== 200 || sent.body?.ok !== true || !sent.headers['cache-control']?.includes('s-maxage=15')) {
  throw new Error('sendJson did not write the expected response')
}
