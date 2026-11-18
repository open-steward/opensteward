/**
 * Document360 list paging and read-back, against a fake that honours only the
 * documented contract in https://apihub.document360.io/swagger/v2/swagger.json:
 *
 *   GET /v2/Teams — "Uses skip/take pagination — supply `skip = take * (page - 1)`
 *   to navigate through pages." skip: "Number of records to skip (offset).
 *   Default: 0." take: "Number of records to return per page. Default: 20."
 *   Body: TeamAccountSummaryCustomerListCustomerApiResponse, `{ result: [...] }`.
 *
 *   GET /v2/Teams/{userId} — "Gets complete team account details by ID".
 *   Body: CompleteUserInfoCustomerCustomerApiResponse, `{ result: {...} }`.
 *
 *   GET /v2/ProjectVersions — "Gets the list of workspaces (project versions) in
 *   the project"; declares no parameters. Body: GetProjectVersionsResponse,
 *   `{ data: [...] }`.
 *
 * The client's baseURL is https://apihub.document360.io/v2, so paths here are
 * relative to /v2.
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
import { Document360Adapter } from '../../../../../../src/verticals/customer-support/adapters/document360/index'
import { UserSchema } from '../../../../../../src/verticals/customer-support/schema/user'
import { TeamSchema } from '../../../../../../src/verticals/customer-support/schema/team'

const creds: Credentials = { accessToken: 'd360_token' }

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let created: Array<Record<string, unknown>> = []
let total = 0
/** When set, every response is the documented failure envelope instead. */
let failing = false

const ids = () => Array.from({ length: total }, (_, i) => `u${i + 1}`)

function only(path: string, params: Record<string, unknown>, allowed: string[]): void {
  for (const k of Object.keys(params)) {
    if (!allowed.includes(k)) throw new Error(`undocumented param ${k} on ${path}`)
  }
}

const envelope = { extension_data: null, success: true, errors: [], warnings: [], information: [] }

function respond(path: string, params: Record<string, unknown>): unknown {
  if (failing) {
    return {
      extension_data: null,
      success: false,
      errors: [{ error_code: 'E1', description: 'boom' }],
      warnings: [],
      information: [],
    }
  }
  if (path === '/Teams') {
    only(path, params, ['skip', 'take'])
    const skip = params['skip'] === undefined ? 0 : Number(params['skip'])
    const take = params['take'] === undefined ? 20 : Number(params['take'])
    if (!Number.isInteger(skip) || skip < 0) throw new Error(`bad skip ${String(params['skip'])}`)
    if (!Number.isInteger(take) || take < 1) throw new Error(`bad take ${String(params['take'])}`)
    return {
      result: ids()
        .slice(skip, skip + take)
        .map((id) => ({
          user_id: id,
          first_name: 'Peter',
          last_name: 'Jone',
          email_id: `${id}@example.com`,
          profile_logo_url: null,
          portal_role: 'Editor',
          last_login_at: null,
        })),
      ...envelope,
    }
  }
  const member = /^\/Teams\/([^/]+)$/.exec(path)
  if (member) {
    only(path, params, [])
    if (member[1] === 'absent') return { result: null, ...envelope }
    if (member[1] === 'gone404') {
      throw Object.assign(new Error('Request failed with status code 404'), {
        response: { status: 404, data: { ...envelope, success: false } },
      })
    }
    if (member[1] === 'invalid400') {
      // The documented 400 example "Teams - Invalid User Id", verbatim.
      throw Object.assign(new Error('Request failed with status code 400'), {
        response: {
          status: 400,
          data: {
            extension_data: null,
            success: true,
            errors: [
              {
                extension_data: null,
                stack_trace: null,
                description: 'The user id does not exist.',
                error_code: null,
                custom_data: null,
              },
            ],
            warnings: [],
            information: [],
          },
        },
      })
    }
    if (member[1] === 'unauth401') {
      throw Object.assign(new Error('Request failed with status code 401'), {
        response: { status: 401, data: { ...envelope, success: false } },
      })
    }
    if (member[1] === 'other400') {
      throw Object.assign(new Error('Request failed with status code 400'), {
        response: {
          status: 400,
          data: { ...envelope, errors: [{ description: 'Something else is invalid.' }] },
        },
      })
    }
    return {
      result: {
        user_id: decodeURIComponent(member[1]!),
        first_name: 'peter',
        last_name: 'jone',
        email_id: 'peterjone@mail.com',
        profile_logo_url: null,
        last_login_at: '2024-06-13T14:30:00',
        portal_role: { role_id: 'c1b8ae08-78d5-41d9-b3c4-3b0892b05ca8', role_name: ' Owner' },
        content_roles: [],
        associated_groups: [],
      },
      ...envelope,
    }
  }
  if (path === '/ProjectVersions') {
    only(path, params, [])
    return {
      data: ids().map((id, i) => ({
        id,
        version_number: i + 1,
        base_version_number: 0,
        version_code_name: `v${i + 1}`,
        is_main_version: i === 0,
        is_beta: false,
        is_public: true,
        is_deprecated: false,
        created_at: '2024-06-13T14:30:00',
        modified_at: '2024-06-13T14:30:00',
        language_versions: [],
        slug: `v${i + 1}`,
        order: i,
        version_type: 'knowledgeBase',
      })),
      ...envelope,
    }
  }
  throw new Error(`undocumented path ${path}`)
}

beforeEach(() => {
  calls = []
  created = []
  total = 0
  failing = false
  vi.spyOn(axios, 'create').mockImplementation((cfg?: unknown) => {
    created.push(cfg as Record<string, unknown>)
    return {
      get: async (path: string, c?: { params?: Record<string, unknown> }) => {
        const params = { ...(c?.params ?? {}) }
        calls.push({ path, params })
        return { data: respond(path, params) }
      },
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new Document360Adapter()

async function walk(run: (p: QueryParams) => Promise<Array<{ id: string }>>, limit: number) {
  const seen: string[] = []
  const reported: Array<boolean | undefined> = []
  const meta: Array<boolean | null | undefined> = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    seen.push(...rows.map((r) => r.id))
    reported.push(readUpstreamPage(params)?.hasMore)
    meta.push(listPage(rows, params, 'document360').meta.hasMore)
  }
  return { seen, reported, meta }
}

describe('document360 client', () => {
  it('sends the documented api_token header to the documented v2 host', async () => {
    total = 1
    await adapter.listTeams(creds, withPageSink({ page: 1, limit: 5 }))
    expect(created[0]).toMatchObject({
      baseURL: 'https://apihub.document360.io/v2',
      headers: { api_token: 'd360_token' },
    })
  })
})

describe('document360 listUsers pages GET /v2/Teams by skip/take', () => {
  it('serves 2L+1 rows once over pages 1..3; the short page ends it', async () => {
    const L = 4
    total = 2 * L + 1
    const { seen, reported, meta } = await walk((p) => adapter.listUsers(creds, p), L)
    expect(seen).toEqual(ids())
    // No count in the body: a full page is unknown, the short page ends it.
    expect(reported).toEqual([undefined, undefined, false])
    expect(meta).toEqual([null, null, false])
  })

  it('page N sends skip = take * (N - 1) and take = the caller limit', async () => {
    total = 9
    await adapter.listUsers(creds, withPageSink({ page: 1, limit: 4 }))
    await adapter.listUsers(creds, withPageSink({ page: 2, limit: 4 }))
    await adapter.listUsers(creds, withPageSink({ page: 3, limit: 4 }))
    expect(calls.map((c) => c.path)).toEqual(['/Teams', '/Teams', '/Teams'])
    expect(calls.map((c) => c.params)).toEqual([
      { skip: 0, take: 4 },
      { skip: 4, take: 4 },
      { skip: 8, take: 4 },
    ])
  })

  it('reads rows from the documented `result` array and they parse as Users', async () => {
    total = 2
    const rows = await adapter.listUsers(creds, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['u1', 'u2'])
    for (const r of rows) UserSchema.parse(r)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    total = 9
    const params = parseListQuery({ page: '2', limit: '4' })
    const env = listPage(await adapter.listUsers(creds, params), params, 'document360')
    expect(env.data.map((r) => r.id)).toEqual(['u5', 'u6', 'u7', 'u8'])
  })

  it('sends a large caller limit unclamped: the spec documents no maximum for take', async () => {
    total = 3
    await adapter.listUsers(creds, withPageSink({ page: 2, limit: 500 }))
    expect(calls.map((c) => c.params)).toEqual([{ skip: 500, take: 500 }])
  })

  it('with no caller limit sends the documented default take of 20', async () => {
    total = 3
    await adapter.listUsers(creds, {})
    expect(calls.map((c) => c.params)).toEqual([{ skip: 0, take: 20 }])
  })

  it('an exact multiple ends on an empty page reported as the end', async () => {
    total = 8
    const { seen, reported } = await walk((p) => adapter.listUsers(creds, p), 4)
    expect(seen).toEqual(ids())
    expect(reported).toEqual([undefined, undefined, false])
  })
})

describe('document360 getUser reads GET /v2/Teams/{userId}', () => {
  it('one request to the documented path; role from portal_role.role_name', async () => {
    const u = await adapter.getUser(creds, 'f11efc6f-e968-4e95-82eb-85ad61559de8')
    expect(calls).toEqual([{ path: '/Teams/f11efc6f-e968-4e95-82eb-85ad61559de8', params: {} }])
    expect(UserSchema.parse(u)).toMatchObject({
      id: 'f11efc6f-e968-4e95-82eb-85ad61559de8',
      role: ' Owner',
    })
  })
})

describe('document360 getUser with a null result', () => {
  it('is a 404, not a crash', async () => {
    await expect(adapter.getUser(creds, 'absent')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('document360 getUser escapes the id into one path segment', () => {
  it('encodes a reserved character rather than changing the path', async () => {
    await adapter.getUser(creds, 'a/b c')
    expect(calls.map((c) => c.path)).toEqual(['/Teams/a%2Fb%20c'])
  })
})

describe('document360 getUser maps the documented unknown-id errors to NOT_FOUND', () => {
  it('HTTP 404 is NOT_FOUND 404', async () => {
    await expect(adapter.getUser(creds, 'gone404')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('the documented 400 "The user id does not exist." is NOT_FOUND 404', async () => {
    await expect(adapter.getUser(creds, 'invalid400')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('a 401 stays the upstream auth error', async () => {
    const err = await adapter.getUser(creds, 'unauth401').catch((e: unknown) => e)
    expect(err).toMatchObject({ response: { status: 401 } })
    expect(err).not.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('any other 400 stays the upstream validation error', async () => {
    const err = await adapter.getUser(creds, 'other400').catch((e: unknown) => e)
    expect(err).toMatchObject({ response: { status: 400 } })
    expect(err).not.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('document360 listTeams pages GET /v2/ProjectVersions locally', () => {
  it('serves 2L+1 rows once over pages 1..3 with exact hasMore', async () => {
    const L = 3
    total = 2 * L + 1
    const { seen, reported, meta } = await walk((p) => adapter.listTeams(creds, p), L)
    expect(seen).toEqual(ids())
    expect(reported).toEqual([true, true, false])
    expect(meta).toEqual([true, true, false])
  })

  it('sends no parameters (the operation declares none) and parses as Teams', async () => {
    total = 2
    const rows = await adapter.listTeams(creds, withPageSink({ page: 1, limit: 10 }))
    expect(calls).toEqual([{ path: '/ProjectVersions', params: {} }])
    expect(rows.map((r) => TeamSchema.parse(r).name)).toEqual(['v1', 'v2'])
  })
})

describe('document360 getTeam reads back from the documented list', () => {
  it('finds a listed workspace by id', async () => {
    total = 3
    const t = await adapter.getTeam(creds, 'u2')
    expect(t.id).toBe('u2')
    expect(calls).toEqual([{ path: '/ProjectVersions', params: {} }])
  })

  it('an unknown id is a 404, not an undocumented GET /v2/ProjectVersions/{id}', async () => {
    total = 1
    await expect(adapter.getTeam(creds, 'nope')).rejects.toMatchObject({ statusCode: 404 })
    expect(calls.map((c) => c.path)).toEqual(['/ProjectVersions'])
  })
})

describe('document360 a documented failure envelope (success: false) is an error, never an empty list', () => {
  it('listUsers throws', async () => {
    failing = true
    await expect(adapter.listUsers(creds, withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(
      /failed/,
    )
  })

  it('listTeams throws', async () => {
    failing = true
    await expect(adapter.listTeams(creds, withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(
      /failed/,
    )
  })

  it('getUser throws', async () => {
    failing = true
    await expect(adapter.getUser(creds, 'x')).rejects.toThrow(/failed/)
  })
})
