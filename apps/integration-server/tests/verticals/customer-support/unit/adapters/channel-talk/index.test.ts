/**
 * channel-talk.
 *
 * Before this fix:
 *   - Every request used the legacy /open/v4 or /open/v5 path prefix. Both
 *     are a separate stack from the documented unversioned /open/* API
 *     (confirmed live 2026-09-13: the legacy stack 401s unauthenticated
 *     with no Channel-Version echo, meaning it never saw a version header).
 *   - No Channel-Version header was ever sent, so the platform silently
 *     applied its own pinned default instead of the version this adapter
 *     was built against.
 *   - listTeams/getTeam called GET /open/v5/teams and /open/v5/teams/{id}.
 *     Neither exists — they 404 at routing (unauthenticated, same as any
 *     other bogus path on that stack) on /open/v5, /open/v4 *and* the
 *     current unversioned /open/* API. No API version has ever served a
 *     teams route; UserChat.teamId is a routing field, not a listable Team.
 *   - listParams sent `since`; the current API takes `cursor`.
 *
 * These pin the corrected REQUESTs (method + exact path + query), not just
 * the transforms, since a wrong path/envelope is exactly what slipped past
 * transform-only coverage before (the old flat channel-talk.test.ts pinned
 * transforms and webhook parsing only — no path was ever asserted).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ChannelTalkAdapter } from '../../../../../../src/verticals/customer-support/adapters/channel-talk/index'
import { ChannelTalkClient } from '../../../../../../src/verticals/customer-support/adapters/channel-talk/client'
import {
  API_PREFIX,
  CHANNEL_API_VERSION,
} from '../../../../../../src/verticals/customer-support/adapters/channel-talk/constants'
import { TicketSchema } from '../../../../../../src/verticals/customer-support/schema/ticket'
import { UserSchema } from '../../../../../../src/verticals/customer-support/schema/user'
import type { Credentials } from '../../../../../../src/verticals/customer-support/adapter/interface'

const adapter = new ChannelTalkAdapter()
const creds = { accessToken: 'ak', extra: { accessSecret: 'as' } } as Credentials

/** Spy on the shared client and record the path + params it was called with. */
function stubGet(payload: unknown) {
  return vi.spyOn(ChannelTalkClient.prototype, 'get').mockResolvedValue(payload as never)
}

afterEach(() => vi.restoreAllMocks())

describe('ChannelTalkClient — Channel-Version header', () => {
  it('is pinned to 2026-06-01 and sent as a request header', () => {
    expect(CHANNEL_API_VERSION).toBe('2026-06-01')

    const client = new ChannelTalkClient(creds)
    const headers = (
      client as unknown as { http: { defaults: { headers: Record<string, unknown> } } }
    ).http.defaults.headers
    expect(headers['Channel-Version']).toBe(CHANNEL_API_VERSION)
  })
})

describe('ChannelTalkAdapter — moved off /open/v4 and /open/v5 onto unversioned /open/*', () => {
  it('API_PREFIX is the unversioned prefix, not a v4/v5 path', () => {
    expect(API_PREFIX).toBe('/open')
  })

  it('listTickets calls GET /open/user-chats with `cursor`, not `since`', async () => {
    const spy = stubGet({ userChats: [] })
    await adapter.listTickets(creds, { cursor: 'MTcxMTY4OTg3MDY5OA==' })

    expect(spy).toHaveBeenCalledTimes(1)
    const [path, params] = spy.mock.calls[0]!
    expect(path).toBe('/open/user-chats')
    expect(params).toMatchObject({ cursor: 'MTcxMTY4OTg3MDY5OA==', state: 'opened' })
    expect(params).not.toHaveProperty('since')
  })

  it('getTicket calls GET /open/user-chats/{id} and round-trips through TicketSchema', async () => {
    const spy = stubGet({
      userChat: { id: 'uc_1', state: 'opened', userId: 'u_1', createdAt: 1_700_000_000_000 },
    })
    const ticket = await adapter.getTicket(creds, 'uc_1')

    expect(spy).toHaveBeenCalledWith('/open/user-chats/uc_1')
    expect(() => TicketSchema.parse(ticket)).not.toThrow()
  })

  it('listMessages calls GET /open/user-chats/{id}/messages with cursor pagination', async () => {
    const spy = stubGet({ messages: [] })
    await adapter.listMessages(creds, 'uc_1', { cursor: 'c1' })

    const [path, params] = spy.mock.calls[0]!
    expect(path).toBe('/open/user-chats/uc_1/messages')
    expect(params).toMatchObject({ cursor: 'c1' })
    expect(params).not.toHaveProperty('since')
  })

  it('listContacts refuses (no documented user list) and sends nothing', async () => {
    const spy = vi.spyOn(ChannelTalkClient.prototype, 'get')
    await expect(adapter.listContacts(creds, {})).rejects.toMatchObject({ statusCode: 501 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('getContact calls GET /open/users/{id}', async () => {
    const spy = stubGet({ user: { id: 'u_1', name: 'Ada' } })
    await adapter.getContact(creds, 'u_1')
    expect(spy).toHaveBeenCalledWith('/open/users/u_1')
  })

  it('listUsers calls GET /open/managers, not /open/v4/managers', async () => {
    const spy = stubGet({ managers: [{ id: 'mgr_1', name: 'Bo' }] })
    const users = await adapter.listUsers(creds, {})

    const [path] = spy.mock.calls[0]!
    expect(path).toBe('/open/managers')
    expect(path).not.toContain('/open/v4')
    expect(() => UserSchema.parse(users[0])).not.toThrow()
  })

  it('getUser calls GET /open/managers/{id}, not /open/v4/managers/{id}', async () => {
    const spy = stubGet({ manager: { id: 'mgr_1', name: 'Bo' } })
    await adapter.getUser(creds, 'mgr_1')

    expect(spy).toHaveBeenCalledWith('/open/managers/mgr_1')
  })

  it('listTags calls GET /open/chat-tags (unversioned)', async () => {
    const spy = stubGet({
      chatTags: [
        {
          id: '56161',
          channelId: '6263',
          name: 'billing',
          key: 'billing',
          createdAt: '2024-03-28T08:57:32Z',
        },
      ],
      nextCursor: null,
      hasNext: false,
    })
    const tags = await adapter.listTags(creds, {})

    const [path] = spy.mock.calls[0]!
    expect(path).toBe('/open/chat-tags')
    expect(tags.map((t) => t.name)).toEqual(['billing'])
  })
})

describe('ChannelTalkAdapter — teams removed, not synthesised from UserChat.teamId', () => {
  it('does not implement listTeams', () => {
    expect((adapter as unknown as Record<string, unknown>)['listTeams']).toBeUndefined()
  })

  it('does not implement getTeam', () => {
    expect((adapter as unknown as Record<string, unknown>)['getTeam']).toBeUndefined()
  })
})
