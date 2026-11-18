/**
 * Paging for Zefort's child list methods.
 *
 * Signers and documents are both read from `GET /api/esigns/{id}/`
 * (operationId `api_esigns_retrieve`, summary "Read"), whose only parameter
 * is the path `id` ("A unique integer value identifying this esign.") and
 * whose `Esign` response carries `parties` and `documents` as plain inline
 * arrays. Spec: https://my.zefort.com/api/schema/, the spec URL the API
 * reference at https://developers.zefort.com/docs/api/ loads. The call has
 * no page or page_size parameter, so both lists are paged locally. They
 * used to ignore `page`, so page 2 repeated page 1.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { ZefortClient } from '../../../../../../src/verticals/docsign/adapters/zefort/client'
import { ZefortAdapter } from '../../../../../../src/verticals/docsign/adapters/zefort'

const CREDS = {
  accessToken: 'zf_key',
  extra: { baseUrl: 'https://my.zefort.com/api' },
} as Credentials
const ESIGN = 'esgn_1'
const adapter = new ZefortAdapter()

afterEach(() => vi.restoreAllMocks())

/**
 * A fake `GET /esigns/{id}/` holding `n` parties and `n` documents. It
 * honours ONLY the documented path id; any query parameter is rejected.
 */
function mockEsign(n: number) {
  return vi
    .spyOn(ZefortClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/esigns/${ESIGN}/`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('GET /esigns/{id}/ takes no query params')
      return {
        id: ESIGN,
        title: 'NDA',
        parties: Array.from({ length: n }, (_, i) => ({
          id: `sgnr_${i}`,
          email: `p${i}@example.com`,
          name: `Party ${i}`,
        })),
        documents: Array.from({ length: n }, (_, i) => ({
          id: `esdc_${i}`,
          name: `doc-${i}.pdf`,
        })),
      } as never
    })
}

const L = 2
const N = 2 * L + 1

describe('ZefortAdapter.listSigners pages GET /esigns/{id}/ locally', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `sgnr_${i}`)

  it('with N = 2L+1 rows, pages 1..3 return every id once with an exact hasMore', async () => {
    const get = mockEsign(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, ESIGN, params)
      seen.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
    // The endpoint has no paging parameter: nothing but the path goes up.
    for (const c of get.mock.calls) expect(c).toEqual([`/esigns/${ESIGN}/`])
  })

  it('page 2 is not page 1', async () => {
    mockEsign(N)
    const p1 = await adapter.listSigners(CREDS, ESIGN, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listSigners(CREDS, ESIGN, withPageSink({ page: 2, limit: L }))
    expect(p1.map((r) => r.externalId)).toEqual(['sgnr_0', 'sgnr_1'])
    expect(p2.map((r) => r.externalId)).toEqual(['sgnr_2', 'sgnr_3'])
  })

  it('a large limit returns the whole list and ends', async () => {
    mockEsign(N)
    const params = withPageSink({ page: 1, limit: 1000 })
    const rows = await adapter.listSigners(CREDS, ESIGN, params)
    expect(rows.map((r) => r.externalId)).toEqual(ids(N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockEsign(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listSigners(CREDS, ESIGN, params)
    const env = listPage(rows, params, 'zefort')
    expect(env.data.map((r) => r.externalId)).toEqual(['sgnr_2', 'sgnr_3'])
    expect(env.meta.page).toBe(2)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })

  it('getSigner still finds a party past the first page', async () => {
    mockEsign(N)
    const s = await adapter.getSigner(CREDS, `${ESIGN}:sgnr_${N - 1}`)
    expect(s.externalId).toBe(`sgnr_${N - 1}`)
  })
})

describe('ZefortAdapter.listDocuments pages GET /esigns/{id}/ locally', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `esdc_${i}`)

  it('with N = 2L+1 rows, pages 1..3 return every id once with an exact hasMore', async () => {
    const get = mockEsign(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listDocuments(CREDS, ESIGN, params)
      seen.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
    for (const c of get.mock.calls) expect(c).toEqual([`/esigns/${ESIGN}/`])
  })

  it('page 2 is not page 1', async () => {
    mockEsign(N)
    const p1 = await adapter.listDocuments(CREDS, ESIGN, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listDocuments(CREDS, ESIGN, withPageSink({ page: 2, limit: L }))
    expect(p1.map((r) => r.externalId)).toEqual(['esdc_0', 'esdc_1'])
    expect(p2.map((r) => r.externalId)).toEqual(['esdc_2', 'esdc_3'])
  })

  it('a large limit returns the whole list and ends', async () => {
    mockEsign(N)
    const params = withPageSink({ page: 1, limit: 1000 })
    const rows = await adapter.listDocuments(CREDS, ESIGN, params)
    expect(rows.map((r) => r.externalId)).toEqual(ids(N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockEsign(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter.listDocuments(CREDS, ESIGN, params), params, 'zefort')
    expect(env.data.map((r) => r.externalId)).toEqual(['esdc_2', 'esdc_3'])
    expect(env.meta.page).toBe(2)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })

  it('getDocument still finds a document past the first page', async () => {
    mockEsign(N)
    const d = await adapter.getDocument(CREDS, `${ESIGN}:esdc_${N - 1}`)
    expect(d.externalId).toBe(`esdc_${N - 1}`)
  })
})
