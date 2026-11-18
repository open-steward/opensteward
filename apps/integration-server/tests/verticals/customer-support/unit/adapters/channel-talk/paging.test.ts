/**
 * channel-talk — cursor paging for the list methods backed by a real list
 * endpoint (tickets, messages, managers).
 *
 * The Channel Talk Open API (https://api-doc.channel.io/docs/openapi.en.yaml,
 * version 2026-06-01) pages `/open/user-chats`, `/open/user-chats/{id}/messages`
 * and `/open/managers` with `cursor` ("Opaque cursor from previous response for
 * pagination") and `limit` (maximum 500, default 25), and answers with
 * `nextCursor` ("Opaque cursor for the next page. Null if no more pages.") and
 * `hasNext`. The adapter used to drop the caller's `page`, so page 2 of every
 * list was page 1 again. Pages now resolve through the shared cursor pager.
 *
 * The fake below honours ONLY the documented parameters: `cursor` and `limit`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  parseListQuery,
  listPage,
} from '@opensteward/shared'
import { ChannelTalkAdapter } from '../../../../../../src/verticals/customer-support/adapters/channel-talk/index'
import { ChannelTalkClient } from '../../../../../../src/verticals/customer-support/adapters/channel-talk/client'
import type { Credentials } from '../../../../../../src/verticals/customer-support/adapter/interface'

const creds = { accessToken: 'ak', extra: { accessSecret: 'as' } } as Credentials

const DOC_MAX = 500
const DOC_DEFAULT = 25

interface Call {
  path: string
  params: Record<string, unknown>
}

/** An opaque cursor, as the platform mints it: base64 of the next offset. */
const encode = (offset: number) => Buffer.from(`o:${offset}`).toString('base64')
const decode = (cursor: unknown) =>
  Number(Buffer.from(String(cursor), 'base64').toString('utf8').slice(2))

/**
 * Fake Channel Talk: `total` rows under `key` at `path`. Reads only `cursor`
 * and `limit`; a limit over the documented maximum is a 422, as the spec's
 * `maximum: 500` implies, so an unclamped request fails loudly.
 */
function fakeChannelTalk(path: string, key: string, total: number, make: (i: number) => unknown) {
  const calls: Call[] = []
  vi.spyOn(ChannelTalkClient.prototype, 'get').mockImplementation((async (
    p: string,
    params?: Record<string, unknown>,
  ) => {
    const q = params ?? {}
    calls.push({ path: p, params: q })
    if (p !== path) throw new Error(`unexpected path in test: ${p}`)
    const limit = q['limit'] === undefined ? DOC_DEFAULT : Number(q['limit'])
    if (!(limit >= 1 && limit <= DOC_MAX)) throw new Error(`422: limit ${String(q['limit'])}`)
    const offset = q['cursor'] === undefined ? 0 : decode(q['cursor'])
    const rows = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) =>
      make(offset + i),
    )
    const end = offset + rows.length
    const hasNext = end < total
    return { [key]: rows, nextCursor: hasNext ? encode(end) : null, hasNext }
  }) as typeof ChannelTalkClient.prototype.get)
  return calls
}

const chat = (i: number) => ({ id: `uc_${i}`, state: 'opened', userId: `u_${i}` })
const msg = (i: number) => ({
  id: `m_${i}`,
  chatId: 'uc_1',
  personType: 'user',
  plainText: `m${i}`,
})
const manager = (i: number) => ({ id: `mgr_${i}`, name: `M${i}` })

type Lister = (p: ReturnType<typeof withPageSink>) => Promise<Array<{ id: string }>>

const adapter = new ChannelTalkAdapter()
const cases: Array<{
  name: string
  path: string
  key: string
  make: (i: number) => unknown
  prefix: string
  list: Lister
}> = [
  {
    name: 'listTickets',
    path: '/open/user-chats',
    key: 'userChats',
    make: chat,
    prefix: 'uc_',
    list: (p) => adapter.listTickets(creds, p),
  },
  {
    name: 'listMessages',
    path: '/open/user-chats/uc_1/messages',
    key: 'messages',
    make: msg,
    prefix: 'm_',
    list: (p) => adapter.listMessages(creds, 'uc_1', p),
  },
  {
    name: 'listUsers',
    path: '/open/managers',
    key: 'managers',
    make: manager,
    prefix: 'mgr_',
    list: (p) => adapter.listUsers(creds, p),
  },
]

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(cases)('channel-talk $name pages by cursor', ({ path, key, make, prefix, list }) => {
  it('pages 1..3 of 2L+1 rows serve every id once, in order, with exact hasMore', async () => {
    const L = 4
    const calls = fakeChannelTalk(path, key, 2 * L + 1, make)
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
    // One request per page, each sending the caller's size and the previous
    // page's `nextCursor`.
    expect(calls.map((c) => c.params['limit'])).toEqual([L, L, L])
    expect(calls.map((c) => c.params['cursor'])).toEqual([undefined, encode(L), encode(2 * L)])
  })

  it('the page-2 request carries the documented `cursor` key', async () => {
    const calls = fakeChannelTalk(path, key, 10, make)
    await list(withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    await list(withPageSink({ page: 2, limit: 3 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toHaveProperty('cursor', encode(3))
  })

  it('a limit above the documented maximum of 500 is clamped', async () => {
    const calls = fakeChannelTalk(path, key, 700, make)
    const params = withPageSink({ page: 1, limit: 1000 })
    const items = await list(params)
    expect(calls[0]!.params['limit']).toBe(DOC_MAX)
    expect(items).toHaveLength(DOC_MAX)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(readUpstreamPage(params)?.pageSize).toBe(DOC_MAX)
  })

  it('walks through parseListQuery and listPage to the end', async () => {
    const total = 11
    const limit = 5
    fakeChannelTalk(path, key, total, make)
    const ids: string[] = []
    const sizes: number[] = []
    for (let n = 1; n < 50; n++) {
      const params = parseListQuery({ limit: String(limit), page: String(n) })
      const env = listPage(await list(params), params, 'channel-talk')
      ids.push(...env.data.map((x) => x.id))
      sizes.push(env.data.length)
      if (env.meta.hasMore !== true) break
    }
    expect(ids).toEqual(Array.from({ length: total }, (_, i) => `${prefix}${i}`))
    expect(sizes).toEqual([5, 5, 1])
  })
})

/**
 * The cursor chain is remembered per connection, per collection and per
 * query. Each of these tests builds a chain under one key, then asks for page
 * 2 under a key that differs in exactly one part: the page-2 answer must come
 * from a fresh walk (page 1 without a cursor, then the new chain's cursor),
 * never from the other key's remembered cursor.
 */
describe('channel-talk cursor chains do not leak between keys', () => {
  it('a second connection walks its own chain (listUsers)', async () => {
    const calls = fakeChannelTalk('/open/managers', 'managers', 10, manager)
    await adapter.listUsers(creds, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const other = { accessToken: 'ak-other', extra: { accessSecret: 'as2' } } as Credentials
    const items = await adapter.listUsers(other, withPageSink({ page: 2, limit: 3 }))
    expect(calls.map((c) => c.params['cursor'])).toEqual([undefined, encode(3)])
    expect(items.map((x) => x.id)).toEqual(['mgr_3', 'mgr_4', 'mgr_5'])
  })

  it("chat B's page 2 never uses chat A's cursor (listMessages)", async () => {
    const calls: Call[] = []
    vi.spyOn(ChannelTalkClient.prototype, 'get').mockImplementation((async (
      p: string,
      params?: Record<string, unknown>,
    ) => {
      const q = params ?? {}
      calls.push({ path: p, params: q })
      const m = /^\/open\/user-chats\/([^/]+)\/messages$/.exec(p)
      if (!m) throw new Error(`unexpected path in test: ${p}`)
      const chatId = m[1]!
      // Each chat mints cursors of its own; a foreign cursor is a 400.
      const offset =
        q['cursor'] === undefined
          ? 0
          : (() => {
              const [owner, off] = Buffer.from(String(q['cursor']), 'base64')
                .toString('utf8')
                .split(':')
              if (owner !== chatId) throw new Error(`400: cursor of ${owner} sent to ${chatId}`)
              return Number(off)
            })()
      const limit = Number(q['limit'])
      const total = 10
      const n = Math.max(0, Math.min(limit, total - offset))
      const rows = Array.from({ length: n }, (_, i) => ({
        id: `${chatId}_m${offset + i}`,
        chatId,
        personType: 'user',
        plainText: 'x',
      }))
      const end = offset + n
      const hasNext = end < total
      return {
        messages: rows,
        nextCursor: hasNext ? Buffer.from(`${chatId}:${end}`).toString('base64') : null,
        hasNext,
      }
    }) as typeof ChannelTalkClient.prototype.get)

    await adapter.listMessages(creds, 'ucA', withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const items = await adapter.listMessages(creds, 'ucB', withPageSink({ page: 2, limit: 3 }))
    expect(calls.map((c) => c.path)).toEqual([
      '/open/user-chats/ucB/messages',
      '/open/user-chats/ucB/messages',
    ])
    expect(items.map((x) => x.id)).toEqual(['ucB_m3', 'ucB_m4', 'ucB_m5'])
  })

  it('a different page size walks a fresh chain (listTickets)', async () => {
    const calls = fakeChannelTalk('/open/user-chats', 'userChats', 20, chat)
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const items = await adapter.listTickets(creds, withPageSink({ page: 2, limit: 5 }))
    expect(calls.map((c) => c.params['cursor'])).toEqual([undefined, encode(5)])
    expect(items.map((x) => x.id)).toEqual(['uc_5', 'uc_6', 'uc_7', 'uc_8', 'uc_9'])
  })
})

describe('channel-talk explicit caller cursor', () => {
  it('reports hasMore and pageSize for a single cursor request', async () => {
    const calls = fakeChannelTalk('/open/managers', 'managers', 10, manager)
    const mid = withPageSink({ limit: 3, cursor: encode(3) } as Parameters<typeof withPageSink>[0])
    const midItems = await adapter.listUsers(creds, mid)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params['cursor']).toBe(encode(3))
    expect(midItems.map((x) => x.id)).toEqual(['mgr_3', 'mgr_4', 'mgr_5'])
    expect(readUpstreamPage(mid)).toMatchObject({ hasMore: true, pageSize: 3 })

    const last = withPageSink({ limit: 3, cursor: encode(9) } as Parameters<typeof withPageSink>[0])
    await adapter.listUsers(creds, last)
    expect(readUpstreamPage(last)).toMatchObject({ hasMore: false, pageSize: 3 })
  })
})

describe('channel-talk next-page signal', () => {
  it('`hasNext: false` ends the list even when a `nextCursor` is present', async () => {
    vi.spyOn(ChannelTalkClient.prototype, 'get').mockImplementation((async () => ({
      managers: [manager(0), manager(1)],
      nextCursor: encode(2),
      hasNext: false,
    })) as typeof ChannelTalkClient.prototype.get)
    const params = withPageSink({ page: 1, limit: 2 })
    await adapter.listUsers(creds, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
