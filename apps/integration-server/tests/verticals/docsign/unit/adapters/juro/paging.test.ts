import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { JuroClient } from '../../../../../../src/verticals/docsign/adapters/juro/client'
import { JuroAdapter } from '../../../../../../src/verticals/docsign/adapters/juro'

/**
 * Juro paging, per https://api-docs.juro.com/:
 *
 * - `GET /v3/contracts` pages by offset: "skip 0 Number of contracts to skip
 *   (for pagination) limit 50 Number of contracts to return (max 200)", and
 *   the reply carries "total Total number of contracts matching the filter
 *   (before pagination)".
 * - `GET /v3/templates` documents no query parameter at all ("You first want
 *   to get all templates"), so the adapter pages the whole list itself.
 * - Signers and documents come from `GET /v3/contracts/:contract_id`, whose
 *   only parameter is the contract id: the adapter pages the flattened rows.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const L = 2
const N = 2 * L + 1
const CONTRACT_ID = 'ctr-1'

afterEach(() => vi.restoreAllMocks())

const adapter = new JuroAdapter()

function contracts(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `c-${i}`, name: `Contract ${i}` }))
}

/** Honours only `skip` and `limit` (default 50, max 200), and reports `total`. */
function mockContracts(n: number) {
  const all = contracts(n)
  return vi
    .spyOn(JuroClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/contracts') throw new Error(`unexpected path ${path}`)
      const skip = Number(params?.['skip'] ?? 0)
      const limit = Math.min(Number(params?.['limit'] ?? 50), 200)
      return { total: all.length, contracts: all.slice(skip, skip + limit) } as never
    })
}

/** Honours no query parameter: every call returns every template. */
function mockTemplates(n: number) {
  return vi.spyOn(JuroClient.prototype, 'get').mockImplementation(async (path: string) => {
    if (path !== '/templates') throw new Error(`unexpected path ${path}`)
    return {
      templates: Array.from({ length: n }, (_, i) => ({ id: `t-${i}`, name: `Tpl ${i}` })),
    } as never
  })
}

/** One contract carrying `n` signatures spread over two signing sides. */
function mockContract(n: number) {
  return vi.spyOn(JuroClient.prototype, 'get').mockImplementation(async (path: string) => {
    if (path !== `/contracts/${CONTRACT_ID}`) throw new Error(`unexpected path ${path}`)
    const sides = [
      { uid: 'a', name: 'Side A', signatures: [] as Array<{ uid: string; email: string }> },
      { uid: 'b', name: 'Side B', signatures: [] as Array<{ uid: string; email: string }> },
    ]
    for (let i = 0; i < n; i++) {
      sides[i < 2 ? 0 : 1]!.signatures.push({ uid: `s${i}`, email: `s${i}@example.com` })
    }
    return { contract: { id: CONTRACT_ID, name: 'NDA', signingSides: sides } } as never
  })
}

const SIGNER_IDS = Array.from({ length: N }, (_, i) => `${i < 2 ? 'a' : 'b'}:s${i}`)

describe('JuroAdapter.listEnvelopes pages GET /v3/contracts by skip', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    mockContracts(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(contracts(N).map((c) => c.id))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries skip = limit', async () => {
    const get = mockContracts(N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls[0]?.[1]).toMatchObject({ skip: L, limit: L })
  })

  it('clamps a limit above 200 and strides by the size it sent', async () => {
    const get = mockContracts(450)
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(get.mock.calls[0]?.[1]).toMatchObject({ skip: 200, limit: 200 })
    expect(rows.map((r) => r.id)[0]).toBe('c-200')
    expect(rows).toHaveLength(200)
    expect(readUpstreamPage(params)?.pageSize).toBe(200)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('declares the documented maximum', () => {
    expect(adapter.capabilities.maxPageSize).toBe(200)
  })

  it('reports no pageSize when the limit it sent is the one asked for', async () => {
    mockContracts(N)
    const params = withPageSink({ page: 1, limit: L })
    await adapter.listEnvelopes(CREDS, params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it.each([
    [Number.NaN, 50],
    [0, 50],
    [2.7, 2],
  ])('sends a sane limit when asked for %s', async (asked, sent) => {
    const get = mockContracts(N)
    await adapter.listEnvelopes(CREDS, { page: 1, limit: asked } as QueryParams)
    expect(get.mock.calls[0]?.[1]).toMatchObject({ skip: 0, limit: sent })
  })

  describe('when the reply omits total', () => {
    function mockNoTotal(n: number) {
      const all = contracts(n)
      return vi
        .spyOn(JuroClient.prototype, 'get')
        .mockImplementation(async (_path: string, params?: Record<string, unknown>) => {
          const skip = Number(params?.['skip'] ?? 0)
          const limit = Number(params?.['limit'] ?? 50)
          return { contracts: all.slice(skip, skip + limit) } as never
        })
    }

    it('a full page reports hasMore = true', async () => {
      mockNoTotal(N)
      const params = withPageSink({ page: 1, limit: L })
      await adapter.listEnvelopes(CREDS, params)
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
      expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
    })

    it('a short page reports hasMore = false', async () => {
      mockNoTotal(N)
      const params = withPageSink({ page: 3, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      expect(rows.map((r) => r.id)).toEqual(['c-4'])
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockContracts(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'juro')
    expect(env.data.map((r) => r.id)).toEqual(['c-2', 'c-3'])
    expect(env.meta.page).toBe(2)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('JuroAdapter.listTemplates pages the whole template list locally', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const get = mockTemplates(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listTemplates(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `t-${i}`))
    expect(more).toEqual([true, true, false])
    // The endpoint documents no paging parameter; none is sent.
    for (const call of get.mock.calls) expect(call[1] ?? {}).toEqual({})
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockTemplates(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listTemplates(CREDS, params)
    const env = listPage(rows, params, 'juro')
    expect(env.data.map((r) => r.id)).toEqual(['t-2', 't-3'])
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const CHILD_METHODS: Array<[string, Lister, number, string[]]> = [
  ['listSigners', (c, id, p) => adapter.listSigners(c, id, p), N, SIGNER_IDS],
  ['listDocuments', (c, id, p) => adapter.listDocuments(c, id, p), 1, [CONTRACT_ID]],
]

describe.each(CHILD_METHODS)(
  'JuroAdapter.%s pages the whole contract locally',
  (_name, list, pageSize, ids) => {
    it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
      mockContract(N)
      const limit = pageSize === 1 ? 1 : L
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit })
        const rows = await list(CREDS, CONTRACT_ID, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.totalCount).toBe(ids.length)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids)
      expect(more).toEqual(pageSize === 1 ? [false, false, false] : [true, true, false])
    })

    it('without a limit returns the whole collection (used by the get* lookups)', async () => {
      mockContract(N)
      const rows = await list(CREDS, CONTRACT_ID, {})
      expect(rows.map((r) => r.id)).toEqual(ids)
    })

    it('serves page 2 on the API path through parseListQuery and listPage', async () => {
      mockContract(N)
      const params = parseListQuery({ page: '2', limit: '1' })
      const rows = await list(CREDS, CONTRACT_ID, params)
      const env = listPage(rows, params, 'juro')
      expect(env.data.map((r) => r.id)).toEqual(ids.slice(1, 2))
      expect(env.meta.totalCount).toBe(ids.length)
    })
  },
)
