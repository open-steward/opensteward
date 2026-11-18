/**
 * channel-talk — tags and contacts rebuilt against the Channel Talk Open API
 * (https://api-doc.channel.io/docs/openapi.en.yaml, info.version 2026-06-01).
 *
 * listTags used to synthesise tags from the labels on ONE page of opened user
 * chats. The spec documents `GET /open/chat-tags` (operationId listChatTags,
 * "Retrieve a list of chat tags with pagination.", parameters: cursor, limit)
 * answering `ChatTagsResponse` { chatTags, nextCursor, hasNext }.
 *
 * listContacts used to de-duplicate userIds off one page of opened user chats
 * and fetch each user. The spec's `/open/users` path has only
 * `post: operationId: createUser` ("Create a lead user"): there is no way to
 * list users, so the method refuses with 501 before sending anything.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import { ChannelTalkAdapter } from '../../../../../../src/verticals/customer-support/adapters/channel-talk/index'
import { ChannelTalkClient } from '../../../../../../src/verticals/customer-support/adapters/channel-talk/client'
import { TagSchema } from '../../../../../../src/verticals/customer-support/schema/tag'
import type { Credentials } from '../../../../../../src/verticals/customer-support/adapter/interface'

const creds = { accessToken: 'ak', extra: { accessSecret: 'as' } } as Credentials
const adapter = new ChannelTalkAdapter()

const DOC_MAX = 500
const DOC_DEFAULT = 25

interface Call {
  path: string
  params: Record<string, unknown>
}

const encode = (offset: number) => Buffer.from(`o:${offset}`).toString('base64')
const decode = (cursor: unknown) =>
  Number(Buffer.from(String(cursor), 'base64').toString('utf8').slice(2))

const chatTag = (i: number) => ({
  id: `${1000 + i}`,
  channelId: '6263',
  name: `billing/t${i}`,
  key: `billing/t${i}`,
  createdAt: '2024-03-28T08:57:32Z',
  colorVariant: 'cobalt',
})

/**
 * Fake `GET /open/chat-tags`: honours ONLY the documented `cursor` and
 * `limit` (1..500, default 25). Any other query key is a 400, so an
 * undocumented parameter (e.g. `sortOrder`, `state`) fails loudly.
 */
function fakeChatTags(total: number) {
  const calls: Call[] = []
  vi.spyOn(ChannelTalkClient.prototype, 'get').mockImplementation((async (
    p: string,
    params?: Record<string, unknown>,
  ) => {
    const q = params ?? {}
    calls.push({ path: p, params: q })
    if (p !== '/open/chat-tags') throw new Error(`unexpected path in test: ${p}`)
    for (const k of Object.keys(q)) {
      if (k !== 'cursor' && k !== 'limit') throw new Error(`400: undocumented parameter ${k}`)
    }
    const limit = q['limit'] === undefined ? DOC_DEFAULT : Number(q['limit'])
    if (!(limit >= 1 && limit <= DOC_MAX)) throw new Error(`422: limit ${String(q['limit'])}`)
    const offset = q['cursor'] === undefined ? 0 : decode(q['cursor'])
    const rows = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) =>
      chatTag(offset + i),
    )
    const end = offset + rows.length
    const hasNext = end < total
    return { chatTags: rows, nextCursor: hasNext ? encode(end) : null, hasNext }
  }) as typeof ChannelTalkClient.prototype.get)
  return calls
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('channel-talk listTags → GET /open/chat-tags', () => {
  it('sends only the documented cursor + limit and maps chatTags through TagSchema', async () => {
    const calls = fakeChatTags(2)
    const tags = await adapter.listTags(creds, withPageSink({ page: 1, limit: 10 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ path: '/open/chat-tags', params: { limit: 10 } })
    expect(tags.map((t) => t.id)).toEqual(['1000', '1001'])
    for (const t of tags) expect(() => TagSchema.parse(t)).not.toThrow()
    expect(tags[0]!.name).toBe('billing/t0')
  })

  it('never reads /open/user-chats any more', async () => {
    const calls = fakeChatTags(1)
    await adapter.listTags(creds, {})
    expect(calls.map((c) => c.path)).toEqual(['/open/chat-tags'])
  })

  it('pages 1..3 of 2L+1 tags serve every id once, in order, with exact hasMore', async () => {
    const L = 4
    const calls = fakeChatTags(2 * L + 1)
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      ids.push(...(await adapter.listTags(creds, params)).map((t) => t.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `${1000 + i}`))
    expect(new Set(ids).size).toBe(ids.length)
    expect(more).toEqual([true, true, false])
    expect(calls.map((c) => c.params['cursor'])).toEqual([undefined, encode(L), encode(2 * L)])
    expect(calls.map((c) => c.params['limit'])).toEqual([L, L, L])
  })

  it('clamps a limit above the documented maximum of 500 and reports the size sent', async () => {
    const calls = fakeChatTags(700)
    const params = withPageSink({ page: 1, limit: 1000 })
    const tags = await adapter.listTags(creds, params)
    expect(calls[0]!.params['limit']).toBe(DOC_MAX)
    expect(tags).toHaveLength(DOC_MAX)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: DOC_MAX })
  })

  it('`hasNext: false` ends the list even with a nextCursor present', async () => {
    vi.spyOn(ChannelTalkClient.prototype, 'get').mockImplementation((async () => ({
      chatTags: [chatTag(0)],
      nextCursor: encode(1),
      hasNext: false,
    })) as typeof ChannelTalkClient.prototype.get)
    const params = withPageSink({ page: 1, limit: 1 })
    await adapter.listTags(creds, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('channel-talk getTag', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const spy = vi.spyOn(ChannelTalkClient.prototype, 'get')
    await expect(adapter.getTag(creds, '56161')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('channel-talk listContacts', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const spy = vi.spyOn(ChannelTalkClient.prototype, 'get')
    await expect(
      adapter.listContacts(creds, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('getContact still reads GET /open/users/{userId}', async () => {
    const spy = vi
      .spyOn(ChannelTalkClient.prototype, 'get')
      .mockResolvedValue({ user: { id: 'u_1', name: 'Ada' } } as never)
    await adapter.getContact(creds, 'u_1')
    expect(spy).toHaveBeenCalledWith('/open/users/u_1')
  })
})
