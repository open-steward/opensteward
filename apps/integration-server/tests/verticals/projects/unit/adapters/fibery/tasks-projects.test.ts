/**
 * Fibery listProjects / listTasks serve the caller page; getProject / getTask
 * read back the ids those lists return.
 *
 * Every read is a command POSTed to /api/commands. The docs used:
 * - Overview (https://developers.fibery.com/guides/http-api/overview): "The
 *   endpoint works with batches of commands. The request should contain an
 *   array of commands with their names and arguments. You'll get an array back
 *   too."
 * - Get Schema (https://developers.fibery.com/guides/http-api/schema):
 *   `fibery.schema/query` returns every Database with `fibery/name`,
 *   `fibery/id`, `fibery/fields` (`fibery/type` is a string) and `fibery/meta`.
 * - Databases (https://developers.fibery.com/guides/http-api/databases):
 *   meta `fibery/domain?` "Domain Databases are available as cards on Views";
 *   the name Field carries meta `ui/title?`.
 * - Query Entities (https://developers.fibery.com/guides/http-api/query-entities):
 *   "q/from, q/select and q/limit are required."; `q/offset` "How many Entities
 *   to skip — useful for pagination."; `<order-by> = [[<field-path>, "q/asc" |
 *   "q/desc"], ...]` with a field path such as `["fibery/id"]`; "`<field-name>`
 *   won't work for fields that point to other entities"; a collection needs the
 *   subselect form `{"user/assignees": {"q/select": ["fibery/id"], "q/limit": 100}}`.
 *
 * The fake below honours only those clauses and shapes, and answers at the seam
 * every Fibery request crosses, axios's transport.
 */
import { afterEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { FiberyAdapter } from '../../../../../../src/verticals/projects/adapters/fibery/index'
import { TaskSchema } from '../../../../../../src/verticals/projects/schema/task'
import { ProjectSchema } from '../../../../../../src/verticals/projects/schema/project'

const ORIGIN = 'https://acme.fibery.io'
const COMMANDS = '/api/commands'
const WORKSPACE = 'fd5d9550-3779-11e9-9162-04d77e8d50cb'
const QUERY_KEYS = new Set(['q/from', 'q/select', 'q/where', 'q/order-by', 'q/limit', 'q/offset'])
const adapter = new FiberyAdapter()
const CREDS = { accessToken: 'tok', extra: { account: 'acme' } }

type Obj = Record<string, unknown>
const pad = (i: number): string => String(i).padStart(4, '0')

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const SYSTEM_FIELDS: Obj[] = [
  {
    'fibery/name': 'fibery/id',
    'fibery/type': 'fibery/uuid',
    'fibery/meta': { 'fibery/id?': true },
  },
  { 'fibery/name': 'fibery/public-id', 'fibery/type': 'fibery/text', 'fibery/meta': {} },
  { 'fibery/name': 'fibery/creation-date', 'fibery/type': 'fibery/date-time', 'fibery/meta': {} },
  {
    'fibery/name': 'fibery/modification-date',
    'fibery/type': 'fibery/date-time',
    'fibery/meta': {},
  },
  { 'fibery/name': 'fibery/created-by', 'fibery/type': 'fibery/user', 'fibery/meta': {} },
]

/** A domain Database, as the Databases page creates one. */
function domainDb(id: string, name: string, space = 'Cricket'): Obj {
  return {
    'fibery/id': id,
    'fibery/name': `${space}/${name}`,
    'fibery/meta': { 'fibery/domain?': true, 'fibery/secured?': true, 'ui/color': '#F7D130' },
    'fibery/fields': [
      ...SYSTEM_FIELDS,
      {
        'fibery/name': `${space}/Name`,
        'fibery/type': 'fibery/text',
        'fibery/meta': { 'ui/title?': true },
      },
      { 'fibery/name': `${space}/Height`, 'fibery/type': 'fibery/decimal', 'fibery/meta': {} },
      { 'fibery/name': `${space}/Current Team`, 'fibery/type': 'Cricket/Team', 'fibery/meta': {} },
      {
        'fibery/name': 'assignments/assignees',
        'fibery/type': 'fibery/user',
        'fibery/meta': { 'fibery/collection?': true },
      },
    ],
  }
}

/**
 * Auxiliary / enum Databases carry no `fibery/domain?` (default false). Their
 * name Field is optional (Databases: "For auxiliary Databases ... `${space}/name`
 * Field and `rank` Mixin are optional"), so `titled` gives one the `enum/name`
 * Field the Query Entities examples select from an enum.
 */
function auxDb(id: string, name: string, titled = false): Obj {
  const title = { 'fibery/name': 'enum/name', 'fibery/type': 'fibery/text' }
  return {
    'fibery/id': id,
    'fibery/name': name,
    'fibery/meta': { 'fibery/secured?': false },
    'fibery/fields': titled
      ? [...SYSTEM_FIELDS, { ...title, 'fibery/meta': { 'ui/title?': true } }]
      : SYSTEM_FIELDS,
  }
}

/** A domain Database without a title Field, which Databases says should not exist. */
function untitledDomainDb(id: string, name: string): Obj {
  return {
    'fibery/id': id,
    'fibery/name': name,
    'fibery/meta': { 'fibery/domain?': true },
    'fibery/fields': SYSTEM_FIELDS,
  }
}

const PLAYER = 'db-player'
const EMPTY_TEAM = 'db-team'
const ENUM = 'aux-enum'
const SECRET = 'db-secret'
const UNTITLED = 'db-untitled'

/** The Response envelope's documented failed-command example. */
const FAILED = {
  success: false,
  result: {
    name: 'entity.error/schema-type-not-found',
    message: '"Cricket/Nope" database was not found.',
  },
}

interface World {
  /** Number of domain Databases beyond the Player and Team ones. */
  extraDomains?: number
  players?: number
  /** A domain Database ahead of Player whose every entity query fails. */
  failingFirst?: boolean
  /** A domain Database with no title Field. */
  untitledDomain?: boolean
}

let world: World = {}
let seen: Obj[] = []
let posts = 0
const realAdapter = axios.defaults.adapter

function types(): Obj[] {
  const out: Obj[] = [
    auxDb('aux-user', 'fibery/user'),
    ...(world.failingFirst ? [domainDb(SECRET, 'Secret')] : []),
    domainDb(PLAYER, 'Player'),
    auxDb(ENUM, 'Cricket/Batting Hand_Cricket/Player', true),
    domainDb(EMPTY_TEAM, 'Team'),
    ...(world.untitledDomain ? [untitledDomainDb(UNTITLED, 'Cricket/Untitled')] : []),
  ]
  for (let i = 0; i < (world.extraDomains ?? 0); i++) {
    out.push(domainDb(`db-${pad(i)}`, `Db ${pad(i)}`, 'Other'))
    if (i % 3 === 0) out.push(auxDb(`aux-${pad(i)}`, `Other/Aux ${pad(i)}_Other/Db`))
  }
  return out
}

const playerIds = (n: number): string[] => Array.from({ length: n }, (_, i) => `p-${pad(i + 1)}`)

function entitiesOf(from: string): Obj[] {
  if (from === 'Cricket/Player')
    return playerIds(world.players ?? 0).map((id, i) => ({
      'fibery/id': id,
      'fibery/public-id': String(i + 1),
      'fibery/creation-date': '2019-06-27T10:44:53.860Z',
      'fibery/modification-date': '2019-06-28T10:44:53.860Z',
      'fibery/created-by': { 'fibery/id': 'fe1db100-3779-11e9-9162-04d77e8d50cb' },
      'Cricket/Name': `Player ${id}`,
      'Cricket/Height': '2.01',
      'Cricket/Current Team': { 'fibery/id': 't-1' },
      'assignments/assignees': i % 2 === 0 ? [{ 'fibery/id': 'u-1' }] : null,
    }))
  const db = types().find((t) => t['fibery/name'] === from)
  if (!db) throw httpError(400, { message: `no database ${from}` })
  return []
}

function checkSelect(from: string, select: unknown): void {
  const db = types().find((t) => t['fibery/name'] === from)
  const fields = (db?.['fibery/fields'] ?? []) as Obj[]
  const field = (name: string) => fields.find((f) => f['fibery/name'] === name)
  const primitive = (f: Obj) =>
    String(f['fibery/type']).startsWith('fibery/') && f['fibery/type'] !== 'fibery/user'
  if (!Array.isArray(select)) throw httpError(400, { message: 'q/select must be an array' })
  for (const s of select) {
    if (typeof s === 'string') {
      const f = field(s)
      if (!f || !primitive(f)) throw httpError(400, { message: `cannot select ${s} as a value` })
      continue
    }
    for (const [name, sub] of Object.entries(s as Obj)) {
      const f = field(name)
      if (!f || primitive(f)) throw httpError(400, { message: `cannot dereference ${name}` })
      const collection = (f['fibery/meta'] as Obj)['fibery/collection?'] === true
      if (collection && (Array.isArray(sub) || typeof (sub as Obj)['q/limit'] !== 'number'))
        throw httpError(400, { message: `${name} is a collection: use a subselect with q/limit` })
    }
  }
}

function runQuery(args: Obj): Obj[] {
  const query = args['query'] as Obj
  const params = (args['params'] ?? {}) as Obj
  seen.push(query)
  for (const k of Object.keys(query))
    if (!QUERY_KEYS.has(k)) throw httpError(400, { message: `unknown clause ${k}` })
  const from = query['q/from'] as string
  if (typeof from !== 'string') throw httpError(400, { message: 'q/from is required' })
  const limit = query['q/limit']
  if (typeof limit !== 'number') throw httpError(400, { message: 'q/limit is required' })
  checkSelect(from, query['q/select'])
  const order = query['q/order-by']
  if (order !== undefined && JSON.stringify(order) !== JSON.stringify([[['fibery/id'], 'q/asc']]))
    throw httpError(400, { message: `unsupported order ${JSON.stringify(order)}` })
  let rows = entitiesOf(from)
  const where = query['q/where'] as unknown[] | undefined
  if (where !== undefined) {
    if (where[0] !== '=' || JSON.stringify(where[1]) !== JSON.stringify(['fibery/id']))
      throw httpError(400, { message: `unsupported where ${JSON.stringify(where)}` })
    rows = rows.filter((r) => r['fibery/id'] === params[where[2] as string])
  }
  rows.sort((a, b) => String(a['fibery/id']).localeCompare(String(b['fibery/id'])))
  const offset = (query['q/offset'] as number | undefined) ?? 0
  return rows.slice(offset, offset + limit)
}

function fakeFibery(w: World): void {
  world = w
  seen = []
  posts = 0
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    if (url.origin !== ORIGIN || url.pathname !== COMMANDS || config.method !== 'post')
      throw httpError(404, { message: `no route ${config.method} ${url.href}` })
    if (config.headers['Authorization'] !== 'Token tok') throw httpError(401, { message: 'auth' })
    posts++
    const cmds = JSON.parse(config.data as string) as Array<{ command: string; args?: Obj }>
    if (!Array.isArray(cmds)) throw httpError(400, { message: 'body must be a command array' })
    const data = cmds.map(({ command, args }) => {
      if (command === 'fibery.schema/query')
        return {
          success: true,
          result: { 'fibery/id': WORKSPACE, 'fibery/types': types(), 'fibery/meta': {} },
        }
      if (command === 'fibery.entity/query') {
        const result = runQuery(args ?? {})
        if ((args?.['query'] as Obj)['q/from'] === 'Cricket/Secret') return FAILED
        return { success: true, result }
      }
      throw httpError(400, { message: command })
    })
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

async function taskPage(page: number, limit: number) {
  const params: QueryParams = withPageSink({ page, limit })
  const got = await adapter.listTasks(CREDS, PLAYER, params)
  return { ids: got.map((t) => t.id), hasMore: readUpstreamPage(params)?.hasMore }
}

async function projectPage(page: number, limit: number) {
  const params: QueryParams = withPageSink({ page, limit })
  const got = await adapter.listProjects(CREDS, params)
  return { ids: got.map((p) => p.id), hasMore: readUpstreamPage(params)?.hasMore }
}

describe('fibery listTasks serves the caller page', () => {
  const L = 10

  it('serves 2L+1 entities over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    fakeFibery({ players: 2 * L + 1 })
    const all = playerIds(2 * L + 1)
    expect(await taskPage(1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await taskPage(2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await taskPage(3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the entities end exactly on a page', async () => {
    fakeFibery({ players: 2 * L })
    expect(await taskPage(2, L)).toEqual({ ids: playerIds(2 * L).slice(L), hasMore: false })
  })

  it('sends the documented q/offset, the caller limit and the documented order-by form', async () => {
    fakeFibery({ players: 2 * L + 1 })
    await taskPage(2, L)
    // schema, page, look-ahead
    expect(posts).toBe(3)
    expect(seen).toHaveLength(2)
    expect(seen[0]).toMatchObject({ 'q/from': 'Cricket/Player', 'q/offset': L, 'q/limit': L })
    expect(seen[0]!['q/order-by']).toEqual([[['fibery/id'], 'q/asc']])
    expect(seen[1]).toMatchObject({ 'q/offset': 2 * L, 'q/limit': 1 })
    expect(seen[1]!['q/order-by']).toEqual([[['fibery/id'], 'q/asc']])
  })

  it('selects only documented fields, entity fields by dereference and the collection by subselect', async () => {
    fakeFibery({ players: 1 })
    await taskPage(1, L)
    expect(seen[0]!['q/select']).toEqual([
      'fibery/id',
      'fibery/public-id',
      'fibery/creation-date',
      'fibery/modification-date',
      { 'fibery/created-by': ['fibery/id'] },
      'Cricket/Name',
      { 'assignments/assignees': { 'q/select': ['fibery/id'], 'q/limit': 100 } },
    ])
  })

  it('serves every entity once at the sync worker page size', async () => {
    fakeFibery({ players: 1100 })
    const out: string[] = []
    for (let page = 1; page < 50; page++) {
      const { ids, hasMore } = await taskPage(page, 500)
      out.push(...ids)
      if (hasMore === false) break
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(playerIds(1100))
  })

  it('maps each entity through TaskSchema, title from the ui/title? Field', async () => {
    fakeFibery({ players: 2 })
    const tasks = await adapter.listTasks(CREDS, PLAYER, withPageSink({ page: 1, limit: 5 }))
    for (const t of tasks) TaskSchema.parse(t)
    expect(tasks.map((t) => [t.title, t.projectId, t.assigneeIds])).toEqual([
      ['Player p-0001', PLAYER, ['u-1']],
      ['Player p-0002', PLAYER, []],
    ])
  })

  it('an empty database is one empty last page', async () => {
    fakeFibery({ players: 0 })
    const params = withPageSink({ page: 1, limit: L })
    expect(await adapter.listTasks(CREDS, EMPTY_TEAM, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('refuses a database with no title Field before querying entities', async () => {
    fakeFibery({ untitledDomain: true })
    await expect(
      adapter.listTasks(CREDS, UNTITLED, withPageSink({ page: 1, limit: L })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(seen).toHaveLength(0)
  })

  it('does not list an auxiliary Database, which listProjects never returns', async () => {
    fakeFibery({})
    await expect(
      adapter.listTasks(CREDS, ENUM, withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/aux-enum not found/)
    expect(seen).toHaveLength(0)
  })

  it('throws for a database that is not in the schema', async () => {
    fakeFibery({})
    await expect(adapter.listTasks(CREDS, 'nope', { page: 1, limit: L })).rejects.toThrow(/nope/)
    expect(seen).toHaveLength(0)
  })
})

describe('fibery getTask reads back the ids listTasks returns', () => {
  it('finds a bare entity id with one batched query per domain Database', async () => {
    fakeFibery({ players: 3 })
    const [listed] = await adapter.listTasks(CREDS, PLAYER, { page: 1, limit: 1 })
    seen = []
    posts = 0
    const task = await adapter.getTask(CREDS, listed!.id)
    expect(TaskSchema.parse(task)).toEqual(TaskSchema.parse(listed))
    // one schema read, one batch of both domain Databases
    expect(posts).toBe(2)
    expect(seen.map((q) => q['q/from'])).toEqual(['Cricket/Player', 'Cricket/Team'])
    expect(seen[0]!['q/where']).toEqual(['=', ['fibery/id'], '$id'])
  })

  it('still accepts the databaseId:entityId form', async () => {
    fakeFibery({ players: 3 })
    const task = await adapter.getTask(CREDS, `${PLAYER}:p-0002`)
    expect(task).toMatchObject({ id: 'p-0002', projectId: PLAYER, title: 'Player p-0002' })
  })

  it('throws when no domain Database holds the id', async () => {
    fakeFibery({ players: 3 })
    await expect(adapter.getTask(CREDS, 'p-9999')).rejects.toThrow(/p-9999 not found/)
  })

  it('queries no auxiliary Database, even one with a title Field', async () => {
    fakeFibery({ players: 3 })
    await expect(adapter.getTask(CREDS, `${ENUM}:p-0001`)).rejects.toThrow(/aux-enum not found/)
    expect(seen).toHaveLength(0)
  })

  it('finds the entity when another Database in the batch fails', async () => {
    fakeFibery({ players: 3, failingFirst: true })
    const task = await adapter.getTask(CREDS, 'p-0002')
    expect(task).toMatchObject({ id: 'p-0002', projectId: PLAYER })
    expect(seen.map((q) => q['q/from'])).toEqual([
      'Cricket/Secret',
      'Cricket/Player',
      'Cricket/Team',
    ])
  })

  it('reports the failed command, not "not found", when no Database returned the entity', async () => {
    fakeFibery({ players: 3, failingFirst: true })
    await expect(adapter.getTask(CREDS, 'p-9999')).rejects.toThrow(
      'Fibery command fibery.entity/query failed: "Cricket/Nope" database was not found.',
    )
  })
})

describe('fibery listProjects serves the caller page of domain Databases', () => {
  const L = 5
  // Player + Team + extras = 2L + 1 domain Databases
  const W = { extraDomains: 2 * L - 1 }
  const domainIds = (): string[] => [
    PLAYER,
    EMPTY_TEAM,
    ...Array.from({ length: 2 * L - 1 }, (_, i) => `db-${pad(i)}`),
  ]

  it('serves 2L+1 domain Databases over pages 1, 2, 3, each once, hasMore exact', async () => {
    fakeFibery(W)
    const all = domainIds()
    expect(await projectPage(1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await projectPage(2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await projectPage(3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('leaves out auxiliary and enum Databases (fibery/domain? absent or false)', async () => {
    fakeFibery(W)
    const got = await adapter.listProjects(CREDS, { page: 1, limit: 100 })
    expect(got.map((p) => p.id)).toEqual(domainIds())
    for (const p of got) ProjectSchema.parse(p)
    expect(got[0]).toMatchObject({ workspaceId: WORKSPACE, name: 'Player' })
  })

  it('reads the schema once per page and queries no entities', async () => {
    fakeFibery(W)
    await projectPage(2, L)
    expect(posts).toBe(1)
    expect(seen).toHaveLength(0)
  })
})

describe('fibery getProject reads back the ids listProjects returns', () => {
  it('returns the same Project', async () => {
    fakeFibery({})
    const [listed] = await adapter.listProjects(CREDS, { page: 1, limit: 1 })
    expect(await adapter.getProject(CREDS, listed!.id)).toEqual(listed)
  })

  it('does not return an auxiliary Database, which listProjects leaves out', async () => {
    fakeFibery({})
    await expect(adapter.getProject(CREDS, ENUM)).rejects.toThrow(/aux-enum not found/)
  })
})
