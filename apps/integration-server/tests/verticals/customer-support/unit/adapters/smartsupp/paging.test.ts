/**
 * smartsupp — paging for the list methods backed by a real list endpoint.
 *
 * Smartsupp REST API v2 (https://docs.smartsupp.com/rest-api/overview/,
 * "Pagination"): "To retrieve next page use same size and sort options and add
 * option after returned from Initial request. This workflow apply for other
 * following requests until response property after is null." The OpenAPI spec
 * (https://api.smartsupp.com/v2/specs/open-api.json) gives POST
 * /conversations/search a body `after` (array of numbers) and GET
 * /conversations/{id}/messages a query `after` (number); both answer with
 * `{ total, items, after }`. No maximum `size` is documented, so none is
 * asserted here.
 *
 * GET /tags takes no parameters and returns every tag as one array: it is
 * paged locally.
 *
 * The fakes below honour ONLY the documented parameters: `size`, `sort` and
 * `after`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  parseListQuery,
  listPage,
} from '@opensteward/shared'
import { SmartsuppAdapter } from '../../../../../../src/verticals/customer-support/adapters/smartsupp/index'
import { SmartsuppClient } from '../../../../../../src/verticals/customer-support/adapters/smartsupp/client'
import type { Credentials } from '../../../../../../src/verticals/customer-support/adapter/interface'

const creds = { accessToken: 'tok' } as Credentials
const DOC_DEFAULT = 50

/** Each row's sort value: a createdAt millisecond timestamp. */
const ts = (i: number) => 1_600_000_000_000 + i * 1000

interface Call {
  path: string
  args: Record<string, unknown>
}

/** Rows strictly after `after` (a sort value), `size` at a time, in order. */
function slice(total: number, size: number, after: number | undefined) {
  const start = after === undefined ? 0 : Math.floor((after - ts(0)) / 1000) + 1
  const idx = Array.from(
    { length: Math.max(0, Math.min(size, total - start)) },
    (_, i) => start + i,
  )
  const end = start + idx.length
  // `after` is null once the last row has been served.
  const next = end < total ? [ts(end - 1)] : null
  return { idx, next }
}

function fakeSearch(total: number) {
  const calls: Call[] = []
  vi.spyOn(SmartsuppClient.prototype, 'post').mockImplementation((async (
    p: string,
    body?: Record<string, unknown>,
  ) => {
    const b = body ?? {}
    calls.push({ path: p, args: b })
    if (p !== '/conversations/search') throw new Error(`unexpected path in test: ${p}`)
    if (!Array.isArray(b['sort'])) return { total, items: [], after: null }
    const size = b['size'] === undefined ? DOC_DEFAULT : Number(b['size'])
    const after = Array.isArray(b['after']) ? Number(b['after'][0]) : undefined
    const { idx, next } = slice(total, size, after)
    return {
      total,
      items: idx.map((i) => ({
        id: `c_${i}`,
        status: 'open',
        created_at: new Date(ts(i)).toISOString(),
      })),
      after: next,
    }
  }) as typeof SmartsuppClient.prototype.post)
  return calls
}

function fakeMessages(conversation: string, total: number) {
  const calls: Call[] = []
  vi.spyOn(SmartsuppClient.prototype, 'get').mockImplementation((async (
    p: string,
    params?: Record<string, unknown>,
  ) => {
    const q = params ?? {}
    calls.push({ path: p, args: q })
    if (p !== `/conversations/${conversation}/messages`)
      throw new Error(`unexpected path in test: ${p}`)
    const size = q['size'] === undefined ? DOC_DEFAULT : Number(q['size'])
    const after = q['after'] === undefined ? undefined : Number(q['after'])
    const { idx, next } = slice(total, size, after)
    return {
      total,
      items: idx.map((i) => ({
        id: `m_${i}`,
        conversation_id: conversation,
        type: 'message',
        sub_type: 'contact',
        content: { type: 'text', text: `m${i}` },
        created_at: new Date(ts(i)).toISOString(),
      })),
      after: next,
    }
  }) as typeof SmartsuppClient.prototype.get)
  return calls
}

type Lister = (p: ReturnType<typeof withPageSink>) => Promise<Array<{ id: string }>>

const adapter = new SmartsuppAdapter()
const cases: Array<{
  name: string
  fake: (total: number) => Call[]
  prefix: string
  sizeOf: (c: Call) => unknown
  afterOf: (c: Call) => unknown
  list: Lister
}> = [
  {
    name: 'listTickets',
    fake: fakeSearch,
    prefix: 'c_',
    sizeOf: (c) => c.args['size'],
    afterOf: (c) => (Array.isArray(c.args['after']) ? c.args['after'][0] : c.args['after']),
    list: (p) => adapter.listTickets(creds, p),
  },
  {
    name: 'listMessages',
    fake: (total) => fakeMessages('conv1', total),
    prefix: 'm_',
    sizeOf: (c) => c.args['size'],
    afterOf: (c) => c.args['after'],
    list: (p) => adapter.listMessages(creds, 'conv1', p),
  },
]

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(cases)(
  'smartsupp $name pages by `after`',
  ({ fake, prefix, sizeOf, afterOf, list }) => {
    it('pages 1..3 of 2L+1 rows serve every id once, in order, with exact hasMore', async () => {
      const L = 4
      const calls = fake(2 * L + 1)
      const ids: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const items = await list(params)
        ids.push(...items.map((x) => x.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(ids).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `${prefix}${i}`))
      expect(more).toEqual([true, true, false])
      expect(calls.map(sizeOf)).toEqual([L, L, L])
      expect(calls.map(afterOf)).toEqual([undefined, ts(L - 1), ts(2 * L - 1)])
    })

    it('the page-2 request carries the documented `after` key', async () => {
      const calls = fake(10)
      await list(withPageSink({ page: 1, limit: 3 }))
      calls.length = 0
      await list(withPageSink({ page: 2, limit: 3 }))
      expect(calls).toHaveLength(1)
      expect(calls[0]!.args).toHaveProperty('after')
      expect(afterOf(calls[0]!)).toBe(ts(2))
    })

    it('page 2 cold walks from page 1 and returns the second page', async () => {
      const calls = fake(10)
      const items = await list(withPageSink({ page: 2, limit: 3 }))
      expect(items.map((x) => x.id)).toEqual([`${prefix}3`, `${prefix}4`, `${prefix}5`])
      expect(calls.map(afterOf)).toEqual([undefined, ts(2)])
    })

    it('walks through parseListQuery and listPage to the end', async () => {
      const total = 11
      const limit = 5
      fake(total)
      const ids: string[] = []
      const sizes: number[] = []
      for (let n = 1; n < 50; n++) {
        const params = parseListQuery({ limit: String(limit), page: String(n) })
        const env = listPage(await list(params), params, 'smartsupp')
        ids.push(...env.data.map((x) => x.id))
        sizes.push(env.data.length)
        if (env.meta.hasMore !== true) break
      }
      expect(ids).toEqual(Array.from({ length: total }, (_, i) => `${prefix}${i}`))
      expect(sizes).toEqual([5, 5, 1])
    })
  },
)

describe('smartsupp listMessages chains are per conversation', () => {
  it("conversation B's page 2 never uses conversation A's `after`", async () => {
    fakeMessages('A', 10)
    await adapter.listMessages(creds, 'A', withPageSink({ page: 1, limit: 3 }))
    vi.restoreAllMocks()
    const calls = fakeMessages('B', 10)
    const items = await adapter.listMessages(creds, 'B', withPageSink({ page: 2, limit: 3 }))
    expect(calls.map((c) => c.args['after'])).toEqual([undefined, ts(2)])
    expect(items.map((x) => x.id)).toEqual(['m_3', 'm_4', 'm_5'])
  })
})

describe('smartsupp listTags pages locally (GET /tags returns every tag)', () => {
  function fakeTags(total: number) {
    const calls: Call[] = []
    vi.spyOn(SmartsuppClient.prototype, 'get').mockImplementation((async (
      p: string,
      params?: Record<string, unknown>,
    ) => {
      calls.push({ path: p, args: params ?? {} })
      if (p !== '/tags') throw new Error(`unexpected path in test: ${p}`)
      return Array.from({ length: total }, (_, i) => ({ id: `t_${i}`, name: `Tag ${i}` }))
    }) as typeof SmartsuppClient.prototype.get)
    return calls
  }

  it('pages 1..3 of 2L+1 tags serve every id once, in order, with exact hasMore', async () => {
    const L = 4
    const calls = fakeTags(2 * L + 1)
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const items = await adapter.listTags(creds, params)
      ids.push(...items.map((x) => x.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(ids).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `t_${i}`))
    expect(more).toEqual([true, true, false])
    // The endpoint documents no parameters, so none are sent.
    expect(calls.every((c) => Object.keys(c.args).length === 0)).toBe(true)
  })

  it('walks through parseListQuery and listPage to the end', async () => {
    fakeTags(11)
    const ids: string[] = []
    for (let n = 1; n < 50; n++) {
      const params = parseListQuery({ limit: '5', page: String(n) })
      const env = listPage(await adapter.listTags(creds, params), params, 'smartsupp')
      ids.push(...env.data.map((x) => x.id))
      if (env.meta.hasMore !== true) break
    }
    expect(ids).toEqual(Array.from({ length: 11 }, (_, i) => `t_${i}`))
  })
})

describe('smartsupp explicit caller `cursor` is one request at that position', () => {
  it('listTickets sends the cursor as the body `after` array and reports hasMore', async () => {
    const calls = fakeSearch(10)
    const mid = withPageSink({ page: 1, limit: 3, cursor: String(ts(2)) })
    const items = await adapter.listTickets(creds, mid)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.args['after']).toEqual([ts(2)])
    expect(items.map((x) => x.id)).toEqual(['c_3', 'c_4', 'c_5'])
    expect(readUpstreamPage(mid)?.hasMore).toBe(true)

    calls.length = 0
    const last = withPageSink({ page: 1, limit: 3, cursor: String(ts(8)) })
    const tail = await adapter.listTickets(creds, last)
    expect(calls[0]!.args['after']).toEqual([ts(8)])
    expect(tail.map((x) => x.id)).toEqual(['c_9'])
    expect(readUpstreamPage(last)?.hasMore).toBe(false)
  })

  it('listMessages sends the cursor as the numeric query `after` and reports hasMore', async () => {
    const calls = fakeMessages('conv1', 10)
    const mid = withPageSink({ page: 1, limit: 3, cursor: String(ts(2)) })
    const items = await adapter.listMessages(creds, 'conv1', mid)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.args['after']).toBe(ts(2))
    expect(items.map((x) => x.id)).toEqual(['m_3', 'm_4', 'm_5'])
    expect(readUpstreamPage(mid)?.hasMore).toBe(true)

    calls.length = 0
    const last = withPageSink({ page: 1, limit: 3, cursor: String(ts(8)) })
    const tail = await adapter.listMessages(creds, 'conv1', last)
    expect(calls[0]!.args['after']).toBe(ts(8))
    expect(tail.map((x) => x.id)).toEqual(['m_9'])
    expect(readUpstreamPage(last)?.hasMore).toBe(false)
  })
})

describe('smartsupp pager chains are per connection', () => {
  it("connection B's cold page 2 walks from its own page 1, never A's `after`", async () => {
    const calls = fakeSearch(10)
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const other = { accessToken: 'another-account-key' } as Credentials
    const items = await adapter.listTickets(other, withPageSink({ page: 2, limit: 3 }))
    expect(calls.map((c) => (c.args['after'] as number[] | undefined)?.[0])).toEqual([
      undefined,
      ts(2),
    ])
    expect(items.map((x) => x.id)).toEqual(['c_3', 'c_4', 'c_5'])
  })
})

describe('smartsupp treats an empty `after` array as the end', () => {
  it('reports hasMore false when the response carries `after: []`', async () => {
    vi.spyOn(SmartsuppClient.prototype, 'post').mockImplementation((async () => ({
      total: 2,
      items: [
        { id: 'c_0', status: 'open', created_at: new Date(ts(0)).toISOString() },
        { id: 'c_1', status: 'open', created_at: new Date(ts(1)).toISOString() },
      ],
      after: [],
    })) as typeof SmartsuppClient.prototype.post)
    const params = withPageSink({ page: 1, limit: 2 })
    await adapter.listTickets(creds, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
