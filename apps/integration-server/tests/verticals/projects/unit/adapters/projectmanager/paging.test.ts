/**
 * ProjectManager list paging: every list serves the caller's page `page` at `limit`.
 *
 * ProjectManager's OpenAPI (https://developer.projectmanager.com/openapi.json)
 * gives `GET /api/data/projects`, `/api/data/tasks` and `/api/data/resources`
 * the OData parameters
 *   $top  "The number of records to return"
 *   $skip "Skips the given number of records and then returns $top records"
 * and a response (`…ListAstroResult`) of `success`, `hasError`, `statusCode`,
 * `error` and `data`: no next link, no count, no documented maximum `$top`.
 * So page `page` at `limit` is `$top=limit&$skip=(page-1)*limit`, and a page
 * shorter than `$top` is the end. The adapter read the offset from
 * `params.cursor`, which the router never sets, so page 2 was page 1 again.
 *
 * `GET /api/data/tasks/{taskId}/discussions` "Retrieve all comments written
 * about a task" takes only `taskId`: no paging parameter, so the whole list
 * is sliced locally. `GET /api/data/me` returns the one workspace the API key
 * belongs to.
 *
 * The fake upstream honours ONLY the documented parameters and answers at the
 * seam every request crosses, axios's transport.
 */
import { afterEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  type PageMaxBearing,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { ProjectmanagerAdapter } from '../../../../../../src/verticals/projects/adapters/projectmanager/index'
import { DEFAULT_PAGE_SIZE } from '../../../../../../src/verticals/projects/adapters/projectmanager/constants'

const ORIGIN = 'https://api.projectmanager.com'
const BASE = '/api/data'
const PROJECT_ID = 'proj-1'
const TASK_ID = 'task-1'
const TASK_FILTER = `projectId eq '${PROJECT_ID}'`

const adapter = new ProjectmanagerAdapter()
const CREDS = { accessToken: 'key' }

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const names = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `r${String(i + 1).padStart(4, '0')}`)

const ODATA_PATHS: Record<string, string | undefined> = {
  [`${BASE}/projects`]: undefined,
  [`${BASE}/tasks`]: TASK_FILTER,
  [`${BASE}/resources`]: undefined,
}
const DISCUSSIONS = `${BASE}/tasks/${TASK_ID}/discussions`

function fakePm(n: number): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    const q = url.searchParams
    const all = names(n)
    let data: unknown
    if (url.origin === ORIGIN && url.pathname in ODATA_PATHS) {
      const filter = ODATA_PATHS[url.pathname]
      const allowed = new Set(['$top', '$skip', ...(filter ? ['$filter'] : [])])
      for (const k of q.keys()) if (!allowed.has(k)) throw httpError(400, { error: `unknown ${k}` })
      if (q.get('$filter') !== (filter ?? null))
        throw httpError(400, { error: `bad $filter ${q.get('$filter')}` })
      const skip = Number(q.get('$skip') ?? 0)
      const top = q.has('$top') ? Number(q.get('$top')) : all.length
      data = all.slice(skip, skip + top).map((id) => ({ id, name: id, projectId: PROJECT_ID }))
    } else if (url.origin === ORIGIN && url.pathname === DISCUSSIONS) {
      for (const k of q.keys()) throw httpError(400, { error: `unknown ${k}` })
      data = all.map((id) => ({ id, text: id }))
    } else if (url.origin === ORIGIN && url.pathname === `${BASE}/me`) {
      for (const k of q.keys()) throw httpError(400, { error: `unknown ${k}` })
      data = { workSpaceId: 'ws-1', workSpaceName: 'Acme' }
    } else {
      throw httpError(404, { error: `no route ${url.pathname}` })
    }
    return {
      data: { success: true, hasError: false, statusCode: 'OK', data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type Method = 'listProjects' | 'listTasks' | 'listUsers' | 'listComments'

async function call(method: Method, params: QueryParams): Promise<string[]> {
  switch (method) {
    case 'listProjects':
      return (await adapter.listProjects(CREDS, params)).map((r) => r.id)
    case 'listTasks':
      return (await adapter.listTasks(CREDS, PROJECT_ID, params)).map((r) => r.id)
    case 'listUsers':
      return (await adapter.listUsers(CREDS, 'ws', params)).map((r) => r.id)
    case 'listComments':
      return (await adapter.listComments(CREDS, TASK_ID, params)).map((r) => r.id)
  }
}

async function syncPage(
  method: Method,
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params = withPageSink({ page, limit })
  const got = await call(method, params)
  return { ids: got, hasMore: readUpstreamPage(params)?.hasMore }
}

const ALL: Method[] = ['listProjects', 'listTasks', 'listUsers', 'listComments']

describe.each(ALL)('projectmanager %s serves the caller page', (method) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    fakePm(2 * L + 1)
    const all = names(2 * L + 1)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('serves every row once at the sync worker page size', async () => {
    fakePm(1234)
    const out: string[] = []
    for (let page = 1; page < 20; page++) {
      const { ids, hasMore } = await syncPage(method, page, 500)
      out.push(...ids)
      if (hasMore === false) break
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(names(1234))
  })

  it('pages through the API path', async () => {
    fakePm(450)
    const params = parseListQuery({ limit: '200', page: '2' }, adapter as PageMaxBearing)
    const env = listPage(await call(method, params), params, 'projectmanager')
    expect(env.data).toEqual(names(450).slice(200, 400))
    expect(env.meta.limit).toBe(200)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe.each(['listProjects', 'listTasks', 'listUsers'] as const)(
  'projectmanager %s sends OData $top/$skip',
  (method) => {
    const L = 10

    it('sends page 2 as $top=limit&$skip=limit', async () => {
      fakePm(2 * L + 1)
      await syncPage(method, 2, L)
      expect(seen).toHaveLength(1)
      expect(seen[0]!.searchParams.get('$top')).toBe(String(L))
      expect(seen[0]!.searchParams.get('$skip')).toBe(String(L))
    })

    it('sends page 1 with no $skip', async () => {
      fakePm(3)
      await syncPage(method, 1, L)
      expect(seen[0]!.searchParams.get('$top')).toBe(String(L))
      expect(seen[0]!.searchParams.has('$skip')).toBe(false)
    })

    it('sends a fractional limit as its whole part, and pages by it', async () => {
      fakePm(2 * L + 1)
      await syncPage(method, 2, L + 0.5)
      expect(seen[0]!.searchParams.get('$top')).toBe(String(L))
      expect(seen[0]!.searchParams.get('$skip')).toBe(String(L))
    })

    it('sends the default page size when no limit is given', async () => {
      fakePm(3)
      await call(method, {})
      expect(DEFAULT_PAGE_SIZE).not.toBe(L)
      expect(seen[0]!.searchParams.get('$top')).toBe(String(DEFAULT_PAGE_SIZE))
      expect(seen[0]!.searchParams.has('$skip')).toBe(false)
    })
  },
)

describe('projectmanager listComments fetches the whole discussion once per page', () => {
  it('sends no paging parameter: the endpoint documents none', async () => {
    fakePm(21)
    await syncPage('listComments', 2, 10)
    expect(seen).toHaveLength(1)
    expect([...seen[0]!.searchParams.keys()]).toEqual([])
  })
})

describe('projectmanager listWorkspaces serves its one workspace once', () => {
  it('returns the workspace on page 1 and nothing on page 2', async () => {
    fakePm(0)
    const p1 = withPageSink({ page: 1, limit: 10 })
    expect((await adapter.listWorkspaces(CREDS, p1)).map((w) => w.id)).toEqual(['ws-1'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = withPageSink({ page: 2, limit: 10 })
    expect(await adapter.listWorkspaces(CREDS, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })
})

describe('projectmanager declares no page maximum', () => {
  it('has none to clamp to: ProjectManager documents no maximum $top', () => {
    expect((adapter as PageMaxBearing).capabilities?.maxPageSize).toBeUndefined()
  })
})
