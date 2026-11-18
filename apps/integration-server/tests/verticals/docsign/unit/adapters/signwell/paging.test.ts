/**
 * Paging for SignWell's child list methods.
 *
 * `GET /api/v1/documents/{id}` takes only the path `id` and "Returns a
 * document and all associated document data"
 * (https://developers.signwell.com/reference/getdocument.md), with the
 * `recipients` array inline. It has no page or per_page parameter, so
 * signers and the one document per envelope are paged locally. They used
 * to ignore `page`, so page 2 repeated page 1.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { SignWellClient } from '../../../../../../src/verticals/docsign/adapters/signwell/client'
import { SignWellAdapter } from '../../../../../../src/verticals/docsign/adapters/signwell'

const CREDS = { accessToken: 'sw_key' } as Credentials
const DOC = 'doc_1'
const adapter = new SignWellAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

/**
 * A fake `GET /documents/{id}` holding `n` recipients. It honours ONLY the
 * documented path id; any query parameter is rejected.
 */
function mockDocument(n: number) {
  return vi
    .spyOn(SignWellClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/documents/${DOC}`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('GET /documents/{id} takes no query params')
      return {
        id: DOC,
        name: 'NDA',
        recipients: Array.from({ length: n }, (_, i) => ({
          id: `r-${i}`,
          email: `r${i}@example.com`,
          signing_order: i + 1,
        })),
      } as never
    })
}

describe('SignWellAdapter.listSigners pages GET /documents/{id} locally', () => {
  const L = 2
  const N = 2 * L + 1
  const id = (i: number) => `${DOC}:r-${i}`
  const ids = (n: number) => Array.from({ length: n }, (_, i) => id(i))

  it('with N = 2L+1 rows, pages 1..3 return every id once with an exact hasMore', async () => {
    const get = mockDocument(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, DOC, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
    // The endpoint has no paging parameter: nothing but the path goes up.
    for (const c of get.mock.calls) expect(c).toEqual([`/documents/${DOC}`])
  })

  it('page 2 is not page 1', async () => {
    mockDocument(N)
    const p1 = await adapter.listSigners(CREDS, DOC, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listSigners(CREDS, DOC, withPageSink({ page: 2, limit: L }))
    expect(p1.map((r) => r.id)).toEqual(ids(2))
    expect(p2.map((r) => r.id)).toEqual([id(2), id(3)])
  })

  it('a large limit returns the whole list and ends', async () => {
    mockDocument(N)
    const params = withPageSink({ page: 1, limit: 1000 })
    expect((await adapter.listSigners(CREDS, DOC, params)).map((r) => r.id)).toEqual(ids(N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockDocument(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listSigners(CREDS, DOC, params)
    const env = listPage(rows, params, 'signwell')
    expect(env.data.map((r) => r.id)).toEqual([id(2), id(3)])
    expect(env.meta.page).toBe(2)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })

  it('pages a collection larger than any cap: 120 signers at limit 50 over pages 1..3', async () => {
    const big = 120
    mockDocument(big)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 50 })
      seen.push(...(await adapter.listSigners(CREDS, DOC, params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(big)
    }
    expect(seen).toEqual(ids(big))
    expect(more).toEqual([true, true, false])
  })

  it('getSigner still finds a signer past the first page', async () => {
    mockDocument(N)
    const s = await adapter.getSigner(CREDS, id(N - 1))
    expect(s.id).toBe(id(N - 1))
  })
})

describe('SignWellAdapter.listDocuments pages its one document locally', () => {
  it('page 1 holds the document and ends; page 2 is empty', async () => {
    mockDocument(1)
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter.listDocuments(CREDS, DOC, p1)).map((d) => d.id)).toEqual([
      `${DOC}:${DOC}`,
    ])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    expect(readUpstreamPage(p1)?.pagedLocally).toBe(true)

    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listDocuments(CREDS, DOC, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path as empty', async () => {
    mockDocument(1)
    const params = parseListQuery({ page: '2', limit: '1' })
    const env = listPage(await adapter.listDocuments(CREDS, DOC, params), params, 'signwell')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
    expect(env.meta.totalCount).toBe(1)
  })
})
