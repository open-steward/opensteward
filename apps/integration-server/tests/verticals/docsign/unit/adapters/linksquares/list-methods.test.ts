/**
 * LinkSquares Finalize, per its OpenAPI (https://linksquares.com/api/openapi):
 *
 *   servers: [{ "url": "https://api.linksquares.com/api" }]
 *   securitySchemes: { "ApiKeyAuth": { "type": "apiKey", "name": "x-api-key", "in": "header" } }
 *
 *   GET /finalize/v2/agreements/{agreement_id}/agreement_versions — "List Agreement Versions"
 *     parameters: agreement_id (path) only
 *     200: { data: [{ id, file_name, status_id, created_at, deleted_at }],
 *            total_count,
 *            _links: { next: { href: "URL to the next page of items (null if none)",
 *                              example "https://api.linksquares.com/api/finalize/v2/agreements/
 *                              894e86b8-2866-494e-bb16-5aa19fce3348/agreement_versions?page=3&per_page=1" },
 *                      prev: { href } } }
 *
 * Nothing in the spec names a party or signer resource (the agreement's
 * `_embedded` holds only users, questions, token_values and statuses), and no
 * path serves an activity log. Those methods must refuse without a request.
 *
 * The fake serves agreement_versions in pages of its own size, and moves
 * between pages ONLY through the `_links.next.href` it minted. Query params on
 * the first request are ignored, as none are documented there.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { LinksquaresAdapter } from '../../../../../../src/verticals/docsign/adapters/linksquares/index'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'

const CREDS: Credentials = { accessToken: 'lsq_key' }
const OTHER_CREDS: Credentials = { accessToken: 'lsq_other_key' }
const AGREEMENT = '894e86b8-2866-494e-bb16-5aa19fce3348'
const BASE = 'https://api.linksquares.com/api/finalize/v2'
const adapter = new LinksquaresAdapter()

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

let calls: Call[]
let createConfig: { baseURL?: string; headers?: Record<string, string> } | undefined

function versions(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    file_name: `LinkSquares_NDA_v${i}.docx`,
    status_id: '7a1e5c3d-0b44-4f5e-a1a2-9c0d7e6b5a43',
    created_at: `2026-03-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
    deleted_at: null,
  }))
}

/** A fake Finalize server, paging agreement_versions at its own `pageSize`. */
function fakeLinksquares(
  rows: ReturnType<typeof versions>,
  opts: { pageSize?: number; nextHref?: (page: number) => string | null } = {},
) {
  const size = opts.pageSize ?? 3
  const listPath = `/agreements/${AGREEMENT}/agreement_versions`
  const href = (page: number) =>
    `${BASE}/agreements/${AGREEMENT}/agreement_versions?page=${page}&per_page=${size}`
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    calls.push({ path, params: config?.params })
    // A runaway pager fails the test here rather than hanging it.
    if (calls.length > 50) throw new Error('fake: too many requests')
    let page: number
    if (path === listPath) {
      page = 1
    } else if (path.startsWith(`${BASE}${listPath}?`)) {
      page = Number(new URL(path).searchParams.get('page'))
    } else {
      throw Object.assign(new Error(`undocumented path ${path}`), { response: { status: 404 } })
    }
    const start = (page - 1) * size
    const data = rows.slice(start, start + size)
    const more = start + size < rows.length
    const next = more ? (opts.nextHref ? opts.nextHref(page + 1) : href(page + 1)) : null
    return {
      data: {
        data,
        total_count: data.length,
        _links: { next: { href: next }, prev: { href: page > 1 ? href(page - 1) : null } },
      },
    }
  })
  vi.spyOn(axios, 'create').mockImplementation(((cfg: typeof createConfig) => {
    createConfig = cfg
    return { get } as unknown as ReturnType<typeof axios.create>
  }) as unknown as typeof axios.create)
  return get
}

async function walk(creds: Credentials, limit: number, pages: number) {
  const seen: string[] = []
  const orders: number[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params: QueryParams = withPageSink({ page, limit })
    const rows = await adapter.listDocuments(creds, AGREEMENT, params)
    for (const r of rows) DocumentSchema.parse(r)
    seen.push(...rows.map((r) => r.externalId))
    orders.push(...rows.map((r) => r.order))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, orders, hasMore }
}

beforeEach(() => {
  calls = []
  createConfig = undefined
  _resetCursorPager()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('linksquares listDocuments — List Agreement Versions', () => {
  it('sends the documented request: the versions path, the x-api-key header, no query params', async () => {
    fakeLinksquares(versions(2))
    await adapter.listDocuments(CREDS, AGREEMENT, { page: 1, limit: 10 })

    expect(createConfig?.baseURL).toBe(BASE)
    expect(createConfig?.headers?.['x-api-key']).toBe('lsq_key')
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe(`/agreements/${AGREEMENT}/agreement_versions`)
    expect(calls[0].params ?? {}).toEqual({})
  })

  it('never asks the agreement detail for embedded versions', async () => {
    fakeLinksquares(versions(2))
    await adapter.listDocuments(CREDS, AGREEMENT, { page: 1, limit: 10 })
    expect(calls.map((c) => c.path)).not.toContain(`/agreements/${AGREEMENT}`)
  })

  it('returns canonical documents parsed from the documented data[]', async () => {
    fakeLinksquares(versions(2))
    const out = await adapter.listDocuments(CREDS, AGREEMENT, { page: 1, limit: 10 })
    const docs = out.map((d) => DocumentSchema.parse(d))
    expect(docs.map((d) => d.externalId)).toEqual(versions(2).map((v) => v.id))
    expect(docs[0]).toMatchObject({
      id: `${AGREEMENT}:${versions(1)[0].id}`,
      envelopeId: AGREEMENT,
      name: 'LinkSquares_NDA_v0.docx',
      order: 0,
    })
  })

  it('follows _links.next.href across upstream pages', async () => {
    fakeLinksquares(versions(7), { pageSize: 3 })
    const out = await adapter.listDocuments(CREDS, AGREEMENT, { page: 1, limit: 7 })
    expect(out.map((d) => d.externalId)).toEqual(versions(7).map((v) => v.id))
    expect(calls.map((c) => c.path)).toEqual([
      `/agreements/${AGREEMENT}/agreement_versions`,
      `${BASE}/agreements/${AGREEMENT}/agreement_versions?page=2&per_page=3`,
      `${BASE}/agreements/${AGREEMENT}/agreement_versions?page=3&per_page=3`,
    ])
  })

  it('walks N = 2L+1 versions: every id once, order global, hasMore exact', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeLinksquares(versions(N), { pageSize: 3 })
    const { seen, orders, hasMore } = await walk(CREDS, L, 3)
    expect(seen).toEqual(versions(N).map((v) => v.id))
    expect(new Set(seen).size).toBe(N)
    expect(orders).toEqual(Array.from({ length: N }, (_, i) => i))
    expect(hasMore).toEqual([true, true, false])
  })

  it('walks N = 2L+1 when the upstream page equals the caller page', async () => {
    const L = 3
    const N = 2 * L + 1
    fakeLinksquares(versions(N), { pageSize: 3 })
    const { seen, hasMore } = await walk(CREDS, L, 3)
    expect(seen).toEqual(versions(N).map((v) => v.id))
    expect(hasMore).toEqual([true, true, false])
  })

  it('reports no more rows on an empty page past the end', async () => {
    fakeLinksquares(versions(2))
    const params = withPageSink({ page: 5, limit: 2 })
    expect(await adapter.listDocuments(CREDS, AGREEMENT, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('does not share one connection’s rows with another connection', async () => {
    fakeLinksquares(versions(5), { pageSize: 3 })
    // Page 1 ends on an upstream boundary, so the pager peeks at (and keeps)
    // upstream page 2. Another connection's page 2 must not be served from it.
    await adapter.listDocuments(CREDS, AGREEMENT, { page: 1, limit: 3 })
    const before = calls.length
    await adapter.listDocuments(OTHER_CREDS, AGREEMENT, { page: 2, limit: 3 })
    expect(calls.length).toBeGreaterThan(before)
  })

  it('refuses a next href off the LinkSquares API rather than send the key there', async () => {
    const get = fakeLinksquares(versions(5), {
      pageSize: 3,
      nextHref: (p) => `https://evil.example/api/finalize/v2/x?page=${p}`,
    })
    await expect(adapter.listDocuments(CREDS, AGREEMENT, { page: 1, limit: 5 })).rejects.toThrow(
      /next page/,
    )
    expect(get.mock.calls.map((c) => c[0])).not.toContainEqual(
      expect.stringContaining('evil.example'),
    )
  })

  it('refuses a same-origin next href outside /api/finalize/v2/', async () => {
    const get = fakeLinksquares(versions(5), {
      pageSize: 3,
      nextHref: (p) => `https://api.linksquares.com/api/analyze/v1/agreements?page=${p}`,
    })
    await expect(adapter.listDocuments(CREDS, AGREEMENT, { page: 1, limit: 5 })).rejects.toThrow(
      /next page/,
    )
    expect(get.mock.calls.map((c) => c[0])).not.toContainEqual(
      expect.stringContaining('/api/analyze/'),
    )
  })
})

describe('linksquares getDocument — reads back an id listDocuments returned', () => {
  it('returns the same canonical document, with its list position', async () => {
    fakeLinksquares(versions(7), { pageSize: 3 })
    const listed = await adapter.listDocuments(CREDS, AGREEMENT, { page: 2, limit: 3 })
    const target = listed[1]
    const got = DocumentSchema.parse(await adapter.getDocument(CREDS, target.id))
    expect(got).toEqual(DocumentSchema.parse(target))
    expect(got.order).toBe(4)
  })

  it('never calls the agreement detail', async () => {
    fakeLinksquares(versions(2))
    await adapter.getDocument(CREDS, `${AGREEMENT}:${versions(2)[1].id}`)
    expect(calls.every((c) => c.path.includes('/agreement_versions'))).toBe(true)
  })

  it('throws a 404 for a version the agreement does not have', async () => {
    fakeLinksquares(versions(2))
    await expect(adapter.getDocument(CREDS, `${AGREEMENT}:no-such-version`)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('stops, with a 404, when the upstream next href points back at the same page', async () => {
    // Page 2 names itself as the next page; the walk must not loop on it.
    const self = `${BASE}/agreements/${AGREEMENT}/agreement_versions?page=2&per_page=3`
    fakeLinksquares(versions(9), { pageSize: 3, nextHref: () => self })
    await expect(adapter.getDocument(CREDS, `${AGREEMENT}:no-such-version`)).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(calls.map((c) => c.path)).toEqual([`/agreements/${AGREEMENT}/agreement_versions`, self])
  })

  it('rejects an id that is not "<agreementId>:<versionId>" without a request', async () => {
    const get = fakeLinksquares(versions(2))
    await expect(adapter.getDocument(CREDS, AGREEMENT)).rejects.toThrow(/<agreementId>:<versionId>/)
    expect(get).not.toHaveBeenCalled()
  })
})

describe('linksquares refused resources — no request is sent', () => {
  const cases: Array<[string, () => Promise<unknown>, RegExp]> = [
    ['listSigners', () => adapter.listSigners(CREDS, AGREEMENT, { page: 1, limit: 10 }), /signers/],
    ['getSigner', () => adapter.getSigner(CREDS, `${AGREEMENT}:p1`), /signers/],
    [
      'listAuditTrailEntries',
      () => adapter.listAuditTrailEntries(CREDS, AGREEMENT, { page: 1, limit: 10 }),
      /audit/,
    ],
    ['getAuditTrailEntry', () => adapter.getAuditTrailEntry(CREDS, `${AGREEMENT}:0`), /audit/],
  ]

  it.each(cases)('%s throws 501 NOT_SUPPORTED', async (_name, call, message) => {
    const get = fakeLinksquares(versions(2))
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    await expect(call()).rejects.toThrow(message)
    expect(get).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })
})

describe('linksquares listDocuments — a body without the required data[]', () => {
  it('throws instead of reading it as an empty agreement', async () => {
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async () => ({ data: { total_count: 0, _links: {} } })),
    })) as unknown as typeof axios.create)
    await expect(adapter.listDocuments(CREDS, AGREEMENT, { page: 1, limit: 10 })).rejects.toThrow(
      /no data array/,
    )
  })
})
