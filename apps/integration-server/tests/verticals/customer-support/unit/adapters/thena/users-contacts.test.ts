/**
 * Thena users and contacts.
 *
 * Users: GET /v1/search/users. https://docs.thena.ai/api-reference/search/users-search.md
 * documents "Get all users in the organization" as `{ "query_by": "*", "q": "*" }`
 * and the user filter "By user ID: `userId:=URR9A99BDJ`". The entity-search spec
 * (https://docs.thena.ai/api-reference/specs/platform-openapi.yaml,
 * /v1/search/{collection}) documents `page` ("Page number"), `per_page`
 * ("Results per page") and a `result: { found, hits[].document, page }` body.
 * https://docs.thena.ai/api-reference/mcp/teams/search-teams.md shows a first
 * page answered with `"page": 1` and says "Results are paginated with a maximum
 * of 250 items per page."
 *
 * Contacts: the platform spec has only POST on /v1/accounts/contacts and only
 * PUT/DELETE on /v1/accounts/contacts/{contactId}, so both refuse.
 *
 * The fake honours ONLY the documented parameters and refuses any other.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { ThenaAdapter } from '../../../../../../src/verticals/customer-support/adapters/thena/index'
import { UserSchema } from '../../../../../../src/verticals/customer-support/schema/user'

const creds: Credentials = { accessToken: 'thena_test' }

interface Call {
  method: 'get' | 'post'
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let total = 0

const SEARCH_PARAMS = [
  'search_mode',
  'q',
  'query_by',
  'streaming',
  'filter_by',
  'sort_by',
  'facet_by',
  'page',
  'per_page',
  'cursor',
  'direction',
  'group_by',
  'group_limit',
  'include_fields',
  'exclude_fields',
]

const userIds = () => Array.from({ length: total }, (_, i) => `U${i + 1}`)

function doc(id: string) {
  return {
    id,
    uid: id,
    name: `User ${id}`,
    email: `${id.toLowerCase()}@company.com`,
    userType: 'ORG_ADMIN',
    status: 'ACTIVE',
    isActive: true,
    timezone: 'UTC',
    teams: [{ id: 'T1', name: 'Support' }],
  }
}

function searchUsers(params: Record<string, unknown>): unknown {
  for (const k of Object.keys(params)) {
    if (!SEARCH_PARAMS.includes(k)) throw new Error(`undocumented param ${k} on /search/users`)
  }
  if (params['q'] !== '*') throw new Error(`q must be '*', got ${String(params['q'])}`)
  if (params['query_by'] === undefined) throw new Error('query_by is required')
  // Typesense-style: page defaults to 1, per_page is capped at 250.
  const page = params['page'] === undefined ? 1 : Number(params['page'])
  const perPage = params['per_page'] === undefined ? 10 : Number(params['per_page'])
  if (!Number.isInteger(page) || page < 1) throw new Error(`bad page ${String(params['page'])}`)
  if (!Number.isInteger(perPage) || perPage < 1)
    throw new Error(`bad per_page ${String(params['per_page'])}`)
  if (perPage > 250) throw new Error(`per_page ${perPage} above maximum 250`)
  let all = userIds()
  const filter = params['filter_by']
  if (filter !== undefined) {
    const m = /^userId:=(.+)$/.exec(String(filter))
    if (!m) throw new Error(`unexpected filter ${String(filter)}`)
    all = all.filter((id) => id === m[1])
  }
  const slice = all.slice((page - 1) * perPage, page * perPage)
  return {
    result: {
      facet_counts: [],
      found: all.length,
      hits: slice.map((id) => ({ document: doc(id) })),
      page,
      request_params: {},
      search_cutoff: false,
    },
  }
}

beforeEach(() => {
  calls = []
  total = 0
  vi.spyOn(axios, 'create').mockImplementation(() => {
    return {
      get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        const params = { ...(cfg?.params ?? {}) }
        calls.push({ method: 'get', path, params })
        if (path === '/search/users') return { data: searchUsers(params) }
        throw new Error(`unexpected path ${path}`)
      },
      post: async (path: string, body?: Record<string, unknown>) => {
        calls.push({ method: 'post', path, params: { ...(body ?? {}) } })
        throw new Error(`unexpected POST ${path}`)
      },
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new ThenaAdapter()
const runUsers = (p: QueryParams) => adapter.listUsers(creds, p)

describe('thena listUsers searches the users collection', () => {
  it('serves 2L+1 users once, in order, over pages 1..3, with hasMore exact', async () => {
    const L = 4
    total = 2 * L + 1
    const seen: string[] = []
    const reported: Array<boolean | undefined> = []
    const meta: Array<boolean | null | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await runUsers(params)
      seen.push(...rows.map((r) => r.id))
      reported.push(readUpstreamPage(params)?.hasMore)
      meta.push(listPage(rows, params, 'thena').meta.hasMore)
    }
    expect(seen).toEqual(userIds())
    expect(reported).toEqual([true, true, false])
    expect(meta).toEqual([true, true, false])
  })

  it('an exact multiple of the page size ends on the last full page', async () => {
    total = 8
    const params = withPageSink({ page: 2, limit: 4 })
    await runUsers(params)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: 8 })
  })

  it('sends the documented all-users query with the 1-based caller page and limit', async () => {
    total = 9
    await runUsers(withPageSink({ page: 1, limit: 4 }))
    await runUsers(withPageSink({ page: 3, limit: 4 }))
    expect(calls.map((c) => c.path)).toEqual(['/search/users', '/search/users'])
    expect(calls[0]!.params).toEqual({ q: '*', query_by: '*', page: '1', per_page: '4' })
    expect(calls[1]!.params).toEqual({ q: '*', query_by: '*', page: '3', per_page: '4' })
  })

  it('maps each hit document through the canonical UserSchema', async () => {
    total = 2
    const rows = await runUsers(withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => UserSchema.parse(r).id)).toEqual(['U1', 'U2'])
    expect(rows[0]!.teamIds).toEqual(['T1'])
  })

  it('clamps per_page to the documented maximum of 250 and reports the page size', async () => {
    total = 600
    const params = parseListQuery({ page: '2', limit: '500' })
    const rows = await runUsers(params)
    expect(calls[0]!.params).toMatchObject({ page: '2', per_page: '250' })
    expect(rows[0]!.id).toBe('U251')
    expect(rows).toHaveLength(250)
    expect(readUpstreamPage(params)?.pageSize).toBe(250)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    total = 9
    const params = parseListQuery({ page: '2', limit: '4' })
    const env = listPage(await runUsers(params), params, 'thena')
    expect(env.data.map((r) => r.id)).toEqual(['U5', 'U6', 'U7', 'U8'])
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(9)
  })
})

describe('thena getUser filters the users collection by user id', () => {
  it('sends filter_by userId:=<id> and returns the matching document', async () => {
    total = 5
    const u = await adapter.getUser(creds, 'U3')
    expect(UserSchema.parse(u).id).toBe('U3')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/search/users')
    expect(calls[0]!.params).toEqual({ q: '*', query_by: '*', filter_by: 'userId:=U3' })
  })

  it('throws not found when no document carries that id', async () => {
    total = 2
    await expect(adapter.getUser(creds, 'U9')).rejects.toThrow(/not found/)
  })

  it('never returns a hit whose id is not the one asked for', async () => {
    vi.mocked(axios.create).mockImplementation(
      () =>
        ({
          get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
            calls.push({ method: 'get', path, params: { ...(cfg?.params ?? {}) } })
            return { data: { result: { found: 1, hits: [{ document: doc('OTHER') }], page: 1 } } }
          },
          post: vi.fn(),
        }) as unknown as ReturnType<typeof axios.create>,
    )
    await expect(new ThenaAdapter().getUser(creds, 'U3')).rejects.toThrow(/not found/)
  })

  it('refuses an id that would change the filter expression, before sending', async () => {
    total = 2
    await expect(adapter.getUser(creds, 'U1&&userEmail:=x')).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })
})

describe('thena contacts refuse (no documented read endpoint)', () => {
  it('listContacts throws 501 NOT_SUPPORTED and sends no request', async () => {
    const err = await adapter
      .listContacts(creds, withPageSink({ page: 1, limit: 10 }))
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
  })

  it('getContact throws 501 NOT_SUPPORTED and sends no request', async () => {
    const err = await adapter.getContact(creds, 'C123').catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
  })
})
