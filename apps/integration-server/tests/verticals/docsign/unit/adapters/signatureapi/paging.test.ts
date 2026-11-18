/**
 * SignatureAPI list paging.
 *
 * Envelopes page by an opaque `links.next` URL
 * (https://signatureapi.com/docs/api/resources/envelopes/list):
 *   limit: "The maximum number of objects to return in the response, up to 20.
 *          The default is 20."
 * and (https://signatureapi.com/docs/api/pagination):
 *   next: "A pre-built absolute path URI for fetching the next page of results.
 *         If the value is `null`, this is the last page of results."
 *
 * Signers and documents are embedded in the envelope returned whole by
 * `GET /envelopes/{envelopeId}` ("Retrieves the full details of an envelope,
 * including its documents, recipients, ..."; no query parameters), so they are
 * paged locally.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { Credentials, PageMaxBearing, QueryParams } from '@opensteward/shared'
import { SignatureapiClient } from '../../../../../../src/verticals/docsign/adapters/signatureapi/client'
import { SignatureapiAdapter } from '../../../../../../src/verticals/docsign/adapters/signatureapi'

const CREDS = { accessToken: 'key_test_abc' } as Credentials
const OTHER = { accessToken: 'key_test_other' } as Credentials
const L = 2
const N = 2 * L + 1
const MAX = 20
const CALL_BUDGET = 50
const BASE = 'https://api.signatureapi.com/v1'

afterEach(() => vi.restoreAllMocks())
beforeEach(() => _resetCursorPager())

const adapter = new SignatureapiAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

/**
 * A fake `GET /envelopes` honouring ONLY `limit` (default and max 20) on the
 * first request, and the opaque `links.next` URL it hands out thereafter.
 * Rows are newest first.
 */
function fakeEnvelopes(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({
    id: `env_${String(total - i).padStart(3, '0')}`,
    status: 'completed',
  }))
  let calls = 0
  const page = (start: number, limit: number) => {
    const rows = all.slice(start, start + limit)
    const end = start + rows.length
    return {
      links: {
        next: end < all.length ? `${BASE}/envelopes?cursor=seq_${end}&limit=${limit}` : null,
        previous: null,
      },
      data: rows,
    }
  }
  const get = vi
    .spyOn(SignatureapiClient.prototype, 'get')
    .mockImplementation(async (p: string, params?: Record<string, unknown>) => {
      if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
      if (p !== '/envelopes') throw new Error(`unexpected path ${p}`)
      if (params?.['cursor'] !== undefined) throw new Error('cursor is not a documented query key')
      const limit = Math.min(Number(params?.['limit'] ?? MAX), MAX)
      return page(0, limit) as never
    })
  const abs = vi
    .spyOn(SignatureapiClient.prototype, 'getAbsolute')
    .mockImplementation(async (url: string) => {
      if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
      const u = new URL(url)
      if (u.pathname !== '/v1/envelopes') throw new Error(`unexpected url ${url}`)
      const start = Number(String(u.searchParams.get('cursor')).replace('seq_', ''))
      const limit = Math.min(Number(u.searchParams.get('limit') ?? MAX), MAX)
      return page(start, limit) as never
    })
  return { get, abs, ids: all.map((r) => r.id) }
}

describe('SignatureapiAdapter.listEnvelopes pages by links.next', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const { ids } = fakeEnvelopes(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('page 2 GETs the links.next URL page 1 returned', async () => {
    const { get, abs } = fakeEnvelopes(N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls.map((c) => c[1])).toEqual([{ limit: L }])
    expect(abs.mock.calls.map((c) => c[0])).toEqual([
      `${BASE}/envelopes?cursor=seq_${L}&limit=${L}`,
    ])
  })

  it('page 2 with a cold cache walks from page 1 and returns rows L+1..2L', async () => {
    const { ids } = fakeEnvelopes(N)
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
  })

  it('another connection does not reuse a cursor walked under the first', async () => {
    const { get, abs } = fakeEnvelopes(N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    await adapter.listEnvelopes(OTHER, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(2)
    expect(abs).toHaveBeenCalledTimes(1)
  })

  it('a limit above the documented maximum (20) is clamped', async () => {
    const { get } = fakeEnvelopes(50)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows).toHaveLength(MAX)
    expect(get.mock.calls[0]![1]).toEqual({ limit: MAX })
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('a cursor walked at one page size is not reused at another', async () => {
    const { ids } = fakeEnvelopes(10)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(ids.slice(3, 6))
  })

  it('reports the page size it sent upstream', async () => {
    fakeEnvelopes(N)
    const params = withPageSink({ page: 1, limit: 3 })
    await adapter.listEnvelopes(CREDS, params)
    expect(readUpstreamPage(params)?.pageSize).toBe(3)
  })

  it('with no limit, asks for the documented default (20)', async () => {
    const { get } = fakeEnvelopes(50)
    const params = withPageSink({ page: 1 })
    await adapter.listEnvelopes(CREDS, params)
    expect(get.mock.calls[0]![1]).toEqual({ limit: MAX })
    expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
  })

  it('a limit below the documented minimum (1) is raised to 1', async () => {
    const { get } = fakeEnvelopes(N)
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: 0 }))
    expect(get.mock.calls[0]![1]).toEqual({ limit: 1 })
    expect(rows).toHaveLength(1)
  })

  it('does not forward a caller cursor as an undocumented query key', async () => {
    const { get } = fakeEnvelopes(N)
    const params = withPageSink({ page: 1, limit: L })
    params['cursor'] = 'seq_4'
    await adapter.listEnvelopes(CREDS, params)
    expect(get.mock.calls[0]![1]).toEqual({ limit: L })
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    const { ids } = fakeEnvelopes(N)
    const params = withPageSink(
      parseListQuery({ page: '2', limit: String(L) }, adapter as PageMaxBearing),
    )
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'signatureapi')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.hasMore).toBe(true)
  })
})

// ── Signers and documents: embedded in one envelope, paged locally ──────────

function fakeEnvelope(total: number) {
  const recipients = Array.from({ length: total }, (_, i) => ({
    id: `rcp_${i + 1}`,
    type: 'signer',
    email: `s${i + 1}@example.com`,
    name: `S${i + 1}`,
  }))
  const documents = Array.from({ length: total }, (_, i) => ({
    id: `doc_${i + 1}`,
    title: `D${i + 1}`,
    format: 'pdf',
  }))
  return vi
    .spyOn(SignatureapiClient.prototype, 'get')
    .mockImplementation(async (p: string, params?: Record<string, unknown>) => {
      if (p !== '/envelopes/env_1') throw new Error(`unexpected path ${p}`)
      if (params !== undefined) throw new Error('GET /envelopes/{id} takes no query params')
      return { id: 'env_1', recipients, documents } as never
    })
}

type ChildLister = (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>
const CHILD: Array<[string, string, ChildLister]> = [
  ['listSigners', 'rcp_', (c, p) => adapter.listSigners(c, 'env_1', p)],
  ['listDocuments', 'doc_', (c, p) => adapter.listDocuments(c, 'env_1', p)],
]

describe.each(CHILD)(
  'SignatureapiAdapter.%s pages the embedded array locally',
  (_n, prefix, list) => {
    const expected = Array.from({ length: N }, (_, i) => `${prefix}${i + 1}`)

    it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
      fakeEnvelope(N)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(CREDS, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(expected)
      expect(more).toEqual([true, true, false])
    })

    it('serves page 2 on the API path through parseListQuery and listPage', async () => {
      fakeEnvelope(N)
      const params = withPageSink(
        parseListQuery({ page: '2', limit: String(L) }, adapter as PageMaxBearing),
      )
      const rows = await list(CREDS, params)
      const env = listPage(rows, params, 'signatureapi')
      expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
      expect(env.meta.hasMore).toBe(true)
    })
  },
)

describe('SignatureapiAdapter.listDocuments order', () => {
  it("keeps each document's position in the envelope, not in the page", async () => {
    fakeEnvelope(N)
    const rows = await adapter.listDocuments(CREDS, 'env_1', withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.order)).toEqual([L, L + 1])
  })
})
