/**
 * Kore.ai (SmartAssist / Contact Center AI) list paging.
 *
 * From https://koreai.mintlify.site/ai-for-service/apis/contact-center/list-of-conversations
 * (List of Conversations):
 *
 *   Endpoint: "https://{{host}}/agentassist/api/v1/public/{{streamId}}/conversations?skip={}&limit={}&fields={}&status={}&source={}&language={}'"
 *   skip:     "The number of conversations to skip in the result (default = 0)."
 *   response: "skip": 0, "limit": 10, "hasMore": false, "totalPages": 1, "totalResults": 10
 *
 * From https://koreai.mintlify.site/ai-for-service/apis/contact-center/get-all-contacts
 * (Get All Contacts, GET /agentassist/api/v1/public/{{streamId}}/contacts):
 *
 *   skip:    "Number of records to skip before starting to return results"
 *   limit:   "Maximum number of records returned in a single request"
 *   hasMore: "Indicates whether more records are available beyond the current result set."
 *
 * From https://koreai.mintlify.site/ai-for-service/apis/contact-center/list-all-agents
 * (List All Agents):
 *
 *   page:    "The page number to return. Default is 1."
 *   hasMore: "Indicates whether more results are available."
 *
 * From https://koreai.mintlify.site/ai-for-service/apis/contact-center/get-a-specific-conversation
 * (Get a Specific Conversation): one conversation object, `notes` inline, no paging parameter.
 *
 * No maximum `limit` is documented, so the adapter declares none, and the fake
 * applies an undocumented server-side cap to prove a silently short page loses
 * no rows.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type PageMaxBearing,
  type QueryParams,
} from '@opensteward/shared'
import { KoreAiAdapter } from '../../../../../../src/verticals/customer-support/adapters/kore-ai/index'

const PREFIX = '/agentassist/api/v1/public/st-1'
const CREDS = {
  accessToken: 'jwt-test',
  extra: { streamId: 'st-1', accountId: 'acc-1', orgId: 'o-1' },
}
/** The sample responses' page size when `limit` is absent. */
const SERVER_DEFAULT = 10
/** An undocumented cap the fake applies, so an oversized limit comes back short. */
const HIDDEN_CAP = 25
/** Agents come back in fixed pages: the sample shows "limit": 10, and `page` is the only knob. */
const AGENT_PAGE = 10

type Call = { path: string; params: Record<string, unknown> }

/**
 * A fake Kore.ai honouring ONLY the documented parameters: `skip`/`limit` on
 * /conversations and /contacts, `page` (+ `includeQueues`) on agents, and
 * nothing on a single conversation. Anything else is refused.
 */
function fakeKore(
  sizes: {
    conversations?: number
    contacts?: number
    agents?: number
    notes?: number
  },
  quirks: {
    /** Agents: a page past the end is clamped to the last page (hasMore false). */
    clampAgents?: boolean
    /** /conversations: hasMore is always true, so past the end it arrives with no rows. */
    emptyHasMore?: boolean
  } = {},
) {
  const calls: Call[] = []
  const refuse = (path: string, params: Record<string, unknown>, allowed: string[]) => {
    for (const k of Object.keys(params))
      if (!allowed.includes(k)) throw new Error(`undocumented param ${k} on ${path}`)
  }
  const offsetList = (path: string, params: Record<string, unknown>, all: unknown[]) => {
    refuse(path, params, ['skip', 'limit', 'fields', 'status', 'source', 'language'])
    const skip = Number(params['skip'] ?? 0)
    const asked = params['limit'] === undefined ? SERVER_DEFAULT : Number(params['limit'])
    const limit = Math.min(asked, HIDDEN_CAP)
    const results = all.slice(skip, skip + limit)
    const lying = quirks.emptyHasMore === true && path === '/conversations'
    return {
      data: {
        results,
        skip,
        limit,
        hasMore: lying || skip + results.length < all.length,
        totalResults: all.length,
      },
    }
  }

  const get = vi.fn(async (url: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    if (!url.startsWith(PREFIX)) throw new Error(`unexpected GET ${url}`)
    const path = url.slice(PREFIX.length)
    calls.push({ path, params })
    if (path === '/conversations')
      return offsetList(
        path,
        params,
        Array.from({ length: sizes.conversations ?? 0 }, (_, i) => ({ _id: `c-${i + 1}` })),
      )
    if (path === '/contacts')
      return offsetList(
        path,
        params,
        Array.from({ length: sizes.contacts ?? 0 }, (_, i) => ({ id: `ct-${i + 1}` })),
      )
    if (path === '/organizations/o-1/agents') {
      refuse(path, params, ['page', 'includeQueues'])
      const asked = Number(params['page'] ?? 1)
      const lastPage = Math.max(1, Math.ceil((sizes.agents ?? 0) / AGENT_PAGE))
      const page = quirks.clampAgents === true ? Math.min(asked, lastPage) : asked
      const all = Array.from({ length: sizes.agents ?? 0 }, (_, i) => ({ id: `a-${i + 1}` }))
      const skip = (page - 1) * AGENT_PAGE
      const results = all.slice(skip, skip + AGENT_PAGE)
      return {
        data: {
          results,
          skip,
          limit: AGENT_PAGE,
          hasMore: skip + results.length < all.length,
          totalResults: all.length,
        },
      }
    }
    if (path === '/conversations/c-42') {
      refuse(path, params, [])
      return {
        data: {
          _id: 'c-42',
          notes: Array.from({ length: sizes.notes ?? 0 }, (_, i) => ({ _id: `n-${i + 1}` })),
        },
      }
    }
    throw new Error(`unexpected GET ${url}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return calls
}

type Resource = 'conversations' | 'contacts' | 'agents' | 'notes'
type ListFn = (a: KoreAiAdapter, p: QueryParams) => Promise<Array<{ id: string }>>

const LISTS: Array<[string, Resource, string, ListFn]> = [
  ['listTickets', 'conversations', 'c-', (a, p) => a.listTickets(CREDS, p)],
  ['listContacts', 'contacts', 'ct-', (a, p) => a.listContacts(CREDS, p)],
  ['listUsers', 'agents', 'a-', (a, p) => a.listUsers(CREDS, p)],
  ['listMessages', 'notes', 'n-', (a, p) => a.listMessages(CREDS, 'c-42', p)],
]

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('Kore.ai lists serve every row once, page by page', () => {
  for (const [name, resource, prefix, list] of LISTS) {
    for (const L of [4, 12]) {
      it(`${name}: 2L+1 rows over pages 1..3 at limit ${L}, in order, with hasMore exact`, async () => {
        fakeKore({ [resource]: 2 * L + 1 })
        const adapter = new KoreAiAdapter()
        const seen: string[] = []
        const more: Array<boolean | undefined> = []
        for (const page of [1, 2, 3]) {
          const params = withPageSink({ page, limit: L })
          const rows = await list(adapter, params)
          seen.push(...rows.map((r) => r.id))
          more.push(readUpstreamPage(params)?.hasMore)
        }
        expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `${prefix}${i + 1}`))
        expect(more).toEqual([true, true, false])
      })
    }
  }

  it('listTickets: page 2 sends skip at the rows page 1 received, at the caller size', async () => {
    const calls = fakeKore({ conversations: 9 })
    const adapter = new KoreAiAdapter()
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    await adapter.listTickets(CREDS, withPageSink({ page: 2, limit: 4 }))
    const sent = calls.map((c) => c.params)
    expect(sent[0]).toEqual({ limit: 4, skip: 0 })
    expect(sent).toContainEqual({ limit: 4, skip: 4 })
    expect(sent.every((p) => p['skip'] !== 4 || p['limit'] === 4)).toBe(true)
  })

  it('listContacts: page 2 sends skip=4', async () => {
    const calls = fakeKore({ contacts: 9 })
    const adapter = new KoreAiAdapter()
    await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 4 }))
    await adapter.listContacts(CREDS, withPageSink({ page: 2, limit: 4 }))
    expect(calls.map((c) => c.params['skip'])).toContain(4)
    expect(calls.every((c) => c.path === '/contacts')).toBe(true)
  })

  it('listUsers: page 2 of the caller walks to the documented `page` it lives on', async () => {
    const calls = fakeKore({ agents: 25 })
    const adapter = new KoreAiAdapter()
    const rows = await adapter.listUsers(CREDS, withPageSink({ page: 2, limit: 12 }))
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 12 }, (_, i) => `a-${13 + i}`))
    expect(calls.map((c) => c.params['page'])).toEqual([1, 2, 3])
  })

  it('a limit above what the server serves (undocumented cap) loses no rows', async () => {
    const calls = fakeKore({ conversations: 60, contacts: 60 })
    const adapter = new KoreAiAdapter()
    const p1 = withPageSink({ page: 1, limit: 40 })
    const t1 = await adapter.listTickets(CREDS, p1)
    const t2 = await adapter.listTickets(CREDS, withPageSink({ page: 2, limit: 40 }))
    expect([...t1, ...t2].map((r) => r.id)).toEqual(
      Array.from({ length: 60 }, (_, i) => `c-${i + 1}`),
    )
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    // Each upstream request continues at the rows actually received, never at skip=40.
    expect(calls.map((c) => c.params['skip'])).toEqual([0, 25, 50])
    const c = await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 500 }))
    expect(c).toHaveLength(60)
  })

  it("conversations and contacts keep separate walks: neither serves the other's rows", async () => {
    const calls = fakeKore({ conversations: 9, contacts: 5 })
    const adapter = new KoreAiAdapter()
    // Tickets page 1 peeks the next upstream page (skip=4) to decide hasMore.
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    const c2 = await adapter.listContacts(CREDS, withPageSink({ page: 2, limit: 4 }))
    expect(c2.map((r) => r.id)).toEqual(['ct-5'])
    expect(calls).toContainEqual({ path: '/contacts', params: { limit: 4, skip: 4 } })
    // Contacts ended at row 5; tickets page 3 (row 9 on) is not past the tickets end.
    const t3 = await adapter.listTickets(CREDS, withPageSink({ page: 3, limit: 4 }))
    expect(t3.map((r) => r.id)).toEqual(['c-9'])
    expect(calls).toContainEqual({ path: '/conversations', params: { limit: 4, skip: 8 } })
  })

  it('listUsers: hasMore ends the walk, so a server clamping past-end pages adds no duplicates', async () => {
    const calls = fakeKore({ agents: 25 }, { clampAgents: true })
    const adapter = new KoreAiAdapter()
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await adapter.listUsers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 25 }, (_, i) => `a-${i + 1}`))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls.map((c) => c.params['page'])).toEqual([1, 2, 3])
  })

  it('an empty page claiming hasMore ends the skip walk instead of looping on itself', async () => {
    const calls = fakeKore({ conversations: 4 }, { emptyHasMore: true })
    const adapter = new KoreAiAdapter()
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await adapter.listTickets(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['c-1', 'c-2', 'c-3', 'c-4'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls.map((c) => c.params['skip'])).toEqual([0, 4])
  })

  it('declares no page maximum: none is documented', () => {
    const adapter = new KoreAiAdapter() as { capabilities?: { maxPageSize?: number } }
    expect(adapter.capabilities?.maxPageSize).toBeUndefined()
  })

  it('pager walks are scoped per connection', async () => {
    const calls = fakeKore({ conversations: 9 })
    const adapter = new KoreAiAdapter()
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    await adapter.listTickets(
      { ...CREDS, accessToken: 'jwt-other' },
      withPageSink({ page: 2, limit: 4 }),
    )
    expect(calls.map((c) => c.params['skip'])).toEqual([0, 4, 0, 4, 8])
  })

  it('API path: parseListQuery → listTickets → listPage reports the next page', async () => {
    fakeKore({ conversations: 250 })
    const adapter = new KoreAiAdapter()
    const params = parseListQuery({ limit: '100', page: '2' }, adapter as PageMaxBearing)
    const rows = await adapter.listTickets(CREDS, params)
    const env = listPage(rows, params, 'kore-ai')
    expect(env.data.map((r) => r.id)).toEqual(Array.from({ length: 100 }, (_, i) => `c-${101 + i}`))
    expect(env.meta.hasMore).toBe(true)
  })
})
