import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { BoxSignClient } from '../../../../../../src/verticals/docsign/adapters/box-sign/client'
import { BoxSignAdapter } from '../../../../../../src/verticals/docsign/adapters/box-sign'

/**
 * Signers, documents and audit-trail entries all come from
 * `GET /sign_requests/{sign_request_id}`, whose only parameter is the path id
 * ("Path Parameters sign_request_id string required The ID of the signature
 * request." — https://developer.box.com/reference/get-sign-requests-id/). The
 * reply is one SignRequest carrying its whole `signers[]` and `source_files[]`
 * arrays. There is no upstream page to ask for, so the adapter must page the
 * collection itself, or page 2 repeats page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const ENV_ID = 'sr-1'
const L = 2
const N = 2 * L + 1

function fakeSignRequest(n: number) {
  const signers = Array.from({ length: n }, (_, i) => ({
    id: `sg-${i}`,
    email: `s${i}@example.com`,
    role: 'signer',
    email_sent_at: `2026-01-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`,
  }))
  const source_files = Array.from({ length: n }, (_, i) => ({
    id: `f-${i}`,
    type: 'file',
    name: `f-${i}.pdf`,
  }))
  return { id: ENV_ID, type: 'sign-request', signers, source_files }
}

/** Honours only the documented path parameter; ignores every query param. */
function mockGetSignRequest(n: number) {
  return vi
    .spyOn(BoxSignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/sign_requests/${ENV_ID}`) throw new Error(`unexpected path ${path}`)
      void params
      return fakeSignRequest(n) as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new BoxSignAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const METHODS: Array<[string, Lister, string[]]> = [
  [
    'listSigners',
    (c, id, p) => adapter.listSigners(c, id, p),
    Array.from({ length: N }, (_, i) => `${ENV_ID}:sg-${i}`),
  ],
  [
    'listDocuments',
    (c, id, p) => adapter.listDocuments(c, id, p),
    Array.from({ length: N }, (_, i) => `${ENV_ID}:f-${i}`),
  ],
  [
    'listAuditTrailEntries',
    (c, id, p) => adapter.listAuditTrailEntries(c, id, p),
    // One synthesised `sent` event per signer; indices span the whole request.
    Array.from({ length: N }, (_, i) => `${ENV_ID}:${i}`),
  ],
]

describe.each(METHODS)(
  'BoxSignAdapter.%s pages the whole sign request locally',
  (_name, list, ids) => {
    it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
      const get = mockGetSignRequest(N)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(CREDS, ENV_ID, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.totalCount).toBe(N)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids)
      expect(more).toEqual([true, true, false])
      // The endpoint takes no paging parameter; every page asks for the request.
      for (const call of get.mock.calls) expect(call).toEqual([`/sign_requests/${ENV_ID}`])
    })

    it('page 2 is not page 1', async () => {
      mockGetSignRequest(N)
      const p1 = await list(CREDS, ENV_ID, withPageSink({ page: 1, limit: L }))
      const p2 = await list(CREDS, ENV_ID, withPageSink({ page: 2, limit: L }))
      expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
    })

    it('a limit larger than the collection returns it all and reports its end', async () => {
      mockGetSignRequest(N)
      const params = withPageSink({ page: 1, limit: 1000 })
      const rows = await list(CREDS, ENV_ID, params)
      expect(rows.map((r) => r.id)).toEqual(ids)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('without a limit returns the whole collection (used by the get* lookups)', async () => {
      mockGetSignRequest(N)
      const rows = await list(CREDS, ENV_ID, {})
      expect(rows.map((r) => r.id)).toEqual(ids)
    })

    it('serves page 2 on the API path through parseListQuery and listPage', async () => {
      mockGetSignRequest(N)
      const params = parseListQuery({ page: '2', limit: String(L) })
      const rows = await list(CREDS, ENV_ID, params)
      const env = listPage(rows, params, 'box-sign')
      expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(env.meta.page).toBe(2)
      expect(env.meta.limit).toBe(L)
      expect(env.meta.totalCount).toBe(N)
      expect(env.meta.hasMore).toBe(true)
    })
  },
)

describe('BoxSignAdapter get* lookups still see the whole sign request', () => {
  it('getSigner finds a signer past the first page', async () => {
    mockGetSignRequest(N)
    const s = await adapter.getSigner(CREDS, `${ENV_ID}:sg-${N - 1}`)
    expect(s.id).toBe(`${ENV_ID}:sg-${N - 1}`)
  })

  it('getAuditTrailEntry resolves the last index', async () => {
    mockGetSignRequest(N)
    const e = await adapter.getAuditTrailEntry(CREDS, `${ENV_ID}:${N - 1}`)
    expect(e.id).toBe(`${ENV_ID}:${N - 1}`)
  })
})

/** Serves an arbitrary sign-request body on the documented path only. */
function mockSignRequestBody(body: Record<string, unknown>) {
  return vi.spyOn(BoxSignClient.prototype, 'get').mockImplementation(async (path: string) => {
    if (path !== `/sign_requests/${ENV_ID}`) throw new Error(`unexpected path ${path}`)
    return body as never
  })
}

describe('BoxSignAdapter.listDocuments keeps index-derived fields stable across pages', () => {
  it('order and the id fallback count from the whole source_files[], not the page', async () => {
    // No `id` on any file, so externalId falls back to `${envelopeId}:${index}`.
    mockSignRequestBody({
      id: ENV_ID,
      source_files: Array.from({ length: N }, (_, i) => ({ type: 'file', name: `f-${i}.pdf` })),
    })
    const orders: number[] = []
    const externalIds: string[] = []
    for (const page of [1, 2, 3]) {
      const rows = await adapter.listDocuments(CREDS, ENV_ID, withPageSink({ page, limit: L }))
      orders.push(...rows.map((r) => r.order ?? -1))
      externalIds.push(...rows.map((r) => r.externalId))
    }
    expect(orders).toEqual(Array.from({ length: N }, (_, i) => i))
    expect(externalIds).toEqual(Array.from({ length: N }, (_, i) => `${ENV_ID}:${i}`))
  })
})

describe('BoxSignAdapter.listAuditTrailEntries sorts the whole trail before paging', () => {
  // Signers listed newest-first, so the raw event order is the reverse of the
  // chronological order the adapter must serve (and index) the trail in.
  const day = (d: number) => `2026-01-${String(d).padStart(2, '0')}T00:00:00.000Z`
  const body = {
    id: ENV_ID,
    signers: Array.from({ length: N }, (_, i) => ({
      id: `sg-${i}`,
      email: `s${i}@example.com`,
      email_sent_at: day(20 - i),
    })),
  }
  const chronological = Array.from({ length: N }, (_, i) => day(20 - N + 1 + i))

  it('pages 1..3 walk the trail in time order with ids indexed over the whole trail', async () => {
    mockSignRequestBody(body)
    const times: string[] = []
    const ids: string[] = []
    for (const page of [1, 2, 3]) {
      const rows = await adapter.listAuditTrailEntries(
        CREDS,
        ENV_ID,
        withPageSink({ page, limit: L }),
      )
      times.push(...rows.map((r) => r.occurredAt))
      ids.push(...rows.map((r) => r.id))
    }
    expect(times).toEqual(chronological)
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => `${ENV_ID}:${i}`))
  })

  it('getAuditTrailEntry index 0 is the earliest event and the last index the latest', async () => {
    mockSignRequestBody(body)
    const first = await adapter.getAuditTrailEntry(CREDS, `${ENV_ID}:0`)
    const last = await adapter.getAuditTrailEntry(CREDS, `${ENV_ID}:${N - 1}`)
    expect(first.occurredAt).toBe(chronological[0])
    expect(last.occurredAt).toBe(chronological[N - 1])
  })
})

describe('BoxSignAdapter.getDocument sees the whole sign request', () => {
  it('finds a document past the first page', async () => {
    mockGetSignRequest(N)
    const d = await adapter.getDocument(CREDS, `${ENV_ID}:f-${N - 1}`)
    expect(d.id).toBe(`${ENV_ID}:f-${N - 1}`)
  })
})
