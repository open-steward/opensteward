/**
 * rasayel — paging for the list methods whose GraphQL query validates against
 * Rasayel's published schema.
 *
 * Rasayel's pagination guide (https://developers.rasayel.io/graphql/pagination)
 * says "Rasayel uses a conventional cursor-based pagination system for its
 * GraphQL API" and "Notice that the `pageInfo` in the response includes an
 * `endCursor` key. This is our pagination cursor. To retrieve the next page of
 * `AppUsers`, simply include that cursor in your query", with the example
 * `appUsers(after: "NDQ", first: 2)`. `PageInfo.hasNextPage` is documented as
 * "When paginating forwards, are there more items?". `App.teams` takes no
 * arguments and returns `[Team!]!` ("Lists all teams belonging to this app"),
 * so it is the whole collection and pages locally.
 *
 * The adapter used to drop the caller's `page`, so page 2 of every list was
 * page 1 again. No maximum page size is documented, so none is declared and
 * the caller's limit is sent as `first` unchanged.
 *
 * The fake below honours ONLY the documented arguments: `first` and `after`
 * (plus `conversationId: Int!` for a conversation's messages, as in the
 * "Exporting All Conversations" guide: `query ExportAllMessagesQuery(
 * $conversationId: Int!, $first: Int, $after: String)`). Any other variable
 * is a request the platform does not document, and fails the test.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  parseListQuery,
  listPage,
} from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { RasayelAdapter } from '../../../../../../src/verticals/customer-support/adapters/rasayel/index'
import { RasayelClient } from '../../../../../../src/verticals/customer-support/adapters/rasayel/client'

const creds = { accessToken: 'Basic rasayel_a', extra: {} } as Credentials

interface Call {
  op: string
  variables: Record<string, unknown>
}

/** An opaque cursor, as the platform mints it (base64 of the next offset). */
const encode = (offset: number) => Buffer.from(`c:${offset}`).toString('base64')
const decode = (cursor: unknown) =>
  Number(Buffer.from(String(cursor), 'base64').toString('utf8').split(':')[1])

/** The `app` connection field each list operation reads. */
const OPS: Record<string, string> = {
  ListConversations: 'conversations',
  ListChannelUsers: 'channelUsers',
  ListAppUsers: 'appUsers',
  ListTags: 'tags',
  ListSavedReplies: 'savedReplies',
}

/**
 * Fake Rasayel connection: `total` rows for operation `op`, read with `first`
 * and `after` only. Rows past `first` are never returned.
 */
function fakeConnection(op: string, total: number, make: (i: number) => unknown) {
  const calls: Call[] = []
  vi.spyOn(RasayelClient.prototype, 'query').mockImplementation((async (
    query: string,
    variables?: Record<string, unknown>,
  ) => {
    const v = variables ?? {}
    const name = /query\s+(\w+)/.exec(query)?.[1] ?? ''
    calls.push({ op: name, variables: v })
    if (name !== op) throw new Error(`unexpected operation in test: ${name}`)
    const undocumented = Object.keys(v).filter((k) => k !== 'first' && k !== 'after')
    if (undocumented.length) throw new Error(`undocumented variables: ${undocumented.join(', ')}`)
    if (!/pageInfo\s*\{[^}]*endCursor[^}]*hasNextPage/.test(query))
      throw new Error('query does not select pageInfo { endCursor hasNextPage }')
    const first = Number(v['first'])
    if (!(first >= 1)) throw new Error(`validation: first ${String(v['first'])}`)
    const offset = v['after'] == null ? 0 : decode(v['after'])
    const n = Math.max(0, Math.min(first, total - offset))
    const edges = Array.from({ length: n }, (_, i) => ({ node: make(offset + i) }))
    const end = offset + n
    return {
      app: {
        [OPS[op]!]: {
          edges,
          pageInfo: { hasNextPage: end < total, endCursor: n > 0 ? encode(end) : null },
        },
      },
    }
  }) as typeof RasayelClient.prototype.query)
  return calls
}

/** Fake `app.teams`: every team, no arguments. */
function fakeTeams(total: number) {
  const calls: Call[] = []
  vi.spyOn(RasayelClient.prototype, 'query').mockImplementation((async (
    query: string,
    variables?: Record<string, unknown>,
  ) => {
    const name = /query\s+(\w+)/.exec(query)?.[1] ?? ''
    calls.push({ op: name, variables: variables ?? {} })
    if (name !== 'ListTeams') throw new Error(`unexpected operation in test: ${name}`)
    return {
      app: {
        teams: Array.from({ length: total }, (_, i) => ({ id: i, uuid: `t${i}`, name: `T${i}` })),
      },
    }
  }) as typeof RasayelClient.prototype.query)
  return calls
}

/** Built from the `conversation.created` webhook example's Conversation. */
const conversation = (i: number) => ({
  id: i,
  uuid: `c${i}`,
  state: 'OPENED',
  channelType: 'TELEGRAM',
  createdAt: 1652783952,
  contact: { id: 1 },
  assignee: null,
  assignedTeam: null,
  tags: { nodes: [] },
})
/** Built from the `channel_user.created` webhook example's ChannelUser. */
const channelUser = (i: number) => ({
  id: i,
  uuid: `cu${i}`,
  displayName: 'Ahmed Abbas',
  identifiers: [{ sourceId: '1765698763', category: 'TELEGRAM_ID' }],
})
/** Built from the `message.created` webhook example's TextMessage. */
const message = (i: number) => ({
  __typename: 'TextMessage',
  id: i,
  uuid: `m${i}`,
  direction: 'INBOUND',
  messageType: 'TEXT',
  messageCategory: 'USER',
  createdAt: 1652973168,
  user: { __typename: 'ChannelUser', id: 1 },
  body: 'Hello',
})
const appUser = (i: number) => ({ id: i, uuid: `u${i}`, email: `u${i}@x.io`, fullName: `U${i}` })
const tag = (i: number) => ({ id: i, uuid: `g${i}`, tagName: `tag${i}` })
const savedReply = (i: number) => ({ id: i, uuid: `s${i}`, title: `S${i}`, body: `b${i}` })

type Lister = (p: ReturnType<typeof withPageSink>) => Promise<Array<{ id: string }>>

const adapter = new RasayelAdapter()
const cases: Array<{ name: string; op: string; make: (i: number) => unknown; list: Lister }> = [
  {
    name: 'listTickets',
    op: 'ListConversations',
    make: conversation,
    list: (p) => adapter.listTickets(creds, p),
  },
  {
    name: 'listContacts',
    op: 'ListChannelUsers',
    make: channelUser,
    list: (p) => adapter.listContacts(creds, p),
  },
  {
    name: 'listUsers',
    op: 'ListAppUsers',
    make: appUser,
    list: (p) => adapter.listUsers(creds, p),
  },
  { name: 'listTags', op: 'ListTags', make: tag, list: (p) => adapter.listTags(creds, p) },
  {
    name: 'listMacros',
    op: 'ListSavedReplies',
    make: savedReply,
    list: (p) => adapter.listMacros(creds, p),
  },
]

const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i))

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(cases)('rasayel $name pages by cursor', ({ op, make, list }) => {
  it('pages 1..3 of 2L+1 rows serve every id once, in order, with exact hasMore', async () => {
    const L = 4
    const calls = fakeConnection(op, 2 * L + 1, make)
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const items = await list(params)
      got.push(...items.map((x) => x.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(got).toEqual(ids(2 * L + 1))
    expect(more).toEqual([true, true, false])
    expect(calls.map((c) => c.variables['first'])).toEqual([L, L, L])
    expect(calls.map((c) => c.variables['after'])).toEqual([undefined, encode(L), encode(2 * L)])
  })

  it('the page-2 request carries the documented `after` key', async () => {
    const calls = fakeConnection(op, 10, make)
    await list(withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    await list(withPageSink({ page: 2, limit: 3 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.variables).toHaveProperty('after', encode(3))
    expect(calls[0]!.variables).toHaveProperty('first', 3)
  })

  it('sends a large limit unchanged (no documented maximum) and reports it', async () => {
    const calls = fakeConnection(op, 150, make)
    const params = withPageSink({ page: 1, limit: 120 })
    const items = await list(params)
    expect(calls[0]!.variables['first']).toBe(120)
    expect(items).toHaveLength(120)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(readUpstreamPage(params)?.pageSize).toBe(120)
  })

  it('walks through parseListQuery and listPage to the end', async () => {
    const total = 11
    fakeConnection(op, total, make)
    const got: string[] = []
    const sizes: number[] = []
    for (let n = 1; n < 50; n++) {
      const params = parseListQuery({ limit: '5', page: String(n) })
      const env = listPage(await list(params), params, 'rasayel')
      got.push(...env.data.map((x) => x.id))
      sizes.push(env.data.length)
      if (env.meta.hasMore !== true) break
    }
    expect(got).toEqual(ids(total))
    expect(sizes).toEqual([5, 5, 1])
  })
})

describe('rasayel cursor chains do not leak between keys', () => {
  it('a second connection walks its own chain (listTags)', async () => {
    const calls = fakeConnection('ListTags', 10, tag)
    await adapter.listTags(creds, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const other = { accessToken: 'Basic rasayel_b', extra: {} } as Credentials
    const items = await adapter.listTags(other, withPageSink({ page: 2, limit: 3 }))
    expect(calls.map((c) => c.variables['after'])).toEqual([undefined, encode(3)])
    expect(items.map((x) => x.id)).toEqual(['3', '4', '5'])
  })
})

describe('rasayel cursor chains are keyed by limit and collection', () => {
  it('a page-2 request at a new limit starts a fresh walk at that limit', async () => {
    const calls = fakeConnection('ListTags', 10, tag)
    await adapter.listTags(creds, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const items = await adapter.listTags(creds, withPageSink({ page: 2, limit: 5 }))
    expect(items.map((x) => x.id)).toEqual(['5', '6', '7', '8', '9'])
    expect(calls.map((c) => c.variables['after'])).toEqual([undefined, encode(5)])
    expect(calls.map((c) => c.variables['first'])).toEqual([5, 5])
  })

  it('a cold listUsers page 2 does not reuse the listTags chain', async () => {
    const tagCalls = fakeConnection('ListTags', 10, tag)
    await adapter.listTags(creds, withPageSink({ page: 1, limit: 3 }))
    await adapter.listTags(creds, withPageSink({ page: 2, limit: 3 }))
    expect(tagCalls.map((c) => c.variables['after'])).toEqual([undefined, encode(3)])
    vi.restoreAllMocks()
    const userCalls = fakeConnection('ListAppUsers', 10, appUser)
    const items = await adapter.listUsers(creds, withPageSink({ page: 2, limit: 3 }))
    expect(userCalls.map((c) => c.variables['after'])).toEqual([undefined, encode(3)])
    expect(items.map((x) => x.id)).toEqual(['3', '4', '5'])
  })
})

describe('rasayel explicit caller cursor', () => {
  it('is one request at that position and reports its end', async () => {
    const calls = fakeConnection('ListAppUsers', 10, appUser)
    const mid = withPageSink({ limit: 3, cursor: encode(3) } as Parameters<typeof withPageSink>[0])
    const items = await adapter.listUsers(creds, mid)
    expect(calls).toHaveLength(1)
    expect(items.map((x) => x.id)).toEqual(['3', '4', '5'])
    expect(readUpstreamPage(mid)?.hasMore).toBe(true)
  })

  it('reports hasMore=false on the last page', async () => {
    const calls = fakeConnection('ListAppUsers', 10, appUser)
    const last = withPageSink({ limit: 3, cursor: encode(9) } as Parameters<typeof withPageSink>[0])
    const items = await adapter.listUsers(creds, last)
    expect(calls).toHaveLength(1)
    expect(items.map((x) => x.id)).toEqual(['9'])
    expect(readUpstreamPage(last)?.hasMore).toBe(false)
  })
})

describe('rasayel listTeams pages the whole collection locally', () => {
  it('pages 1..3 of 2L+1 teams serve every id once, in order, with exact hasMore', async () => {
    const L = 4
    const calls = fakeTeams(2 * L + 1)
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const items = await adapter.listTeams(creds, params)
      got.push(...items.map((x) => x.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(got).toEqual(ids(2 * L + 1))
    expect(more).toEqual([true, true, false])
    // `teams` takes no arguments: nothing paging-shaped is ever sent.
    expect(calls.every((c) => Object.keys(c.variables).length === 0)).toBe(true)
  })

  it('walks through parseListQuery and listPage to the end', async () => {
    fakeTeams(7)
    const got: string[] = []
    for (let n = 1; n < 20; n++) {
      const params = parseListQuery({ limit: '3', page: String(n) })
      const env = listPage(await adapter.listTeams(creds, params), params, 'rasayel')
      got.push(...env.data.map((x) => x.id))
      if (env.meta.hasMore !== true) break
    }
    expect(got).toEqual(ids(7))
  })

  it('getTeam still finds a team past the first page', async () => {
    fakeTeams(120)
    const team = await adapter.getTeam(creds, '110')
    expect(team.id).toBe('110')
  })
})

/**
 * Fake `app.conversation(id: Int!).messages(first, after)`: `total` messages
 * on conversation 42; any other id is no conversation (`conversation` is
 * nullable in the schema).
 */
function fakeMessages(total: number) {
  const calls: Call[] = []
  vi.spyOn(RasayelClient.prototype, 'query').mockImplementation((async (
    query: string,
    variables?: Record<string, unknown>,
  ) => {
    const v = variables ?? {}
    const name = /query\s+(\w+)/.exec(query)?.[1] ?? ''
    calls.push({ op: name, variables: v })
    if (name !== 'ListMessages') throw new Error(`unexpected operation in test: ${name}`)
    if (!/\$conversationId:\s*Int!/.test(query))
      throw new Error('conversationId must be declared Int!')
    if (!/pageInfo\s*\{[^}]*endCursor[^}]*hasNextPage/.test(query))
      throw new Error('query does not select pageInfo { endCursor hasNextPage }')
    const undocumented = Object.keys(v).filter(
      (k) => k !== 'first' && k !== 'after' && k !== 'conversationId',
    )
    if (undocumented.length) throw new Error(`undocumented variables: ${undocumented.join(', ')}`)
    if (typeof v['conversationId'] !== 'number')
      throw new Error('validation: conversationId is Int!')
    if (v['conversationId'] !== 42) return { app: { conversation: null } }
    const first = Number(v['first'])
    const offset = v['after'] == null ? 0 : decode(v['after'])
    const n = Math.max(0, Math.min(first, total - offset))
    const edges = Array.from({ length: n }, (_, i) => ({ node: message(offset + i) }))
    const end = offset + n
    return {
      app: {
        conversation: {
          messages: {
            edges,
            pageInfo: { hasNextPage: end < total, endCursor: n > 0 ? encode(end) : null },
          },
        },
      },
    }
  }) as typeof RasayelClient.prototype.query)
  return calls
}

describe('rasayel listMessages pages a conversation by cursor', () => {
  it('pages 1..3 of 2L+1 messages serve every id once, in order, with exact hasMore', async () => {
    const L = 4
    const calls = fakeMessages(2 * L + 1)
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const items = await adapter.listMessages(creds, '42', params)
      expect(items.every((m) => m.ticketId === '42')).toBe(true)
      got.push(...items.map((x) => x.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(got).toEqual(ids(2 * L + 1))
    expect(more).toEqual([true, true, false])
    expect(calls.map((c) => c.variables['conversationId'])).toEqual([42, 42, 42])
    expect(calls.map((c) => c.variables['first'])).toEqual([L, L, L])
    expect(calls.map((c) => c.variables['after'])).toEqual([undefined, encode(L), encode(2 * L)])
  })

  it('keeps a separate cursor chain per conversation', async () => {
    const calls = fakeMessages(10)
    await adapter.listMessages(creds, '42', withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    await expect(
      adapter.listMessages(creds, '7', withPageSink({ page: 2, limit: 3 })),
    ).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(calls[0]!.variables['after']).toBeUndefined()
    expect(calls[0]!.variables['conversationId']).toBe(7)
  })

  it('a conversation that does not exist is a 404, not an empty page', async () => {
    fakeMessages(3)
    await expect(
      adapter.listMessages(creds, '7', withPageSink({ page: 1, limit: 3 })),
    ).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('a non-integer conversation id is a 404 and sends nothing', async () => {
    const calls = fakeMessages(3)
    await expect(
      adapter.listMessages(creds, 'abc', withPageSink({ page: 1, limit: 3 })),
    ).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(calls).toHaveLength(0)
  })
})

/** Fake single-record reads: `conversation(id: Int!)` and `channelUser(id: Int!)`. */
function fakeGet() {
  const calls: Call[] = []
  vi.spyOn(RasayelClient.prototype, 'query').mockImplementation((async (
    query: string,
    variables?: Record<string, unknown>,
  ) => {
    const v = variables ?? {}
    const name = /query\s+(\w+)/.exec(query)?.[1] ?? ''
    calls.push({ op: name, variables: v })
    if (!/\$id:\s*Int!/.test(query)) throw new Error('id must be declared Int!')
    if (typeof v['id'] !== 'number') throw new Error('validation: id is Int!')
    if (name === 'GetConversation')
      return { app: { conversation: v['id'] === 5 ? conversation(5) : null } }
    if (name === 'GetChannelUser')
      return { app: { channelUser: v['id'] === 5 ? channelUser(5) : null } }
    throw new Error(`unexpected operation in test: ${name}`)
  }) as typeof RasayelClient.prototype.query)
  return calls
}

describe('rasayel getTicket / getContact read back a listed id', () => {
  it('getTicket sends the id as Int', async () => {
    const calls = fakeGet()
    const t = await adapter.getTicket(creds, '5')
    expect(t.id).toBe('5')
    expect(calls[0]!.variables).toEqual({ id: 5 })
  })

  it('getContact sends the id as Int', async () => {
    const calls = fakeGet()
    const c = await adapter.getContact(creds, '5')
    expect(c.id).toBe('5')
    expect(calls[0]!.variables).toEqual({ id: 5 })
  })

  it('missing records are 404', async () => {
    fakeGet()
    await expect(adapter.getTicket(creds, '6')).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter.getContact(creds, '6')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('non-integer ids are 404 and send nothing', async () => {
    const calls = fakeGet()
    await expect(adapter.getTicket(creds, 'x1')).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter.getContact(creds, 'x1')).rejects.toMatchObject({ statusCode: 404 })
    expect(calls).toHaveLength(0)
  })
})

describe('rasayel queries select only fields the schema declares', () => {
  it('listContacts reads identifiers as { category sourceId }', async () => {
    let seen = ''
    vi.spyOn(RasayelClient.prototype, 'query').mockImplementation((async (query: string) => {
      seen = query
      return {
        app: { channelUsers: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } },
      }
    }) as typeof RasayelClient.prototype.query)
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: 2 }))
    expect(seen).toMatch(/identifiers\s*\{\s*category\s+sourceId\s*\}/)
  })

  it('listMessages reads body through inline fragments, not on the Message interface', async () => {
    let seen = ''
    vi.spyOn(RasayelClient.prototype, 'query').mockImplementation((async (query: string) => {
      seen = query
      return {
        app: {
          conversation: {
            messages: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } },
          },
        },
      }
    }) as typeof RasayelClient.prototype.query)
    await adapter.listMessages(creds, '42', withPageSink({ page: 1, limit: 2 }))
    expect(seen).toMatch(/\.\.\. on TextMessage \{ body \}/)
    expect(seen).not.toMatch(/node \{\s*id uuid body/)
  })
})
