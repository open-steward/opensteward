/**
 * Twproject requests and paging against a fake server that honours only what
 * https://twproject.com/support/api-documentation/ documents:
 *
 * - every call is a JSON POST to https://[your_server_url]/API/V1/ carrying the
 *   common parameters `command`, `object` and `APIKey`;
 * - `get` takes `id` (integer, required) and `full` (boolean) and returns `object`;
 * - `list` takes `filters`, `pageSize` (sample 20), `page` (sample 1) and
 *   `orderBy`, and returns `objects` and `hasMore`;
 * - task filters include `isProject` ("\"true\" for project, \"false\" for
 *   task/subtask") and `subtaskOfAncestorId` (integer); person filters include
 *   no parent or workspace key.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
} from '@opensteward/shared'
import { TwprojectAdapter } from '../../../../../../src/verticals/projects/adapters/twproject/index'
import { TASK_LIST, PERSON_LIST } from './fixtures/documented-samples'

const SERVER = 'https://tw.example.test'
const CREDS: Credentials = { accessToken: 'tw-key', extra: { serverUrl: `${SERVER}/` } }
const L = 3
const N = 2 * L + 1

const LIST_KEYS = new Set(['command', 'object', 'filters', 'pageSize', 'page', 'orderBy', 'APIKey'])
const GET_KEYS = new Set(['command', 'object', 'id', 'full', 'APIKey'])
const FILTER_KEYS: Record<string, Set<string>> = {
  task: new Set(['isProject', 'subtaskOfAncestorId']),
  person: new Set(),
}

type Row = Record<string, unknown>
const taskRow = (id: string): Row => ({ ...TASK_LIST.objects[0], id, name: `task ${id}` })
const personRow = (id: string): Row => ({ ...PERSON_LIST.objects[0], id, displayName: `P ${id}` })

interface World {
  projects: Row[]
  tasksByAncestor: Record<number, Row[]>
  persons: Row[]
}

function ids(prefix: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(prefix + i + 1))
}

function fakeServer(world: World) {
  const post = vi.fn(async (url: string, body: Record<string, unknown>) => {
    if (url !== '') throw new Error(`unexpected path ${url}`)
    if (body['APIKey'] !== 'tw-key') throw new Error('missing APIKey')
    const object = String(body['object'])
    if (body['command'] === 'list') {
      for (const k of Object.keys(body))
        if (!LIST_KEYS.has(k)) throw new Error(`undocumented list param ${k}`)
      const filters = (body['filters'] ?? {}) as Record<string, unknown>
      for (const k of Object.keys(filters)) {
        if (!FILTER_KEYS[object]?.has(k)) throw new Error(`undocumented ${object} filter ${k}`)
      }
      let rows: Row[]
      if (object === 'person') rows = world.persons
      else if (filters['isProject'] === true) rows = world.projects
      else if (typeof filters['subtaskOfAncestorId'] === 'number')
        rows = world.tasksByAncestor[filters['subtaskOfAncestorId']] ?? []
      else
        return {
          data: { ok: false, errors: [{ name: 'subtaskOfAncestorId', error: 'Invalid value' }] },
        }
      // Documented defaults are not stated: the fake requires both.
      const page = body['page']
      const size = body['pageSize']
      if (typeof page !== 'number' || typeof size !== 'number')
        throw new Error('page/pageSize required')
      const slice = rows.slice((page - 1) * size, page * size)
      return { data: { ok: true, objects: slice, hasMore: page * size < rows.length } }
    }
    if (body['command'] === 'get') {
      for (const k of Object.keys(body))
        if (!GET_KEYS.has(k)) throw new Error(`undocumented get param ${k}`)
      if (typeof body['id'] !== 'number') throw new Error('id must be an integer')
      const pool =
        object === 'person'
          ? world.persons
          : [...world.projects, ...Object.values(world.tasksByAncestor).flat()]
      const found = pool.find((r) => r['id'] === String(body['id']))
      if (!found)
        return {
          data: { ok: false, messagesFromController: [{ type: 'ERROR', message: 'Invalid id' }] },
        }
      return { data: { ok: true, object: found } }
    }
    throw new Error(`unexpected command ${String(body['command'])}`)
  })
  const create = vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
  return { post, create }
}

function defaultWorld(): World {
  return {
    projects: ids(100, N).map(taskRow),
    tasksByAncestor: { 101: ids(200, N).map(taskRow) },
    persons: ids(300, N).map(personRow),
  }
}

afterEach(() => vi.restoreAllMocks())

const adapter = () => new TwprojectAdapter()

describe('twproject request shape', () => {
  it('posts to <serverUrl>/API/V1/ with the API key in the body', async () => {
    const { post, create } = fakeServer(defaultWorld())
    await adapter().listProjects(CREDS, withPageSink({ page: 1, limit: L }))
    expect(create.mock.calls[0]![0]).toMatchObject({ baseURL: `${SERVER}/API/V1/` })
    expect(post.mock.calls[0]![1]).toEqual({
      command: 'list',
      object: 'task',
      filters: { isProject: true },
      pageSize: L,
      page: 1,
      APIKey: 'tw-key',
    })
  })

  it('listTasks filters by subtaskOfAncestorId as an integer', async () => {
    const { post } = fakeServer(defaultWorld())
    const tasks = await adapter().listTasks(CREDS, '101', withPageSink({ page: 2, limit: L }))
    expect(post.mock.calls[0]![1]).toEqual({
      command: 'list',
      object: 'task',
      filters: { subtaskOfAncestorId: 101 },
      pageSize: L,
      page: 2,
      APIKey: 'tw-key',
    })
    expect(tasks.map((t) => t.projectId)).toEqual(['101', '101', '101'])
  })

  it('listUsers sends no filter (Twproject has no workspace)', async () => {
    const { post } = fakeServer(defaultWorld())
    await adapter().listUsers(CREDS, 'ignored', withPageSink({ page: 1, limit: L }))
    expect(post.mock.calls[0]![1]).toEqual({
      command: 'list',
      object: 'person',
      pageSize: L,
      page: 1,
      APIKey: 'tw-key',
    })
  })

  it('sends the caller limit as pageSize unchanged at the router maximum', async () => {
    const { post } = fakeServer(defaultWorld())
    const params = withPageSink({ page: 1, limit: 500 })
    expect((await adapter().listUsers(CREDS, 'w', params)).length).toBe(N)
    expect((post.mock.calls[0]![1] as Record<string, unknown>)['pageSize']).toBe(500)
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
  })

  it('getProject and getUser use the documented get command with an integer id', async () => {
    const { post } = fakeServer(defaultWorld())
    expect((await adapter().getProject(CREDS, '107')).id).toBe('107')
    expect((await adapter().getUser(CREDS, '307')).name).toBe('P 307')
    expect(post.mock.calls.map((c) => c[1])).toEqual([
      { command: 'get', object: 'task', id: 107, full: true, APIKey: 'tw-key' },
      { command: 'get', object: 'person', id: 307, full: true, APIKey: 'tw-key' },
    ])
  })

  it('a non-integer get id is a 404 without a request', async () => {
    const { post } = fakeServer(defaultWorld())
    await expect(adapter().getProject(CREDS, 'abc')).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter().getUser(CREDS, 'abc')).rejects.toMatchObject({ statusCode: 404 })
    expect(post).not.toHaveBeenCalled()
  })

  it('a non-integer project id reaches the server as given and its refusal surfaces', async () => {
    const { post } = fakeServer(defaultWorld())
    await expect(adapter().listTasks(CREDS, 'abc', { page: 1, limit: L })).rejects.toThrow(
      /subtaskOfAncestorId: Invalid value/,
    )
    expect((post.mock.calls[0]![1] as { filters: unknown }).filters).toEqual({
      subtaskOfAncestorId: 'abc',
    })
  })

  it('ok: false is an error carrying messagesFromController', async () => {
    fakeServer(defaultWorld())
    await expect(adapter().getUser(CREDS, '999')).rejects.toThrow(/ERROR: Invalid id/)
  })

  it('ok: true without an object is a 404', async () => {
    const post = vi.fn(async () => ({ data: { ok: true } }))
    vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
    await expect(adapter().getProject(CREDS, '107')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
    await expect(adapter().getUser(CREDS, '307')).rejects.toMatchObject({ statusCode: 404 })
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('a connection without a server URL fails before any request', async () => {
    const { post } = fakeServer(defaultWorld())
    await expect(
      adapter().listProjects({ accessToken: 'tw-key' }, { page: 1, limit: L }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MISSING_SERVER_URL' })
    expect(post).not.toHaveBeenCalled()
  })
})

describe('twproject paging (page/pageSize, hasMore)', () => {
  const walks = [
    [
      'listProjects',
      (p: ReturnType<typeof withPageSink>) => adapter().listProjects(CREDS, p),
      ids(100, N),
    ],
    [
      'listTasks',
      (p: ReturnType<typeof withPageSink>) => adapter().listTasks(CREDS, '101', p),
      ids(200, N),
    ],
    [
      'listUsers',
      (p: ReturnType<typeof withPageSink>) => adapter().listUsers(CREDS, 'w', p),
      ids(300, N),
    ],
  ] as const

  it.each(walks)(
    '%s walks pages 1..3 at limit L, every id once, exact hasMore',
    async (_n, call, expected) => {
      fakeServer(defaultWorld())
      const seen: string[] = []
      for (let k = 1; k <= 3; k++) {
        const params = withPageSink({ page: k, limit: L })
        const got = (await call(params)).map((r) => r.id)
        expect(got.length).toBe(k < 3 ? L : 1)
        seen.push(...got)
        expect(readUpstreamPage(params)).toEqual({ hasMore: k < 3 })
      }
      expect(seen).toEqual(expected)
    },
  )

  it('API path: parseListQuery + listPage report the platform hasMore', async () => {
    fakeServer(defaultWorld())
    const p2 = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const env2 = listPage(await adapter().listProjects(CREDS, p2), p2, 'twproject')
    expect(env2.data.map((p) => p.id)).toEqual(['104', '105', '106'])
    expect(env2.meta).toMatchObject({ page: 2, hasMore: true })
    const p3 = withPageSink(parseListQuery({ page: '3', limit: String(L) }))
    const env3 = listPage(await adapter().listProjects(CREDS, p3), p3, 'twproject')
    expect(env3.data.map((p) => p.id)).toEqual(['107'])
    expect(env3.meta).toMatchObject({ page: 3, hasMore: false })
  })

  it('an exact multiple of the page size ends on hasMore, not a guess', async () => {
    fakeServer({ ...defaultWorld(), persons: ids(300, 2 * L).map(personRow) })
    const params = withPageSink({ page: 2, limit: L })
    expect((await adapter().listUsers(CREDS, 'w', params)).length).toBe(L)
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
  })
})

describe('twproject refusals (501 NOT_SUPPORTED, no request)', () => {
  const refusals = [
    [
      'listComments',
      () => adapter().listComments(CREDS, '101', { page: 1, limit: L }),
      /cannot list comments/,
    ],
    ['getComment', () => adapter().getComment(CREDS, '5'), /cannot read comments/],
    [
      'listWorkspaces',
      () => adapter().listWorkspaces(CREDS, { page: 1, limit: L }),
      /cannot list workspaces/,
    ],
    ['getWorkspace', () => adapter().getWorkspace(CREDS, '1'), /cannot read workspaces/],
    [
      'getTask',
      () => adapter().getTask(CREDS, '201'),
      /no documented task response field carries a parent or project/,
    ],
  ] as const

  it.each(refusals)('%s refuses before sending anything', async (_n, call, message) => {
    const { post, create } = fakeServer(defaultWorld())
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    await expect(call()).rejects.toThrow(message)
    expect(post).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('twproject Connect Link form', () => {
  it('asks for the server URL and the API key', () => {
    expect(
      adapter()
        .credentialFields()
        .map((f) => [f.name, f.required]),
    ).toEqual([
      ['serverUrl', true],
      ['apiKey', true],
    ])
  })

  it('stores the key as accessToken and the trimmed server URL in extra', async () => {
    await expect(
      adapter().exchangeCredentials({ serverUrl: ` ${SERVER}/ `, apiKey: ' k-1 ' }),
    ).resolves.toEqual({ accessToken: 'k-1', extra: { serverUrl: SERVER } })
  })

  it('rejects a missing server URL or key', async () => {
    await expect(adapter().exchangeCredentials({ apiKey: 'k' })).rejects.toThrow(/server URL/)
    await expect(adapter().exchangeCredentials({ serverUrl: SERVER })).rejects.toThrow(/API key/)
  })
})
