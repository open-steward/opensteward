/**
 * DocuSeal list paging.
 *
 * Submissions and templates page by id cursor
 * (https://www.docuseal.com/docs/api/list-all-submissions.md):
 *   limit: "The number of submissions to return. Default value is 10. Maximum
 *          value is 100."
 *   after: "Pass ID value from the `pagination.next` response to load the next
 *          batch of submissions."
 * and the same for templates
 * (https://www.docuseal.com/docs/api/list-all-templates.md).
 *
 * `pagination.next` is the last row's id on every non-empty page
 * (`next: submissions.last&.id` in docusealco/docuseal
 * app/controllers/api/submissions_controller.rb), so it never says "no more"
 * on its own: a page shorter than the limit is the end. Rows come newest
 * first (`order(id: :desc)`), and `after` keeps ids below the cursor
 * (`where(id: ...params[:after])` in api_base_controller.rb).
 *
 * Signers, documents and audit-trail entries come from one submission
 * (`GET /submissions/{id}` and `GET /submissions/{id}/documents`), whose only
 * parameters are the id (and `merge` for documents), so they are paged locally.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { DocusealClient } from '../../../../../../src/verticals/docsign/adapters/docuseal/client'
import { DocusealAdapter } from '../../../../../../src/verticals/docsign/adapters/docuseal'

const CREDS = { accessToken: 'ds_key' } as Credentials
const L = 2
const N = 2 * L + 1
const MAX = 100
const CALL_BUDGET = 50

afterEach(() => vi.restoreAllMocks())
beforeEach(() => _resetCursorPager())

const adapter = new DocusealAdapter()

/**
 * A fake DocuSeal list endpoint honouring ONLY `limit` (default 10, max 100)
 * and `after`, with the server's newest-first order and `pagination.next` set
 * to the last row's id whenever the page is non-empty.
 */
function fakeList(path: string, total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: total - i, name: `r${total - i}` }))
  let calls = 0
  return vi
    .spyOn(DocusealClient.prototype, 'get')
    .mockImplementation(async (p: string, params?: Record<string, unknown>) => {
      if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
      if (p !== path) throw new Error(`unexpected path ${p}`)
      const limit = Math.min(Number(params?.['limit'] ?? 10), MAX)
      const after = params?.['after']
      const rows = (after != null ? all.filter((r) => r.id < Number(after)) : all).slice(0, limit)
      return {
        data: rows,
        pagination: {
          count: rows.length,
          next: rows.at(-1)?.id ?? null,
          prev: rows[0]?.id ?? null,
        },
      } as never
    })
}

type TopLister = (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>
const TOP: Array<[string, string, TopLister]> = [
  ['listEnvelopes', '/submissions', (c, p) => adapter.listEnvelopes(c, p)],
  ['listTemplates', '/templates', (c, p) => adapter.listTemplates(c, p)],
]

const desc = (n: number) => Array.from({ length: n }, (_, i) => String(n - i))

describe('DocusealAdapter capabilities', () => {
  it('declares the documented maximum page size (100)', () => {
    expect(adapter.capabilities).toEqual(expect.objectContaining({ maxPageSize: 100 }))
  })
})

describe.each(TOP)('DocusealAdapter.%s pages by the `after` cursor', (_name, path, list) => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeList(path, N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(desc(N))
    expect(more).toEqual([true, true, false])
  })

  it('page 2 sends the documented `after` key carrying page 1 pagination.next', async () => {
    const get = fakeList(path, N)
    await list(CREDS, withPageSink({ page: 1, limit: L }))
    await list(CREDS, withPageSink({ page: 2, limit: L }))
    const sent = get.mock.calls.map((c) => c[1])
    expect(sent[0]).toEqual({ limit: L })
    expect(sent[1]).toEqual({ limit: L, after: N - L + 1 })
  })

  it('page 2 with a cold cache walks from page 1 and returns rows L+1..2L', async () => {
    fakeList(path, N)
    const rows = await list(CREDS, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(desc(N).slice(L, 2 * L))
  })

  it('an exactly full last page reports its end on the following empty page', async () => {
    fakeList(path, 2 * L)
    const p2 = withPageSink({ page: 2, limit: L })
    await list(CREDS, withPageSink({ page: 1, limit: L }))
    expect((await list(CREDS, p2)).map((r) => r.id)).toEqual(desc(2 * L).slice(L))
    const p3 = withPageSink({ page: 3, limit: L })
    expect(await list(CREDS, p3)).toEqual([])
    expect(readUpstreamPage(p3)?.hasMore).toBe(false)
  })

  it('a limit above the documented maximum (100) is clamped', async () => {
    const get = fakeList(path, 150)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await list(CREDS, params)
    expect(rows).toHaveLength(MAX)
    expect(get.mock.calls[0]![1]).toEqual({ limit: MAX })
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    fakeList(path, N)
    const params = withPageSink(parseListQuery({ page: '2', limit: String(L) }, adapter))
    const rows = await list(CREDS, params)
    const env = listPage(rows, params, 'docuseal')
    expect(env.data.map((r) => r.id)).toEqual(desc(N).slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.hasMore).toBe(true)
  })
})

// ── Pager-key isolation and the caller's start point ────────────────────────

/** Serves both cursor paths, honouring only `limit` and `after`. */
function fakeBoth(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: total - i, name: `r${total - i}` }))
  return vi
    .spyOn(DocusealClient.prototype, 'get')
    .mockImplementation(async (p: string, params?: Record<string, unknown>) => {
      if (p !== '/submissions' && p !== '/templates') throw new Error(`unexpected path ${p}`)
      const limit = Math.min(Number(params?.['limit'] ?? 10), MAX)
      const after = params?.['after']
      const rows = (after != null ? all.filter((r) => r.id < Number(after)) : all).slice(0, limit)
      return {
        data: rows,
        pagination: {
          count: rows.length,
          next: rows.at(-1)?.id ?? null,
          prev: rows[0]?.id ?? null,
        },
      } as never
    })
}

const OTHER_TOKEN = { accessToken: 'ds_other_key' } as Credentials
const SELF_HOSTED = {
  accessToken: 'ds_key',
  extra: { baseUrl: 'https://sign.example.com' },
} as unknown as Credentials
const envelopes: TopLister = (c, p) => adapter.listEnvelopes(c, p)
const templates: TopLister = (c, p) => adapter.listTemplates(c, p)

/**
 * Page 1 is walked under context A; page 2 is then asked for under context B
 * with no reset. B has never been walked, so it must start from its own page 1
 * (first request carries only B's own start point) and never reuse A's cursor.
 */
type Ctx = { creds: Credentials; list: TopLister; extra?: Record<string, unknown> }
const ISOLATION: Array<[string, Ctx, Ctx]> = [
  [
    'another connection on the same host (different API key)',
    { creds: CREDS, list: envelopes },
    { creds: OTHER_TOKEN, list: envelopes },
  ],
  [
    'another host with the same API key (self-hosted baseUrl)',
    { creds: CREDS, list: envelopes },
    { creds: SELF_HOSTED, list: envelopes },
  ],
  [
    'another collection (/templates after /submissions)',
    { creds: CREDS, list: envelopes },
    { creds: CREDS, list: templates },
  ],
  [
    'another filter (status)',
    { creds: CREDS, list: envelopes },
    { creds: CREDS, list: envelopes, extra: { status: 'completed' } },
  ],
  [
    'another caller start point (`after`)',
    { creds: CREDS, list: envelopes, extra: { after: 100 } },
    { creds: CREDS, list: envelopes, extra: { after: 50 } },
  ],
]

describe.each(ISOLATION)('DocusealAdapter cursor keys: %s', (_n, a, b) => {
  it("page 2 walks from B's own page 1 instead of reusing A's cursor", async () => {
    const get = fakeBoth(200)
    await a.list(a.creds, withPageSink({ ...a.extra, page: 1, limit: L }))
    const walkedA = get.mock.calls.length
    const rows = await b.list(b.creds, withPageSink({ ...b.extra, page: 2, limit: L }))
    const sentB = get.mock.calls.slice(walkedA).map((c) => c[1] as Record<string, unknown>)
    expect(sentB).toHaveLength(2)
    expect(sentB[0]!['after']).toBe(b.extra?.['after'])
    const start = Number(b.extra?.['after'] ?? 201)
    expect(rows.map((r) => r.id)).toEqual([String(start - L - 1), String(start - L - 2)])
  })
})

describe.each(TOP)('DocusealAdapter.%s honours a caller `after`', (_name, path, list) => {
  it('page 1 starts below the caller `after`, and page 2 continues from there', async () => {
    const get = fakeList(path, N + 5)
    const p1 = await list(CREDS, withPageSink({ after: N, page: 1, limit: L }))
    const p2 = await list(CREDS, withPageSink({ after: N, page: 2, limit: L }))
    expect(get.mock.calls[0]![1]).toEqual({ limit: L, after: N })
    expect([...p1, ...p2].map((r) => r.id)).toEqual(desc(N - 1).slice(0, 2 * L))
  })
})

// ── Sub-resources of one submission ──────────────────────────────────────────

const ENV_ID = '77'

function submission(n: number) {
  return {
    id: 77,
    status: 'pending',
    submitters: Array.from({ length: n }, (_, i) => ({
      id: 100 + i,
      submission_id: 77,
      email: `s${i}@example.com`,
      status: 'sent',
    })),
    submission_events: Array.from({ length: n }, (_, i) => ({
      id: 500 + i,
      submitter_id: 100 + i,
      event_type: 'send_email',
      event_timestamp: `2026-01-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`,
    })),
  }
}

/** Honours only the documented path id; every query param is ignored. */
function fakeSubmission(n: number) {
  return vi.spyOn(DocusealClient.prototype, 'get').mockImplementation(async (p: string) => {
    if (p === `/submissions/${ENV_ID}`) return submission(n) as never
    if (p === `/submissions/${ENV_ID}/documents`) {
      return {
        id: 77,
        documents: Array.from({ length: n }, (_, i) => ({ name: `d${i}.pdf`, url: 'x' })),
      } as never
    }
    throw new Error(`unexpected path ${p}`)
  })
}

type SubLister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const SUB: Array<[string, SubLister, string[]]> = [
  [
    'listSigners',
    (c, id, p) => adapter.listSigners(c, id, p),
    Array.from({ length: N }, (_, i) => String(100 + i)),
  ],
  [
    'listDocuments',
    (c, id, p) => adapter.listDocuments(c, id, p),
    Array.from({ length: N }, (_, i) => `${ENV_ID}:${i}`),
  ],
  [
    'listAuditTrailEntries',
    (c, id, p) => adapter.listAuditTrailEntries(c, id, p),
    Array.from({ length: N }, (_, i) => String(500 + i)),
  ],
]

describe.each(SUB)('DocusealAdapter.%s pages the whole submission locally', (_n, list, ids) => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeSubmission(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await list(CREDS, ENV_ID, params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('a limit above the maximum is clamped by parseListQuery', async () => {
    fakeSubmission(150)
    const params = withPageSink(parseListQuery({ page: '1', limit: '500' }, adapter))
    const rows = await list(CREDS, ENV_ID, params)
    expect(rows).toHaveLength(MAX)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    fakeSubmission(N)
    const params = withPageSink(parseListQuery({ page: '2', limit: String(L) }, adapter))
    const env = listPage(await list(CREDS, ENV_ID, params), params, 'docuseal')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('DocusealAdapter get* lookups still see the whole submission', () => {
  it('getDocument finds a document past the first page', async () => {
    fakeSubmission(N)
    const d = await adapter.getDocument(CREDS, `${ENV_ID}:${N - 1}`)
    expect(d.id).toBe(`${ENV_ID}:${N - 1}`)
  })

  it('getAuditTrailEntry resolves the last event', async () => {
    fakeSubmission(N)
    const e = await adapter.getAuditTrailEntry(CREDS, `${ENV_ID}:${N - 1}`)
    expect(e.id).toBe(String(500 + N - 1))
  })
})
