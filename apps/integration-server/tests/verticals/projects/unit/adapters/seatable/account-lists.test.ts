/**
 * SeaTable account-level lists: workspaces and bases (projects).
 *
 * Both endpoints are account operations, authenticated with an Account-Token
 * (https://api.seatable.com/reference/authentication: "Every account
 * operation (user, team admin or system admin) requires an Account-Token.").
 * The connection's API-Token is base-scoped: "An API-Token is like a password
 * to use the API requests of a single base." The adapter sent the API-Token to
 * both, so neither could succeed.
 *
 * GET /api/v2.1/workspaces/ (https://api.seatable.com/reference/listworkspaces)
 *   security AccountTokenAuth; one parameter, `detail` ("When `false`, only
 *   the ID, name and type of each workspace is listed."). No paging.
 * GET /api/v2.1/user-admin-dtables/ (https://api.seatable.com/reference/listbases-1)
 *   security AccountTokenAuth; no parameters; the bases are under
 *   `personal[]` and `groups[].dtables[]`. The adapter read a top-level
 *   `dtables` the response does not have, and sent page/per_page.
 *
 * The fake honours only the documented parameters and answers only to the
 * Account-Token. The response fixtures are the documented examples.
 */
import { afterEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { SeatableAdapter } from '../../../../../../src/verticals/projects/adapters/seatable/index'
import { ProjectSchema } from '../../../../../../src/verticals/projects/schema/project'
import { WorkspaceSchema } from '../../../../../../src/verticals/projects/schema/workspace'

const ORIGIN = 'https://cloud.seatable.io'
const WORKSPACES_PATH = '/api/v2.1/workspaces/'
const BASES_PATH = '/api/v2.1/user-admin-dtables/'

const adapter = new SeatableAdapter()
const ACCOUNT = { accessToken: 'api-token', extra: { serverUrl: '', accountToken: 'acct-token' } }
const API_ONLY = { accessToken: 'api-token', extra: { serverUrl: '' } }

/** Documented example, GET /api/v2.1/workspaces/ "with detail=false". */
const WORKSPACES_DETAIL_FALSE = {
  workspace_list: [
    { id: '', name: 'starred', type: 'starred' },
    { id: '', name: 'shared', type: 'shared' },
    { id: 1, name: 'personal', type: 'personal' },
    { id: 5, name: 'my group', type: 'group' },
  ],
}

/** Trimmed documented example, GET /api/v2.1/workspaces/ "with detail=true". */
const WORKSPACES_DETAIL_TRUE = {
  workspace_list: [
    {
      id: '',
      name: 'starred',
      type: 'starred',
      table_list: [
        {
          id: 378,
          workspace_id: 204,
          uuid: 'c1df3186-3643-489b-880c-51c8ee2a9a20',
          name: 'pt',
          creator: 'Jasmin Tee',
          modifier: 'Jasmin Tee',
          created_at: '2020-11-20T11:57:30+00:00',
          updated_at: '2020-11-20T11:57:30+00:00',
          color: null,
          text_color: null,
          icon: null,
          starred: true,
        },
      ],
    },
    {
      id: 205,
      name: 'testgroup',
      type: 'group',
      group_id: 48,
      table_list: [
        {
          id: 360,
          workspace_id: 205,
          uuid: '12345678-d895-402f-9718-a85f26c65d99',
          name: 'Project Tracker',
          creator: 'Jasmin Tee',
          modifier: 'Jasmin Tee',
          created_at: '2020-11-18T12:45:06+00:00',
          updated_at: '2020-11-18T12:45:06+00:00',
          color: null,
          text_color: null,
          icon: null,
          starred: false,
        },
      ],
      group_shared_dtables: [],
      group_shared_views: [],
    },
    {
      id: 204,
      name: 'personal',
      type: 'personal',
      table_list: [
        {
          id: 424,
          workspace_id: 204,
          uuid: '8d29d6fc-1f00-46af-98df-4007b3635e1c',
          name: '1. Templates Overview',
          creator: 'Jane Doe',
          modifier: 'Jane Doe',
          created_at: '2021-01-08T15:09:03+00:00',
          updated_at: '2021-01-21T16:06:26+00:00',
          color: null,
          text_color: null,
          icon: null,
          starred: false,
        },
        {
          id: 378,
          workspace_id: 204,
          uuid: 'c1df3186-3643-489b-880c-51c8ee2a9a20',
          name: 'pt',
          creator: 'Jasmin Tee',
          modifier: 'Jasmin Tee',
          created_at: '2020-11-20T11:57:30+00:00',
          updated_at: '2020-11-20T11:57:30+00:00',
          color: null,
          text_color: null,
          icon: null,
          starred: true,
        },
      ],
    },
  ],
}

/** Documented example, GET /api/v2.1/user-admin-dtables/. */
const BASES_EXAMPLE = {
  personal: [
    {
      id: 562,
      workspace_id: 204,
      uuid: '12345678-fd55-48e4-8c4a-5fd6f2549765',
      name: 'All types',
      creator: 'Michael Jackson',
      modifier: 'Michael Jackson',
      created_at: '2021-06-21T14:52:11+00:00',
      updated_at: '2021-10-18T08:47:02+00:00',
      color: null,
      text_color: null,
      icon: null,
    },
    {
      id: 686,
      workspace_id: 204,
      uuid: 'abcdefgh-8b35-4f7a-a413-9c780ffe6a48',
      name: 'API Management',
      creator: 'Michael Jackson',
      modifier: 'Michael Jackson',
      created_at: '2021-10-22T08:57:44+00:00',
      updated_at: '2021-10-22T08:57:44+00:00',
      color: null,
      text_color: null,
      icon: null,
    },
  ],
  groups: [
    {
      group_id: 51,
      group_name: 'Teachers',
      dtables: [
        {
          id: 466,
          workspace_id: 209,
          uuid: '87654321-30d9-48a2-a5d7-09cd8ffdda4b',
          name: 'CRM & Sales',
          creator: 'Ginger Ale',
          modifier: 'Ginger Ale',
          created_at: '2021-03-08T13:04:50+00:00',
          updated_at: '2021-03-08T13:04:50+00:00',
          color: null,
          text_color: null,
          icon: null,
        },
      ],
    },
    {
      group_id: 87,
      group_name: 'Students',
      dtables: [
        {
          id: 630,
          workspace_id: 268,
          uuid: 'hhggffdd-4c92-4c40-9f95-eee146721b23',
          name: 'All types',
          creator: 'Michael Jackson',
          modifier: 'Michael Jackson',
          created_at: '2021-08-26T14:10:37+00:00',
          updated_at: '2021-08-26T14:10:37+00:00',
          color: null,
          text_color: null,
          icon: null,
        },
      ],
    },
  ],
}

type Base = (typeof BASES_EXAMPLE.personal)[number]

function base(n: number, workspaceId: number): Base {
  return {
    ...BASES_EXAMPLE.personal[0]!,
    id: n,
    workspace_id: workspaceId,
    uuid: `base-${n}`,
    name: `Base ${n}`,
  }
}

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

interface Upstream {
  workspacesFalse?: unknown
  workspacesTrue?: unknown
  bases?: unknown
}

function fake(up: Upstream): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    const ok = (data: unknown) => ({
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    })
    if (url.origin !== ORIGIN) throw httpError(404, { error: `no host ${url.origin}` })
    const auth = String(config.headers?.Authorization ?? '')
    if (auth !== 'Bearer acct-token') throw httpError(401, { detail: 'Invalid token' })
    const q = url.searchParams
    if (url.pathname === WORKSPACES_PATH) {
      for (const k of q.keys()) if (k !== 'detail') throw httpError(400, { error: `unknown ${k}` })
      const detail = q.get('detail') ?? 'true'
      return ok(detail === 'false' ? up.workspacesFalse : up.workspacesTrue)
    }
    if (url.pathname === BASES_PATH) {
      if ([...q.keys()].length) throw httpError(400, { error: 'no query parameters' })
      return ok(up.bases)
    }
    throw httpError(404, { error: `no route ${url.pathname}` })
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

async function syncPage<T extends { id: string }>(
  list: (c: Credentials, p: QueryParams) => Promise<T[]>,
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params = withPageSink({ page, limit })
  const got = await list(ACCOUNT, params)
  return { ids: got.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore }
}

const workspaces = (c: Credentials, p: QueryParams) => adapter.listWorkspaces(c, p)
const projects = (c: Credentials, p: QueryParams) => adapter.listProjects(c, p)

describe('seatable listWorkspaces', () => {
  it('reads the documented workspace_list with the Account-Token and detail=false', async () => {
    fake({ workspacesFalse: WORKSPACES_DETAIL_FALSE })
    const out = await adapter.listWorkspaces(ACCOUNT, {})
    for (const w of out) WorkspaceSchema.parse(w)
    expect(out.map((w) => [w.id, w.name, w.metadata.type])).toEqual([
      ['1', 'personal', 'personal'],
      ['5', 'my group', 'group'],
    ])
    expect(seen).toHaveLength(1)
    expect(seen[0]!.pathname).toBe(WORKSPACES_PATH)
    expect(seen[0]!.searchParams.get('detail')).toBe('false')
  })

  it('serves 2L+1 workspaces over pages 1, 2, 3, each once, hasMore exact', async () => {
    const L = 3
    const list = Array.from({ length: 2 * L + 1 }, (_, i) => ({
      id: i + 1,
      name: `g${i + 1}`,
      type: 'group',
    }))
    fake({
      workspacesFalse: {
        workspace_list: [...WORKSPACES_DETAIL_FALSE.workspace_list.slice(0, 2), ...list],
      },
    })
    const all = list.map((w) => String(w.id))
    expect(await syncPage(workspaces, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(workspaces, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(workspaces, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('refuses with 501 NOT_SUPPORTED and sends nothing without an Account-Token', async () => {
    fake({ workspacesFalse: WORKSPACES_DETAIL_FALSE })
    await expect(adapter.listWorkspaces(API_ONLY, {})).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    await expect(adapter.getWorkspace(API_ONLY, '1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(seen).toHaveLength(0)
  })

  it('sends a stored Account-Token trimmed, and treats a blank one as absent', async () => {
    fake({ workspacesFalse: WORKSPACES_DETAIL_FALSE })
    const padded = {
      accessToken: 'api-token',
      extra: { serverUrl: '', accountToken: ' acct-token\n' },
    }
    expect(await adapter.listWorkspaces(padded, {})).toHaveLength(2)
    const blank = { accessToken: 'api-token', extra: { serverUrl: '', accountToken: '   ' } }
    await expect(adapter.listWorkspaces(blank, {})).rejects.toMatchObject({ statusCode: 501 })
    expect(seen).toHaveLength(1)
  })

  it('getWorkspace reads one workspace back by the id the list returned', async () => {
    fake({ workspacesFalse: WORKSPACES_DETAIL_FALSE })
    const ws = await adapter.getWorkspace(ACCOUNT, '5')
    expect(WorkspaceSchema.parse(ws).name).toBe('my group')
    await expect(adapter.getWorkspace(ACCOUNT, '')).rejects.toThrow(/not found/)
  })
})

describe('seatable listProjects', () => {
  it('reads bases from personal[] and groups[].dtables[] of the documented response', async () => {
    fake({ bases: BASES_EXAMPLE })
    const out = await adapter.listProjects(ACCOUNT, {})
    for (const p of out) ProjectSchema.parse(p)
    expect(out.map((p) => [p.id, p.workspaceId, p.name])).toEqual([
      ['12345678-fd55-48e4-8c4a-5fd6f2549765', '204', 'All types'],
      ['abcdefgh-8b35-4f7a-a413-9c780ffe6a48', '204', 'API Management'],
      ['87654321-30d9-48a2-a5d7-09cd8ffdda4b', '209', 'CRM & Sales'],
      ['hhggffdd-4c92-4c40-9f95-eee146721b23', '268', 'All types'],
    ])
    expect(seen).toHaveLength(1)
    expect(seen[0]!.pathname).toBe(BASES_PATH)
    expect([...seen[0]!.searchParams.keys()]).toEqual([])
  })

  it('serves 2L+1 bases over pages 1, 2, 3, each once, hasMore exact', async () => {
    const L = 3
    const personal = [base(1, 204), base(2, 204), base(3, 204)]
    const groups = [
      { group_id: 51, group_name: 'A', dtables: [base(4, 209)] },
      { group_id: 52, group_name: 'B', dtables: [] },
      { group_id: 53, group_name: 'C', dtables: [base(5, 210), base(6, 210), base(7, 210)] },
    ]
    fake({ bases: { personal, groups } })
    const all = [1, 2, 3, 4, 5, 6, 7].map((n) => `base-${n}`)
    expect(await syncPage(projects, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(projects, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(projects, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('fails loudly, not with an empty list, when the response lacks the documented personal[]', async () => {
    // The listbases-1 prose names a returned `dtables` array; the example does not have one.
    fake({ bases: { dtables: BASES_EXAMPLE.personal } })
    await expect(adapter.listProjects(ACCOUNT, {})).rejects.toThrow(/no `personal` array/)
  })

  it('pages through the API path', async () => {
    fake({ bases: BASES_EXAMPLE })
    const params = parseListQuery({ limit: '3', page: '2' })
    const env = listPage(await adapter.listProjects(ACCOUNT, params), params, 'seatable')
    expect(env.data.map((p) => p.id)).toEqual(['hhggffdd-4c92-4c40-9f95-eee146721b23'])
    expect(env.meta.hasMore).toBe(false)
  })

  it('filters by workspace_id from the documented table_list of that workspace', async () => {
    fake({ workspacesTrue: WORKSPACES_DETAIL_TRUE })
    const out = await adapter.listProjects(ACCOUNT, { workspace_id: '204' })
    expect(out.map((p) => p.id)).toEqual([
      '8d29d6fc-1f00-46af-98df-4007b3635e1c',
      'c1df3186-3643-489b-880c-51c8ee2a9a20',
    ])
    for (const p of out) expect(p.workspaceId).toBe('204')
    expect(seen[0]!.searchParams.get('detail')).toBe('true')
  })

  it('refuses with 501 NOT_SUPPORTED and sends nothing without an Account-Token', async () => {
    fake({ bases: BASES_EXAMPLE, workspacesTrue: WORKSPACES_DETAIL_TRUE })
    await expect(adapter.listProjects(API_ONLY, {})).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    await expect(adapter.listProjects(API_ONLY, { workspace_id: '204' })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    await expect(
      adapter.getProject(API_ONLY, '8d29d6fc-1f00-46af-98df-4007b3635e1c'),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(seen).toHaveLength(0)
  })

  it('getProject reads a base back by the uuid the list returned', async () => {
    fake({ workspacesTrue: WORKSPACES_DETAIL_TRUE })
    const p = await adapter.getProject(ACCOUNT, '12345678-d895-402f-9718-a85f26c65d99')
    expect(ProjectSchema.parse(p)).toMatchObject({ name: 'Project Tracker', workspaceId: '205' })
    await expect(adapter.getProject(ACCOUNT, '360')).rejects.toThrow(/not found/)
  })
})

describe('seatable credentials', () => {
  it('offers an optional Account-Token field and stores it', async () => {
    const field = adapter.credentialFields().find((f) => f.name === 'accountToken')
    expect(field).toMatchObject({ required: false })
    const creds = await adapter.exchangeCredentials({ apiToken: 'a', accountToken: 'b' })
    expect(creds.extra?.['accountToken']).toBe('b')
    const padded = await adapter.exchangeCredentials({ apiToken: 'a', accountToken: '  b \n' })
    expect(padded.extra?.['accountToken']).toBe('b')
    const without = await adapter.exchangeCredentials({ apiToken: 'a' })
    expect(without.extra?.['accountToken']).toBeUndefined()
  })
})
