import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { IroncladClient } from '../../../../../../src/verticals/docsign/adapters/ironclad/client'
import { IroncladAdapter } from '../../../../../../src/verticals/docsign/adapters/ironclad'

/**
 * `GET /workflows` pages by `page` and `pageSize` ("Request pages with the
 * `page` (zero-based) and `pageSize` query parameters ... Each response echoes
 * `page` and `pageSize` and includes `count` (the total number of items
 * matching the query across ALL pages)" — pageSize minimum 1, maximum 100,
 * default 20; https://developer.ironcladapp.com/reference/list-all-workflows).
 *
 * `GET /workflows/{id}/sign-status` and `GET /workflows/{id}/documents` take
 * only the path id and return the whole `signers[]` / document arrays
 * (https://developer.ironcladapp.com/reference/get-sign-status,
 * https://developer.ironcladapp.com/reference/retrieve-workflow-documents),
 * so those are paged locally.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const ENV_ID = 'wf-parent'
const L = 2
const N = 2 * L + 1
const MAX = 100

const adapter = new IroncladAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

afterEach(() => vi.restoreAllMocks())

/** Honours only the documented `page` (0-based) and `pageSize` (1..100, default 20). */
function mockWorkflows(n: number) {
  const all = Array.from({ length: n }, (_, i) => ({ id: `wf-${i}`, title: `W${i}` }))
  return vi
    .spyOn(IroncladClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/workflows') throw new Error(`unexpected path ${path}`)
      const page = params?.['page'] === undefined ? 0 : Number(params['page'])
      const rawSize = params?.['pageSize'] === undefined ? 20 : Number(params['pageSize'])
      if (!Number.isInteger(rawSize) || rawSize < 1 || rawSize > MAX) {
        throw new Error(`pageSize out of range: ${rawSize}`)
      }
      const list = all.slice(page * rawSize, page * rawSize + rawSize)
      return { page, pageSize: rawSize, count: all.length, list } as never
    })
}

describe('IroncladAdapter.listEnvelopes pages /workflows by page and pageSize', () => {
  const ids = Array.from({ length: N }, (_, i) => `wf-${i}`)

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    mockWorkflows(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the zero-based page and the caller pageSize', async () => {
    const get = mockWorkflows(N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls[0]?.[1]).toMatchObject({ page: 1, pageSize: L })
  })

  it('a limit above the documented maximum is clamped to 100 and reported', async () => {
    const get = mockWorkflows(N)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(get.mock.calls[0]?.[1]).toMatchObject({ page: 0, pageSize: MAX })
    expect(rows).toHaveLength(N)
    expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a collection ending exactly on a page boundary reports no more on the last page', async () => {
    mockWorkflows(2 * L)
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      expect(rows).toHaveLength(L)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(more).toEqual([true, false])
  })

  it('without a count, a full page means more and a short page means the end', async () => {
    const all = Array.from({ length: L + 1 }, (_, i) => ({ id: `wf-${i}`, title: `W${i}` }))
    vi.spyOn(IroncladClient.prototype, 'get').mockImplementation(
      async (_path: string, params?: Record<string, unknown>) => {
        const page = Number(params?.['page'])
        const size = Number(params?.['pageSize'])
        return { page, pageSize: size, list: all.slice(page * size, page * size + size) } as never
      },
    )
    const first = withPageSink({ page: 1, limit: L })
    await adapter.listEnvelopes(CREDS, first)
    expect(readUpstreamPage(first)?.hasMore).toBe(true)
    const second = withPageSink({ page: 2, limit: L })
    await adapter.listEnvelopes(CREDS, second)
    expect(readUpstreamPage(second)?.hasMore).toBe(false)
  })

  it('a limit below the documented minimum is raised to 1', async () => {
    const get = mockWorkflows(N)
    for (const limit of [0, -3]) {
      const params = withPageSink({ page: 1, limit })
      const rows = await adapter.listEnvelopes(CREDS, params)
      expect(rows).toHaveLength(1)
      expect(readUpstreamPage(params)?.pageSize).toBe(1)
    }
    for (const call of get.mock.calls) expect(call[1]).toMatchObject({ pageSize: 1 })
  })

  it('declares the documented maximum', () => {
    expect(adapter.capabilities?.maxPageSize).toBe(MAX)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockWorkflows(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'ironclad')
    expect(env.data.map((r) => r.externalId)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.hasMore).toBe(true)
  })
})

/** Serves the whole sign-status / documents body; ignores every query param. */
function mockSubresources(n: number) {
  const signers = Array.from({ length: n }, (_, i) => ({
    userId: `u-${i}`,
    email: `s${i}@example.com`,
    name: `S${i}`,
  }))
  // Split across both arrays so order must count over the whole reply.
  const docs = Array.from({ length: n }, (_, i) => ({ key: `d-${i}`, filename: `d-${i}.pdf` }))
  return vi.spyOn(IroncladClient.prototype, 'get').mockImplementation(async (path: string) => {
    if (path === `/workflows/${ENV_ID}/sign-status`) return { signers } as never
    if (path === `/workflows/${ENV_ID}/documents`) {
      return {
        signaturePacketDocuments: docs.slice(0, 3),
        excludedFromSignaturePacketDocuments: docs.slice(3),
      } as never
    }
    throw new Error(`unexpected path ${path}`)
  })
}

type Lister = (
  c: Credentials,
  id: string,
  p: QueryParams,
) => Promise<Array<{ externalId: string; order?: number }>>
const SUB: Array<[string, Lister, string[], string]> = [
  [
    'listSigners',
    (c, id, p) => adapter.listSigners(c, id, p),
    Array.from({ length: N }, (_, i) => `u-${i}`),
    `/workflows/${ENV_ID}/sign-status`,
  ],
  [
    'listDocuments',
    (c, id, p) => adapter.listDocuments(c, id, p),
    Array.from({ length: N }, (_, i) => `d-${i}`),
    `/workflows/${ENV_ID}/documents`,
  ],
]

describe.each(SUB)('IroncladAdapter.%s pages the whole reply locally', (_n, list, ids, path) => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const get = mockSubresources(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, ENV_ID, params)
      seen.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
    for (const call of get.mock.calls) expect(call).toEqual([path])
  })

  it('a limit above the collection returns it all and reports its end', async () => {
    mockSubresources(N)
    const params = withPageSink({ page: 1, limit: 1000 })
    const rows = await list(CREDS, ENV_ID, params)
    expect(rows.map((r) => r.externalId)).toEqual(ids)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockSubresources(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await list(CREDS, ENV_ID, params)
    const env = listPage(rows, params, 'ironclad')
    expect(env.data.map((r) => r.externalId)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('IroncladAdapter sub-resource lookups still see the whole reply', () => {
  it('getSigner and getDocument find rows past the first page', async () => {
    mockSubresources(N)
    const s = await adapter.getSigner(CREDS, `${ENV_ID}:u-${N - 1}`)
    expect(s.externalId).toBe(`u-${N - 1}`)
    const d = await adapter.getDocument(CREDS, `${ENV_ID}:d-${N - 1}`)
    expect(d.externalId).toBe(`d-${N - 1}`)
  })

  it('document order counts over both arrays, not the page', async () => {
    mockSubresources(N)
    const orders: number[] = []
    for (const page of [1, 2, 3]) {
      const rows = await adapter.listDocuments(CREDS, ENV_ID, withPageSink({ page, limit: L }))
      orders.push(...rows.map((r) => r.order ?? -1))
    }
    expect(orders).toEqual(Array.from({ length: N }, (_, i) => i))
  })
})
