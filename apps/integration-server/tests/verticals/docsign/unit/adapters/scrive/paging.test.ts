import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { ScriveClient } from '../../../../../../src/verticals/docsign/adapters/scrive/client'
import { ScriveAdapter } from '../../../../../../src/verticals/docsign/adapters/scrive'
import {
  API_BASE_URL,
  OAUTH_AUTHORIZE_URL,
  OAUTH_TOKEN_URL,
} from '../../../../../../src/verticals/docsign/adapters/scrive/constants'
import { documentExample, historyExample } from './fixtures'

/**
 * Scrive's GET /documents/list (https://apidocs.scrive.com/, "List documents"):
 *   offset "Starting offset for documents to return."
 *   max    "Maximum number of documents to return. Server may cap to a lower value."
 *   filter "List of filtering options ... Must be of type List Filter"
 *   200    "A JSON object containing the total number of matching documents,
 *           and an array of documents. The total_matching value is capped at
 *           1,000 + offset."
 * The fake honours ONLY offset, max and filter (is_template / is_not_template /
 * status), leaves "awaiting_start" documents out unless a status filter names
 * them ("Note that documents with "awaiting_start" status won't be listed,
 * unless they are explicitly specified by status filter."), and can cap max
 * like the server may.
 */

const CREDS = { accessToken: 'tok', refreshToken: 'rt' } as Credentials
const adapter = new ScriveAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'https://x' })

afterEach(() => vi.restoreAllMocks())

const ENVELOPE_FILTER =
  '[{"filter_by":"is_not_template"},{"filter_by":"status","statuses":' +
  '["preparation","awaiting_start","pending","closed","canceled","timedout","rejected","document_error"]}]'

function fakeList(
  n: number,
  opts: { cap?: number; templates?: number; awaitingStart?: number[] } = {},
) {
  const docs = Array.from({ length: n }, (_, i) => ({
    ...documentExample(),
    id: `d${i}`,
    status: opts.awaitingStart?.includes(i) ? 'awaiting_start' : 'closed',
    is_template: false,
  }))
  const tpls = Array.from({ length: opts.templates ?? 0 }, (_, i) => ({
    ...documentExample(),
    id: `t${i}`,
    is_template: true,
  }))
  return vi
    .spyOn(ScriveClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/documents/list') throw new Error(`unexpected path ${path}`)
      const filter = JSON.parse(String(params?.['filter'] ?? '[]')) as Array<{
        filter_by: string
        statuses?: string[]
      }>
      let all = [...docs, ...tpls]
      if (filter.some((f) => f.filter_by === 'is_template')) all = tpls
      if (filter.some((f) => f.filter_by === 'is_not_template')) all = docs
      const statuses = filter.find((f) => f.filter_by === 'status')?.statuses
      all = statuses
        ? all.filter((d) => statuses.includes(String(d.status)))
        : all.filter((d) => d.status !== 'awaiting_start')
      const offset = Number(params?.['offset'] ?? 0)
      let max = Number(params?.['max'] ?? 100)
      if (opts.cap !== undefined) max = Math.min(max, opts.cap)
      return {
        total_matching: Math.min(all.length, 1000 + offset),
        documents: all.slice(offset, offset + max),
      } as never
    })
}

describe('ScriveAdapter hosts', () => {
  it('uses the documented host and OAuth2 endpoint', () => {
    expect(API_BASE_URL).toBe('https://scrive.com/api/v2')
    expect(adapter.getAuthUrl('st').startsWith(`${OAUTH_AUTHORIZE_URL}?`)).toBe(true)
    expect(OAUTH_AUTHORIZE_URL).toBe('https://oauth2.scrive.com/oauth2/auth')
  })

  it('asks for the documented OAuth2 scopes, not the OAuth1 privilege names', () => {
    const url = new URL(adapter.getAuthUrl('st'))
    expect(url.searchParams.get('scope')).toBe('doc:create doc:check doc:send offline_access')
  })

  it('exchanges the code at the documented OAuth2 token endpoint', async () => {
    expect(OAUTH_TOKEN_URL).toBe('https://oauth2.scrive.com/oauth2/token')
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'a', refresh_token: 'r', token_type: 'Bearer', expires_in: 3600 },
    })
    await adapter.exchangeCode('code', 'https://x')
    await adapter.refreshCredentials(CREDS)
    expect(post.mock.calls.map(([url]) => url)).toEqual([
      'https://oauth2.scrive.com/oauth2/token',
      'https://oauth2.scrive.com/oauth2/token',
    ])
  })

  it('the client sends to the documented base URL with a Bearer token', () => {
    const create = vi.spyOn(axios, 'create')
    new ScriveClient(CREDS)
    expect(create.mock.calls[0]![0]).toMatchObject({
      baseURL: 'https://scrive.com/api/v2',
      headers: { Authorization: 'Bearer tok' },
    })
  })
})

describe('ScriveAdapter.listEnvelopes pages by offset/max', () => {
  const L = 4
  const N = 2 * L + 1

  it('walks N = 2L+1 documents: every id once, hasMore exact', async () => {
    const get = fakeList(N, { templates: 3 })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `d${i}`))
    expect(more).toEqual([true, true, false])
    expect(get.mock.calls.map(([, p]) => p)).toEqual(
      [0, L, 2 * L].map((offset) => ({
        offset,
        max: L,
        filter: ENVELOPE_FILTER,
      })),
    )
  })

  it('fills the page when the server caps max, advancing by the rows returned', async () => {
    const get = fakeList(N, { cap: 3 })
    const params = withPageSink({ page: 1, limit: L })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['d0', 'd1', 'd2', 'd3'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(get.mock.calls.map(([, p]) => [p?.['offset'], p?.['max']])).toEqual([
      [0, 4],
      [3, 1],
    ])
  })

  it('reads hasMore past a total_matching capped at 1,000 + offset', async () => {
    fakeList(1500)
    const params = withPageSink({ page: 1, limit: 1000 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows).toHaveLength(1000)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('lists documents in awaiting_start by naming every status', async () => {
    fakeList(3, { awaitingStart: [1] })
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => [r.id, r.metadata['status']])).toEqual([
      ['d0', 'closed'],
      ['d1', 'awaiting_start'],
      ['d2', 'closed'],
    ])
  })

  it('stops after 50 requests when the server caps max at one row', async () => {
    const get = fakeList(200, { cap: 1 })
    const params = withPageSink({ page: 1, limit: 100 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(get).toHaveBeenCalledTimes(50)
    expect(rows).toHaveLength(50)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('throws when the response has no total_matching', async () => {
    vi.spyOn(ScriveClient.prototype, 'get').mockResolvedValue({ documents: [] } as never)
    await expect(adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: 2 }))).rejects.toThrow(
      /total_matching/,
    )
  })

  it('an empty page ends the walk even when total_matching says more', async () => {
    const get = vi
      .spyOn(ScriveClient.prototype, 'get')
      .mockImplementation(
        async (_path: string, p?: Record<string, unknown>) =>
          ({ total_matching: 1000 + Number(p?.['offset']), documents: [] }) as never,
      )
    const params = withPageSink({ page: 1, limit: 2 })
    expect(await adapter.listEnvelopes(CREDS, params)).toEqual([])
    expect(get).toHaveBeenCalledTimes(1)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an exact last page reports hasMore false', async () => {
    fakeList(2 * L)
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['d4', 'd5', 'd6', 'd7'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('ScriveAdapter.listTemplates filters is_template and pages the same way', () => {
  it('walks 2L+1 templates', async () => {
    const L = 2
    const get = fakeList(4, { templates: 2 * L + 1 })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await adapter.listTemplates(CREDS, params)).map((t) => t.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['t0', 't1', 't2', 't3', 't4'])
    expect(more).toEqual([true, true, false])
    for (const [, p] of get.mock.calls) {
      expect(p?.['filter']).toBe('[{"filter_by":"is_template"}]')
      expect(p).not.toHaveProperty('template')
    }
  })
})

describe('ScriveAdapter envelope-scoped lists', () => {
  function fakeGet(body: unknown, expectPath: string) {
    return vi.spyOn(ScriveClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path !== expectPath) throw new Error(`unexpected path ${path}`)
      return body as never
    })
  }

  it('listSigners reads parties from /documents/{id}/get and pages locally', async () => {
    const doc = documentExample()
    const get = fakeGet(doc, `/documents/${doc.id}/get`)
    const p1 = withPageSink({ page: 1, limit: 1 })
    const p2 = withPageSink({ page: 2, limit: 1 })
    const a = await adapter.listSigners(CREDS, doc.id, p1)
    const b = await adapter.listSigners(CREDS, doc.id, p2)
    expect([...a, ...b].map((s) => s.id)).toEqual(['189255', '189256'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('URL-encodes the document id in /documents/{id}/get', async () => {
    const get = fakeGet(documentExample(), '/documents/a%2Fb/get')
    await adapter.getEnvelope(CREDS, 'a/b')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('listDocuments reads file / sealed_file from /documents/{id}/get', async () => {
    const doc = documentExample()
    fakeGet(doc, `/documents/${doc.id}/get`)
    const params = withPageSink({ page: 1, limit: 10 })
    const out = await adapter.listDocuments(CREDS, doc.id, params)
    expect(out.map((d) => d.id)).toEqual(['195124', '195172'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('listAuditTrailEntries reads /documents/{id}/history, oldest first, and propagates errors', async () => {
    const history = {
      events: [
        { status: 'signed', time: '2015-06-07T10:00:00Z', party: 'Magnus', text: 'Signed.' },
        ...historyExample().events!,
      ],
    }
    fakeGet(history, '/documents/42/history')
    const params = withPageSink({ page: 1, limit: 1 })
    const out = await adapter.listAuditTrailEntries(CREDS, '42', params)
    expect(out.map((e) => [e.id, e.eventType])).toEqual([['42:0', 'created']])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    const second = await adapter.getAuditTrailEntry(CREDS, '42:1')
    expect(second.eventType).toBe('signed')

    vi.restoreAllMocks()
    vi.spyOn(ScriveClient.prototype, 'get').mockRejectedValue(new Error('boom'))
    await expect(adapter.listAuditTrailEntries(CREDS, '42', {})).rejects.toThrow('boom')
  })
})
