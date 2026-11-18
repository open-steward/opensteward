/**
 * Bird contacts paging and request shape.
 *
 * https://bird.com/docs/api/pagination:
 *   "`limit` | integer | Maximum items per page. Between `1` and `100`; defaults to `25`."
 *   "`starting_after` | string | Cursor from the `next_cursor` field of a previous response."
 *   "`next_cursor` | Pass back as `starting_after` to fetch the next page. `null` when no
 *    next page exists, which is the signal to stop."
 * https://bird.com/docs/guides/authentication:
 *   "`bk_us1_...` keys go to `https://us1.platform.bird.com`, `bk_eu1_...` keys to
 *    `https://eu1.platform.bird.com`."
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { ReplyBirdConversationsAdapter } from '../../../../../../src/verticals/customer-support/adapters/reply-bird-conversations/index'

const KEY = 'bk_us1_Ab3xKq9mP2wR5tY8uI1oL4n3A3aww'
const CREDS = { accessToken: KEY }
const MAX = 100

type Call = { path: string; params: Record<string, unknown> }

function contact(i: number) {
  return {
    id: `con_${String(i).padStart(26, '0')}`,
    email: `c${i}@example.com`,
    phone_number: null,
    first_name: `C${i}`,
    last_name: null,
    external_id: null,
    created_at: '2026-05-20T09:14:52Z',
    updated_at: '2026-05-25T16:42:01Z',
  }
}

/** A fake Bird honouring only the documented `limit` and `starting_after`. */
function fakeBird(total: number) {
  const calls: Call[] = []
  const creates: Array<Record<string, unknown>> = []
  const encode = (o: number) => Buffer.from(`o:${o}`).toString('base64')
  const decode = (c: unknown) => Number(Buffer.from(String(c), 'base64').toString('utf8').slice(2))
  const all = Array.from({ length: total }, (_, i) => contact(i + 1))
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    const single = /^\/v1\/contacts\/([^/]+)$/.exec(path)
    if (single) {
      const hit = all.find((c) => c.id === decodeURIComponent(single[1]!))
      if (!hit) throw Object.assign(new Error('not found'), { response: { status: 404 } })
      return { data: hit }
    }
    if (path !== '/v1/contacts') throw new Error(`unexpected GET ${path}`)
    for (const k of Object.keys(params)) {
      if (k !== 'limit' && k !== 'starting_after') throw new Error(`undocumented param ${k}`)
    }
    const limit = params['limit'] ?? 25
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX) {
      throw Object.assign(new Error(`limit must be 1..${MAX}`), { response: { status: 422 } })
    }
    const start = params['starting_after'] === undefined ? 0 : decode(params['starting_after'])
    const data = all.slice(start, start + limit)
    const end = start + data.length
    return {
      data: {
        data,
        next_cursor: end < all.length ? encode(end) : null,
        prev_cursor: start > 0 ? encode(start) : null,
        refresh_cursor: data.length ? encode(start) : null,
      },
    }
  })
  vi.spyOn(axios, 'create').mockImplementation(((cfg: Record<string, unknown>) => {
    creates.push(cfg)
    return { get } as never
  }) as never)
  return { calls, creates, get }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('Bird listContacts', () => {
  it('serves 2L+1 contacts over pages 1..3 once each, with hasMore exact', async () => {
    const L = 4
    const { calls } = fakeBird(2 * L + 1)
    const adapter = new ReplyBirdConversationsAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listContacts(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => contact(i + 1).id))
    expect(new Set(seen).size).toBe(seen.length)
    expect(more).toEqual([true, true, false])
    expect(calls.map((c) => c.params['limit'])).toEqual([L, L, L])
    expect(calls[0]!.params).not.toHaveProperty('starting_after')
    expect(calls[1]!.params['starting_after']).toBeTypeOf('string')
  })

  it('a page past the end is empty with hasMore false', async () => {
    fakeBird(3)
    const adapter = new ReplyBirdConversationsAdapter()
    const params = withPageSink({ page: 2, limit: 3 })
    expect(await adapter.listContacts(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('clamps the page size to the documented 100 and reports the size sent', async () => {
    const { calls } = fakeBird(5)
    const params = withPageSink({ page: 1, limit: 250 })
    await new ReplyBirdConversationsAdapter().listContacts(CREDS, params)
    expect(calls[0]!.params['limit']).toBe(100)
    expect(readUpstreamPage(params)?.pageSize).toBe(100)
  })

  it('sends the documented default of 25 when the caller gives no limit', async () => {
    const { calls } = fakeBird(1)
    await new ReplyBirdConversationsAdapter().listContacts(CREDS, {})
    expect(calls[0]!.params).toEqual({ limit: 25 })
  })

  it("calls the key's regional host with a bearer token", async () => {
    const { creates } = fakeBird(1)
    await new ReplyBirdConversationsAdapter().listContacts({ accessToken: 'bk_eu1_x' }, {})
    expect(creates[0]!['baseURL']).toBe('https://eu1.platform.bird.com')
    expect((creates[0]!['headers'] as Record<string, string>)['Authorization']).toBe(
      'Bearer bk_eu1_x',
    )
  })

  it("sends a key without a region prefix to the spec's default region us1", async () => {
    const { creates } = fakeBird(1)
    await new ReplyBirdConversationsAdapter().listContacts({ accessToken: 'legacy-access-key' }, {})
    expect(creates[0]!['baseURL']).toBe('https://us1.platform.bird.com')
  })
})

describe('Bird listContacts per connection', () => {
  it('walks each connection on its own cursors', async () => {
    const { calls } = fakeBird(4)
    const adapter = new ReplyBirdConversationsAdapter()
    await adapter.listContacts({ accessToken: 'bk_us1_connectionA' }, { page: 1, limit: 2 })
    await adapter.listContacts({ accessToken: 'bk_us1_connectionA' }, { page: 2, limit: 2 })
    const before = calls.length
    // B has walked nothing, so its page 2 starts from its own page 1, not A's cursor.
    const rows = await adapter.listContacts(
      { accessToken: 'bk_us1_connectionB' },
      { page: 2, limit: 2 },
    )
    expect(rows.map((r) => r.id)).toEqual([contact(3).id, contact(4).id])
    const mine = calls.slice(before)
    expect(mine).toHaveLength(2)
    expect(mine[0]!.params).not.toHaveProperty('starting_after')
  })
})

describe('Bird getContact', () => {
  it('reads GET /v1/contacts/{contact_id} back for an id the list returned', async () => {
    const { calls } = fakeBird(2)
    const adapter = new ReplyBirdConversationsAdapter()
    const [first] = await adapter.listContacts(CREDS, { page: 1, limit: 1 })
    const c = await adapter.getContact(CREDS, first!.id)
    expect(c.id).toBe(first!.id)
    expect(calls.at(-1)!.path).toBe(`/v1/contacts/${first!.id}`)
  })
})
