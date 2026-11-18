/**
 * Paging for Skribble's list methods.
 *
 * `GET /v2/signature-requests` pages only when asked: "the result set can be
 * controlled using the optional pagination parameters `page_number` and
 * `page_size`" and `page_number` is documented as "Default: Pagination is
 * disabled" (https://api-doc.skribble.com/, "List and find SignatureRequests").
 * The docs contradict themselves on whether `page_number` is 0- or 1-based, so
 * the adapter sends neither parameter, receives the whole collection, and
 * pages it locally. It used to send an undocumented `limit`, so page 2
 * repeated page 1.
 *
 * `GET /v2/signature-requests/{id}` returns one SignatureRequest with its
 * `signatures[]` inline, so signers and the audit entries synthesised from
 * them are paged locally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { SkribbleClient } from '../../../../../../src/verticals/docsign/adapters/skribble/client'
import { SkribbleAdapter } from '../../../../../../src/verticals/docsign/adapters/skribble'

const CREDS = { accessToken: 'jwt' } as Credentials
const adapter = new SkribbleAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

afterEach(() => vi.restoreAllMocks())

/**
 * A fake `GET /signature-requests` holding `n` requests. It honours ONLY the
 * documented `page_number` / `page_size` (pagination disabled unless
 * `page_number` is sent); any other query key is ignored.
 */
function mockList(n: number) {
  const all = Array.from({ length: n }, (_, i) => ({ id: `sr-${i}`, title: `SR ${i}` }))
  return vi
    .spyOn(SkribbleClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/signature-requests') throw new Error(`unexpected path ${path}`)
      if (params?.['page_number'] === undefined) return all as never
      const size = params['page_size'] === undefined ? 50 : Number(params['page_size'])
      const page = Number(params['page_number'])
      return all.slice(page * size, (page + 1) * size) as never
    })
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `sr-${i}`)

describe('SkribbleAdapter.listEnvelopes pages the whole collection locally', () => {
  it('with N = 2L+1 rows, pages 1..3 return every id once with an exact hasMore', async () => {
    const L = 2
    const N = 2 * L + 1
    mockList(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
  })

  it('page 2 asks for the unpaginated collection: no limit, offset or page_number', async () => {
    const get = mockList(5)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: 2 }))
    const sent = (get.mock.calls[0]?.[1] ?? {}) as Record<string, unknown>
    expect(sent).not.toHaveProperty('limit')
    expect(sent).not.toHaveProperty('offset')
    expect(sent).not.toHaveProperty('page_number')
  })

  it('a limit above the default upstream page size still returns exactly that many rows', async () => {
    mockList(260)
    const params = withPageSink({ page: 1, limit: 250 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(250))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('an empty list ends at once', async () => {
    mockList(0)
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await adapter.listEnvelopes(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a non-array body is treated as an empty collection', async () => {
    vi.spyOn(SkribbleClient.prototype, 'get').mockResolvedValue({} as never)
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await adapter.listEnvelopes(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockList(5)
    const params = parseListQuery({ page: '2', limit: '2' })
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'skribble')
    expect(env.data.map((r) => r.id)).toEqual(['sr-2', 'sr-3'])
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(2)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('SkribbleAdapter child lists page GET /signature-requests/{id} locally', () => {
  const ENV = 'sr-1'
  const L = 2
  const N = 2 * L + 1

  /** Honours only the documented path id; ignores every query param. */
  function mockOne(signatures: number) {
    return vi.spyOn(SkribbleClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path !== `/signature-requests/${ENV}`) throw new Error(`unexpected path ${path}`)
      return {
        id: ENV,
        signatures: Array.from({ length: signatures }, (_, i) => ({
          sid: `s-${i}`,
          account_email: `s${i}@example.com`,
          status_code: 'SIGNED',
          signed_at: `2025-01-0${i + 1}T00:00:00.000Z`,
        })),
      } as never
    })
  }

  it('listSigners: pages 1..3 return every signature once, with an exact hasMore', async () => {
    mockOne(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, ENV, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `s-${i}`))
    expect(more).toEqual([true, true, false])
  })

  it('listSigners on the API path through parseListQuery and listPage', async () => {
    mockOne(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listSigners(CREDS, ENV, params)
    const env = listPage(rows, params, 'skribble')
    expect(env.data.map((r) => r.id)).toEqual(['s-2', 's-3'])
    expect(env.meta.hasMore).toBe(true)
  })

  it('listAuditTrailEntries: pages 1..3 return every entry once, ids keep their global index', async () => {
    mockOne(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listAuditTrailEntries(CREDS, ENV, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `${ENV}:${i}`))
    expect(more).toEqual([true, true, false])
  })

  it('getSigner and getAuditTrailEntry still see the whole request', async () => {
    mockOne(N)
    expect((await adapter.getSigner(CREDS, `${ENV}:s-4`)).id).toBe('s-4')
    expect((await adapter.getAuditTrailEntry(CREDS, `${ENV}:4`)).id).toBe(`${ENV}:4`)
  })
})
