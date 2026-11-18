import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  type Credentials,
} from '@opensteward/shared'
import { KhorosCareClient } from '../../../../../../src/verticals/customer-support/adapters/khoros-care/client'
import { KhorosCareAdapter } from '../../../../../../src/verticals/customer-support/adapters/khoros-care/index'
import { ACTIVE_WORK_QUEUES, AUTHOR_BY_ID, FACEBOOK_CONVERSATION } from './fixtures'

/**
 * Requests and paging against the Khoros Care API v2
 * (https://{instance}.response.lithium.com/api/v2). Each fake answers only
 * the documented path and honours only the documented parameters.
 */

type Call = { path: string; params: Record<string, unknown> | undefined }

let credSeq = 0
/** Fresh credentials per test, so row-pager memos never carry between tests. */
function creds(): Credentials {
  credSeq++
  return {
    accessToken: `dXNlcjpwYXNz${credSeq}`,
    extra: { instance: 'acme' },
  } as unknown as Credentials
}

function fake(route: (path: string, params: Record<string, unknown> | undefined) => unknown) {
  const calls: Call[] = []
  vi.spyOn(KhorosCareClient.prototype, 'get').mockImplementation(
    async (path: string, params?: Record<string, unknown>) => {
      calls.push({ path, params })
      return route(path, params) as never
    },
  )
  return { calls }
}

afterEach(() => vi.restoreAllMocks())

const adapter = new KhorosCareAdapter()
const L = 3
const N = 2 * L + 1

async function walk<T extends { id: string }>(
  list: (params: ReturnType<typeof withPageSink>) => Promise<T[]>,
  pages: number,
) {
  const seen: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L })
    const rows = await list(params)
    seen.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, hasMore }
}

// ── Tags: GET /tags, no parameters ───────────────────────────────────────────

function fakeTags(n: number) {
  const data = Array.from({ length: n }, (_, i) => ({
    tagId: i,
    name: `g${i}`,
    tagState: 'ENABLED',
  }))
  return fake((path, params) => {
    if (path !== '/tags' || params !== undefined) throw new Error(`undocumented request ${path}`)
    return { status: 'success', data }
  })
}

describe('KhorosCareAdapter.listTags pages locally', () => {
  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    fakeTags(N)
    const c = creds()
    const { seen, hasMore } = await walk((p) => adapter.listTags(c, p), 3)
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i)))
    expect(hasMore).toEqual([true, true, false])
  })

  it('fetches the parameterless collection once on page 2 and reports it paged locally', async () => {
    const { calls } = fakeTags(N)
    const params = withPageSink({ page: 2, limit: L })
    await adapter.listTags(creds(), params)
    expect(calls).toEqual([{ path: '/tags', params: undefined }])
    expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    expect(readUpstreamPage(params)?.totalCount).toBe(N)
  })

  it('serves page 2 through parseListQuery and listPage on the API path', async () => {
    fakeTags(N)
    const params = parseListQuery(
      { page: '2', limit: String(L) },
      adapter as { capabilities?: { maxPageSize?: number } },
    )
    const env = listPage(await adapter.listTags(creds(), params), params, 'khoros-care')
    expect(env.data.map((r) => r.id)).toEqual(['3', '4', '5'])
    expect(env.meta.hasMore).toBe(true)
  })
})

// ── Teams: GET /workqueues/active, no parameters ─────────────────────────────

function fakeWorkQueues(n: number) {
  const data = Array.from({ length: n }, (_, i) => ({
    archived: false,
    description: null,
    id: 100 + i,
    name: `Queue ${i}`,
    uuid: `uuid-${i}`,
  }))
  return fake((path, params) => {
    if (path !== '/workqueues/active' || params !== undefined)
      throw new Error(`undocumented request ${path}`)
    return { data }
  })
}

describe('KhorosCareAdapter.listTeams reads GET /workqueues/active', () => {
  it('serves every work queue once across pages 1..3 with exact hasMore', async () => {
    const { calls } = fakeWorkQueues(N)
    const c = creds()
    const { seen, hasMore } = await walk((p) => adapter.listTeams(c, p), 3)
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(100 + i)))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.every((x) => x.path === '/workqueues/active' && x.params === undefined)).toBe(true)
  })

  it('getTeam reads a listed work queue back by its id, and 404s an absent one', async () => {
    fake((path) => {
      if (path !== '/workqueues/active') throw new Error(`undocumented request ${path}`)
      return ACTIVE_WORK_QUEUES
    })
    const c = creds()
    expect((await adapter.getTeam(c, '13194')).name).toBe('Twitter Mentions')
    await expect(adapter.getTeam(c, '1')).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ── Contacts: GET /authors, `offset` via nextPageUrl ─────────────────────────

/**
 * Persons with uneven handle counts (1, 2, 1, 3, ...) in upstream pages of
 * PAGE persons. Page 1 is `GET /authors` with no parameters; each later page
 * is reached only through the `nextPageUrl` the previous page returned, and
 * the last page has none.
 */
function fakeAuthors(persons: number, perPage: number) {
  const people = Array.from({ length: persons }, (_, p) => ({
    id: `person-${p}`,
    displayNumber: p,
    handles: {
      lithium: Array.from({ length: (p % 3) + 1 }, (_, h) => ({
        lswUuid: `h-${p}-${h}`,
        name: `name-${p}-${h}`,
        id: `${p}${h}`,
      })),
    },
  }))
  const handleIds = people.flatMap((p) => p.handles.lithium.map((h) => h.lswUuid))
  const { calls } = fake((path, params) => {
    if (path !== '/authors') throw new Error(`undocumented request ${path}`)
    const keys = Object.keys(params ?? {})
    if (keys.some((k) => k !== 'offset')) throw new Error(`undocumented parameter ${keys.join()}`)
    const start = params?.['offset'] === undefined ? 0 : Number(params['offset'])
    const end = start + perPage
    return {
      status: 'success',
      data: {
        ...(end < people.length
          ? { nextPageUrl: `https://acme.response.lithium.com/api/v2/authors?offset=${end}` }
          : {}),
        personList: people.slice(start, end),
      },
    }
  })
  return { calls, handleIds }
}

describe('KhorosCareAdapter.listContacts walks GET /authors by nextPageUrl', () => {
  it('serves every handle once across the caller pages with exact hasMore', async () => {
    // 4 persons of 1,2,3,1 handles = 7 handles = N; upstream pages of 3 persons.
    const { handleIds } = fakeAuthors(4, 3)
    expect(handleIds).toHaveLength(N)
    const c = creds()
    const { seen, hasMore } = await walk((p) => adapter.listContacts(c, p), 3)
    expect(seen).toEqual(handleIds)
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends no parameter on page 1 and the nextPageUrl query verbatim after it', async () => {
    const { calls } = fakeAuthors(4, 1)
    const c = creds()
    await adapter.listContacts(c, withPageSink({ page: 1, limit: L }))
    expect(calls[0]).toEqual({ path: '/authors', params: undefined })
    expect(calls.slice(1).map((x) => x.params)).toEqual([{ offset: '1' }, { offset: '2' }])
  })

  it('keeps the walk of each connection to its own authors', async () => {
    // Connection A walks page 1, then connection B (another token) asks for
    // page 2 of its own, different authors. A pager key shared across
    // connections would serve B the rest of the upstream page A fetched.
    fakeAuthors(4, 3)
    const a = creds()
    await adapter.listContacts(a, withPageSink({ page: 1, limit: L }))
    vi.restoreAllMocks()
    fake((path, params) => {
      if (path !== '/authors') throw new Error(`undocumented request ${path}`)
      const start = params?.['offset'] === undefined ? 0 : Number(params['offset'])
      const people = Array.from({ length: 6 }, (_, p) => ({
        id: `b-person-${p}`,
        handles: { lithium: [{ lswUuid: `b-${p}`, name: `b${p}` }] },
      }))
      return {
        status: 'success',
        data: {
          ...(start + 2 < people.length
            ? {
                nextPageUrl: `https://acme.response.lithium.com/api/v2/authors?offset=${start + 2}`,
              }
            : {}),
          personList: people.slice(start, start + 2),
        },
      }
    })
    const b = creds()
    const rows = await adapter.listContacts(b, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['b-3', 'b-4', 'b-5'])
  })

  it('reports the walk as paged locally', async () => {
    fakeAuthors(4, 3)
    const params = withPageSink({ page: 2, limit: L })
    await adapter.listContacts(creds(), params)
    expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
  })

  it('refuses a nextPageUrl that names another resource', async () => {
    fake(() => ({
      status: 'success',
      data: { nextPageUrl: 'https://evil.example/steal?offset=3', personList: AUTHOR_BY_ID.data },
    }))
    await expect(
      adapter.listContacts(creds(), withPageSink({ page: 2, limit: 1 })),
    ).rejects.toThrow(/unexpected path/)
  })

  it('getContact reads a handle back by its lswUuid from GET /authors/{lswUuid}', async () => {
    const { calls } = fake((path) => {
      if (path !== '/authors/b20dc99d-144a-4942-92a9-215e3f2ff864')
        throw new Error(`undocumented ${path}`)
      return AUTHOR_BY_ID
    })
    const contact = await adapter.getContact(creds(), 'b20dc99d-144a-4942-92a9-215e3f2ff864')
    expect(contact.id).toBe('b20dc99d-144a-4942-92a9-215e3f2ff864')
    expect(contact.metadata['network']).toBe('twitter')
    expect(calls).toHaveLength(1)
  })
})

// ── Messages: inside GET /conversations/{lswUuid} ────────────────────────────

describe('KhorosCareAdapter.listMessages reads the conversation detail', () => {
  const CONV_ID = FACEBOOK_CONVERSATION.data[0]!.lswUuid

  function fakeConversation(messages: number) {
    const base = FACEBOOK_CONVERSATION.data[0]!
    const conv = {
      ...base,
      messages: Array.from({ length: messages }, (_, i) => ({
        ...base.messages[0]!,
        lswUuid: `m${i}`,
      })),
    }
    return fake((path, params) => {
      if (path !== `/conversations/${CONV_ID}` || params !== undefined)
        throw new Error(`undocumented ${path}`)
      return { status: 'success', data: [conv] }
    })
  }

  it('serves every message once across pages 1..3 with exact hasMore', async () => {
    const { calls } = fakeConversation(N)
    const c = creds()
    const { seen, hasMore } = await walk((p) => adapter.listMessages(c, CONV_ID, p), 3)
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `m${i}`))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.every((x) => x.path === `/conversations/${CONV_ID}`)).toBe(true)
  })

  it('getTicket reads the same documented conversation', async () => {
    fakeConversation(2)
    const t = await adapter.getTicket(creds(), CONV_ID)
    expect(t).toMatchObject({ id: CONV_ID, number: '758108', teamId: '19' })
  })

  it('404s a conversation the API returns no data for', async () => {
    fake(() => ({ status: 'success', data: [] }))
    await expect(adapter.getTicket(creds(), 'nope')).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ── Refused: tickets and users ───────────────────────────────────────────────

describe('KhorosCareAdapter refuses what the Care API cannot list', () => {
  it.each([
    ['listTickets', () => adapter.listTickets(creds(), withPageSink({ page: 1, limit: L }))],
    ['listUsers', () => adapter.listUsers(creds(), withPageSink({ page: 1, limit: L }))],
    ['getUser', () => adapter.getUser(creds(), 'agent-1')],
  ])('%s throws 501 NOT_SUPPORTED and sends nothing', async (_name, call) => {
    const { calls } = fake(() => {
      throw new Error('no request expected')
    })
    const create = vi.spyOn(axios, 'create')
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('KhorosCareAdapter declares no page maximum', () => {
  // No Care list endpoint used here documents a page size.
  it('leaves maxPageSize undeclared', () => {
    const caps = (adapter as { capabilities?: { maxPageSize?: number } }).capabilities
    expect(caps?.maxPageSize).toBeUndefined()
  })
})
