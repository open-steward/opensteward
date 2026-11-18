/**
 * Yousign list paging.
 *
 * List Signature Requests pages by cursor
 * (https://developers.youtrust.com/reference/get-signature_requests-1.md):
 *   after: "Cursor for pagination; pass the `meta.next_cursor` value from the
 *          previous response to fetch the next page."
 *   limit: default 100, maximum 100.
 * and the pagination guide (https://developers.youtrust.com/docs/pagination-1.md):
 *   "If `next_cursor` is **null**, you have reached the end of the dataset".
 *
 * Only `listEnvelopes` is paged by cursor. Signers and documents come back
 * from their endpoints as bare arrays with no paging params and are paged
 * locally; audit trails and templates refuse. See rebuild.test.ts.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { YousignClient } from '../../../../../../src/verticals/docsign/adapters/yousign/client'
import { YousignAdapter } from '../../../../../../src/verticals/docsign/adapters/yousign'

const CREDS = { accessToken: 'ys_token' } as Credentials
const OTHER = { accessToken: 'ys_other_token' } as Credentials
const L = 2
const N = 2 * L + 1
const MAX = 100
const CALL_BUDGET = 50
const PATH = '/signature_requests'

afterEach(() => vi.restoreAllMocks())
beforeEach(() => _resetCursorPager())

const adapter = new YousignAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

const ids = (n: number) => Array.from({ length: n }, (_, i) => `sr-${i + 1}`)

/**
 * A fake List Signature Requests honouring ONLY `limit` (default 100, max
 * 100) and `after` (an opaque cursor), answering `{ meta: { next_cursor }, data }`
 * with `next_cursor: null` on the last page.
 */
function fakeList(total: number) {
  const all = ids(total).map((id) => ({ id, status: 'ongoing', name: id }))
  let calls = 0
  return vi
    .spyOn(YousignClient.prototype, 'get')
    .mockImplementation(async (p: string, params?: Record<string, unknown>) => {
      if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
      if (p !== PATH) throw new Error(`unexpected path ${p}`)
      const limit = Math.min(Number(params?.['limit'] ?? 100), MAX)
      const after = params?.['after']
      const start = after != null ? Number(Buffer.from(String(after), 'base64').toString()) : 0
      const rows = all.slice(start, start + limit)
      const end = start + rows.length
      return {
        meta: {
          next_cursor: end < all.length ? Buffer.from(String(end)).toString('base64') : null,
        },
        data: rows,
      } as never
    })
}

describe('YousignAdapter.listEnvelopes pages by the `after` cursor', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeList(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await adapter.listEnvelopes(CREDS, params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
  })

  it('page 2 sends the documented `after` key carrying page 1 meta.next_cursor', async () => {
    const get = fakeList(N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    const sent = get.mock.calls.map((c) => c[1])
    expect(sent[0]).toEqual({ limit: L })
    expect(sent[1]).toEqual({ limit: L, after: Buffer.from(String(L)).toString('base64') })
  })

  it('page 2 with a cold cache walks from page 1 and returns rows L+1..2L', async () => {
    fakeList(N)
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(ids(N).slice(L, 2 * L))
  })

  it('an exactly full last page reports its end from next_cursor: null', async () => {
    fakeList(2 * L)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    const p2 = withPageSink({ page: 2, limit: L })
    expect((await adapter.listEnvelopes(CREDS, p2)).map((r) => r.id)).toEqual(ids(2 * L).slice(L))
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('a limit above the documented maximum (100) is clamped', async () => {
    const get = fakeList(150)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows).toHaveLength(MAX)
    expect(get.mock.calls[0]![1]).toEqual({ limit: MAX })
    expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('another connection walks from its own page 1', async () => {
    const get = fakeList(N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    const before = get.mock.calls.length
    const rows = await adapter.listEnvelopes(OTHER, withPageSink({ page: 2, limit: L }))
    const sent = get.mock.calls.slice(before).map((c) => c[1])
    expect(sent).toHaveLength(2)
    expect(sent[0]).toEqual({ limit: L })
    expect(rows.map((r) => r.id)).toEqual(ids(N).slice(L, 2 * L))
  })

  it('a new page size walks afresh instead of reusing the old size cursor', async () => {
    const get = fakeList(10)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    const before = get.mock.calls.length
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(ids(10).slice(3, 6))
    const sent = get.mock.calls.slice(before).map((c) => c[1])
    expect(sent[0]).toEqual({ limit: 3 })
  })

  it('a caller cursor is sent as `after` and starts its own walk', async () => {
    const get = fakeList(10)
    const start = Buffer.from('4').toString('base64')
    const p1 = await adapter.listEnvelopes(
      CREDS,
      withPageSink({ page: 1, limit: L, cursor: start }),
    )
    expect(p1.map((r) => r.id)).toEqual(ids(10).slice(4, 6))
    expect(get.mock.calls[0]![1]).toEqual({ limit: L, after: start })
    // A walk without a cursor must not be reused by one that starts at the caller's cursor.
    _resetCursorPager()
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listEnvelopes(
      CREDS,
      withPageSink({ page: 2, limit: L, cursor: start }),
    )
    expect(p2.map((r) => r.id)).toEqual(ids(10).slice(6, 8))
  })

  it.each([0, Number.NaN])(
    'an invalid limit (%s) falls back to the default of 100',
    async (bad) => {
      const get = fakeList(5)
      const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: bad }))
      expect(get.mock.calls[0]![1]).toEqual({ limit: 100 })
      expect(rows).toHaveLength(5)
    },
  )

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    fakeList(N)
    const params = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'yousign')
    expect(env.data.map((r) => r.id)).toEqual(ids(N).slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.hasMore).toBe(true)
  })
})
