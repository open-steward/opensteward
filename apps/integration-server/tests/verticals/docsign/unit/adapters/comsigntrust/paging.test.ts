import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { ComsigntrustClient } from '../../../../../../src/verticals/docsign/adapters/comsigntrust/client'
import { ComsigntrustAdapter } from '../../../../../../src/verticals/docsign/adapters/comsigntrust'
import { collection, signer, COLLECTION_ID } from './fixtures/wesign'

/**
 * GET /v3/DocumentCollections pages by `offset` + `limit`
 * (https://wse.comsigntrust.com/api/swagger/v3/swagger.json). WeSign's own
 * client sends a 0-based row offset and reads the total from `x-total-count`
 * (https://wse.comsigntrust.com/chunk-WBQRGJSL.js: `p.offset=e,p.limit=t-e`).
 * The fake honours only those two parameters, so a method that pages by
 * anything else gets the first rows again.
 */

const CREDS = { accessToken: 'jwt-token' } as Credentials
const adapter = new ComsigntrustAdapter()

afterEach(() => vi.restoreAllMocks())

function mockList(n: number, withTotal = true) {
  return vi
    .spyOn(ComsigntrustClient.prototype, 'getWithHeaders')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/DocumentCollections') throw new Error(`unexpected path ${path}`)
      const offset = Number(params?.['offset'] ?? 0)
      const limit = Number(params?.['limit'] ?? 20)
      const end = Math.min(offset + limit, n)
      const rows = Array.from({ length: Math.max(0, end - offset) }, (_, i) =>
        collection({ documentCollectionId: `col-${offset + i}` }),
      )
      return {
        data: { documentCollections: rows },
        headers: withTotal ? { 'x-total-count': String(n) } : {},
      } as never
    })
}

describe('ComsigntrustAdapter.listEnvelopes pages by offset/limit', () => {
  const L = 4
  const N = 2 * L + 1

  it('pages 1..3 return every collection once, with the reported total and exact hasMore', async () => {
    const get = mockList(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `col-${i}`))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
    expect(get.mock.calls.map(([, p]) => p)).toEqual([
      { offset: 0, limit: L },
      { offset: L, limit: L },
      { offset: 2 * L, limit: L },
    ])
  })

  it('without x-total-count, a short page is the end', async () => {
    mockList(N, false)
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      await adapter.listEnvelopes(CREDS, params)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(more).toEqual([true, true, false])
  })
})

describe('ComsigntrustAdapter.listSigners pages the collection signers locally', () => {
  const L = 2
  const N = 2 * L + 1

  it('pages 1..3 return every signer once with exact hasMore', async () => {
    vi.spyOn(ComsigntrustClient.prototype, 'get').mockResolvedValue(
      collection({
        signers: Array.from({ length: N }, (_, i) => signer({ id: `s-${i}` })),
      }) as never,
    )
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, COLLECTION_ID, params)
      seen.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `s-${i}`))
    expect(more).toEqual([true, true, false])
  })
})

describe('ComsigntrustAdapter.listDocuments pages the collection documentsIds locally', () => {
  const L = 2
  const N = 2 * L + 1

  it('pages 1..3 return every document once, in collection order, with exact hasMore', async () => {
    const ids = Array.from({ length: N }, (_, i) => `d-${i}`)
    vi.spyOn(ComsigntrustClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path === `/DocumentCollections/info/${COLLECTION_ID}`)
        return collection({ documentsIds: ids }) as never
      const m = /\/documents\/([^/]+)\/pages$/.exec(path)
      if (m) return { documentId: m[1], documentName: `${m[1]}.pdf`, pagesCount: 1 } as never
      throw new Error(`unexpected path ${path}`)
    })
    const seen: Array<[string, number]> = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listDocuments(CREDS, COLLECTION_ID, params)
      seen.push(...rows.map((r) => [r.externalId, r.order] as [string, number]))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids.map((id, i) => [id, i]))
    expect(more).toEqual([true, true, false])
  })
})
