/**
 * Patreon v2 pages its lists by cursor: `page[count]` sets the page size and
 * `page[cursor]` takes the value of `meta.pagination.cursors.next` from the
 * previous response, which is null or absent on the last page
 * (https://docs.patreon.com/#pagination). listProducts (GET /campaigns) used
 * to forward `page[count]` but never `page[cursor]`, so page 2 repeated page 1.
 *
 * The fake below honours ONLY the documented parameters: `page[count]` and
 * `page[cursor]`. Its cursors are opaque strings that the adapter cannot
 * compute on its own.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { PatreonAdapter } from '../../../../../../src/verticals/ecommerce/adapters/patreon/index'

const CREDS = { accessToken: 'tok', refreshToken: 'ref' }

interface Call {
  path: string
  params: Record<string, unknown>
}

/** The client's own ceiling on `page[count]`. */
const CLIENT_MAX = 100

function fakePatreon(campaigns: number): Call[] {
  const calls: Call[] = []
  const cursorFor = (offset: number): string =>
    `opaque-${Buffer.from(String(offset)).toString('base64')}`
  const offsetOf = (cursor: string): number => {
    const m = /^opaque-(.+)$/.exec(cursor)
    if (!m) throw Object.assign(new Error(`bad cursor ${cursor}`), { response: { status: 400 } })
    return Number(Buffer.from(m[1]!, 'base64').toString())
  }
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = { ...(cfg?.params ?? {}) }
    calls.push({ path, params })
    if (path !== 'campaigns') throw new Error(`unexpected GET ${path}`)
    const count = params['page[count]'] === undefined ? 20 : Number(params['page[count]'])
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      throw Object.assign(new Error(`page[count] ${count} out of range`), {
        response: { status: 400 },
      })
    }
    const cursor = params['page[cursor]']
    const start = cursor === undefined ? 0 : offsetOf(String(cursor))
    const end = Math.min(start + count, campaigns)
    const data = []
    for (let i = start; i < end; i++) {
      data.push({
        type: 'campaign',
        id: String(i + 1),
        attributes: { creation_name: `C${i + 1}`, created_at: '2024-01-01T00:00:00Z' },
      })
    }
    return {
      data: {
        data,
        meta: {
          pagination: {
            total: campaigns,
            ...(end < campaigns ? { cursors: { next: cursorFor(end) } } : {}),
          },
        },
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return calls
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

async function walk(
  limit: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: (boolean | undefined)[]; sizes: number[] }> {
  const adapter = new PatreonAdapter()
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const sizes: number[] = []
  for (let k = 1; k <= pages; k++) {
    const params: QueryParams = withPageSink({ page: k, limit })
    const rows = await adapter.listProducts(CREDS, params)
    ids.push(...rows.map((r) => r.id))
    sizes.push(rows.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, sizes }
}

const seq = (n: number): string[] => Array.from({ length: n }, (_, i) => String(i + 1))

describe('Patreon listProducts pages /campaigns by cursor', () => {
  it('serves 2L+1 campaigns over three pages, each once, in order, hasMore exact', async () => {
    fakePatreon(7)
    const r = await walk(3, 3)
    expect(r.ids).toEqual(seq(7))
    expect(r.sizes).toEqual([3, 3, 1])
    expect(r.hasMore).toEqual([true, true, false])
  })

  it('sends page[cursor] from meta.pagination.cursors.next on page 2', async () => {
    const calls = fakePatreon(7)
    await walk(3, 2)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.params['page[count]']).toBe(3)
    expect(calls[0]!.params['page[cursor]']).toBeUndefined()
    expect(calls[1]!.params['page[count]']).toBe(3)
    expect(calls[1]!.params['page[cursor]']).toBe(`opaque-${Buffer.from('3').toString('base64')}`)
  })

  it('clamps a limit above the client ceiling and still serves every campaign', async () => {
    const total = 2 * CLIENT_MAX + 1
    const calls = fakePatreon(total)
    const adapter = new PatreonAdapter()
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    const sizes: (number | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 500 })
      const rows = await adapter.listProducts(CREDS, params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      sizes.push(readUpstreamPage(params)?.pageSize)
    }
    expect(ids).toEqual(seq(total))
    expect(hasMore).toEqual([true, true, false])
    expect(sizes).toEqual([CLIENT_MAX, CLIENT_MAX, CLIENT_MAX])
    for (const c of calls) expect(c.params['page[count]']).toBe(CLIENT_MAX)
  })

  it('reports meta.hasMore through parseListQuery and listPage', async () => {
    fakePatreon(7)
    const adapter = new PatreonAdapter()
    const p2 = parseListQuery({ limit: '3', page: '2' })
    const env2 = listPage(await adapter.listProducts(CREDS, p2), p2, 'patreon')
    expect(env2.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(env2.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: '3', page: '3' })
    const env3 = listPage(await adapter.listProducts(CREDS, p3), p3, 'patreon')
    expect(env3.data.map((r) => r.id)).toEqual(['7'])
    expect(env3.meta.hasMore).toBe(false)
  })

  it('reports the end from the missing next cursor when the total is an exact multiple', async () => {
    fakePatreon(6)
    const r = await walk(3, 3)
    expect(r.ids).toEqual(seq(6))
    expect(r.sizes).toEqual([3, 3, 0])
    expect(r.hasMore[0]).toBe(true)
    expect(r.hasMore[1]).toBe(false)
  })

  it('keys the cursor by the page size sent, so a new limit starts its own walk', async () => {
    const calls = fakePatreon(12)
    const adapter = new PatreonAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 3 }))
    const rows = await adapter.listProducts(CREDS, withPageSink({ page: 2, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual(['6', '7', '8', '9', '10'])
    // The limit-5 walk must not reuse the limit-3 cursor.
    expect(calls[1]!.params['page[cursor]']).toBeUndefined()
    expect(calls[1]!.params['page[count]']).toBe(5)
  })

  it('shares one walk between a limit above the ceiling and the ceiling itself', async () => {
    const calls = fakePatreon(2 * CLIENT_MAX + 1)
    const adapter = new PatreonAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 500 }))
    const rows = await adapter.listProducts(CREDS, withPageSink({ page: 2, limit: CLIENT_MAX }))
    expect(rows[0]!.id).toBe(String(CLIENT_MAX + 1))
    // Both send page[count]=100, so page 2 resumes from page 1's cursor.
    expect(calls).toHaveLength(2)
    expect(calls[1]!.params['page[cursor]']).toBeDefined()
  })

  it('keys the cursor per connection, never replaying one token cursor for another', async () => {
    const calls = fakePatreon(7)
    const adapter = new PatreonAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 3 }))
    const other = { accessToken: 'tok-b', refreshToken: 'ref-b' }
    const rows = await adapter.listProducts(other, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    // Connection B walks from its own start instead of using A's cursor.
    expect(calls[1]!.params['page[cursor]']).toBeUndefined()
  })
})
