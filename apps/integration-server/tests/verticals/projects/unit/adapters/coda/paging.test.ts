/**
 * Coda list paging.
 *
 * Coda pages every list with an opaque `pageToken`, and answers with a
 * `nextPageToken` while more rows exist. Its API reference
 * (https://coda.io/developers/apis/v1, "List Endpoints"):
 *
 *   "If you pass a `limit` parameter that is larger than our maximum allowed
 *   limit, we will only return as many results as our maximum limit. You
 *   should look for the presence of the `nextPageToken` on the response to
 *   see if there are more results available, rather than relying on a result
 *   set that matches your provided limit."
 *
 *   "you don't need to pass any of the parameters from your original request,
 *   as they are all implied by the `pageToken`. Any other parameters provided
 *   alongside a `pageToken` will be ignored."
 *
 * So one upstream page is not reliably one caller page, and
 * `/workspaces/{workspaceId}/users` takes no `limit` at all. Every list cuts
 * the caller's rows out of the token chain. Before this, every list ignored
 * `page` and answered page 2 with page 1.
 *
 * The fake honours only the documented parameters: `limit` (capped at the
 * fake's own maximum, as the reference describes) where the endpoint takes
 * one, `pageToken`, and nothing else on a request that carries a token.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { CodaAdapter } from '../../../../../../src/verticals/projects/adapters/coda/index'

const CREDS = { accessToken: 'coda-token' }

interface Call {
  path: string
  params: Record<string, unknown>
  /** The Authorization header of the client that made the request. */
  auth?: string
}

interface FakeOptions {
  /** Rows per collection path. */
  rows: Record<string, Array<Record<string, unknown>>>
  /** The server's maximum page size for endpoints that take `limit`. */
  maxLimit?: number
  /** Paths that take no `limit` and serve a fixed page size. */
  fixedPage?: Record<string, number>
  whoami?: Record<string, unknown>
}

/**
 * A fake Coda. The page token encodes the offset and the page size of the
 * request that started the chain, so a token alone positions the next page.
 */
function fakeCoda(opts: FakeOptions, byAuth: Record<string, FakeOptions> = {}) {
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockImplementation(((config?: { headers?: Record<string, string> }) => {
    const auth = config?.headers?.['Authorization']
    return { get: fakeGet(auth !== undefined ? (byAuth[auth] ?? opts) : opts, calls, auth) }
  }) as never)
  return calls
}

function fakeGet(opts: FakeOptions, calls: Call[], auth: string | undefined) {
  return vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params: { ...params }, auth })
    if (path === '/whoami') return { data: opts.whoami ?? { loginId: 'me@example.com' } }
    const all = opts.rows[path]
    if (!all) throw new Error(`fake coda: no route for ${path}`)
    let offset = 0
    let size: number
    let workspaceId = typeof params['workspaceId'] === 'string' ? params['workspaceId'] : undefined
    const token = params['pageToken']
    if (typeof token === 'string') {
      // Everything else is implied by the token; other params are ignored.
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8')) as {
        o: number
        s: number
        w?: string
        a?: string
      }
      // A token is minted for one account; another account cannot redeem it.
      if (decoded.a !== undefined && decoded.a !== auth) {
        throw new Error(`fake coda: pageToken minted for another connection`)
      }
      offset = decoded.o
      size = decoded.s
      workspaceId = decoded.w
    } else if (opts.fixedPage?.[path] != null) {
      size = opts.fixedPage[path]!
    } else {
      const asked = params['limit'] == null ? 25 : Number(params['limit'])
      size = Math.min(asked, opts.maxLimit ?? 100)
    }
    let items = all
    if (workspaceId !== undefined) {
      items = all.filter((r) => (r['workspace'] as { id?: string } | undefined)?.id === workspaceId)
    }
    const slice = items.slice(offset, offset + size)
    const end = offset + slice.length
    const nextPageToken =
      end < items.length
        ? Buffer.from(JSON.stringify({ o: end, s: size, w: workspaceId, a: auth })).toString(
            'base64',
          )
        : undefined
    return { data: { items: slice, ...(nextPageToken ? { nextPageToken } : {}) } }
  })
}

const doc = (i: number, ws = 'ws-1') => ({
  id: `doc-${i}`,
  type: 'doc',
  name: `Doc ${i}`,
  workspace: { id: ws, type: 'workspace', name: `Workspace ${ws}` },
})
const table = (i: number) => ({
  id: `grid-${i}`,
  type: 'table',
  name: `Table ${i}`,
  tableType: 'table',
})
const member = (i: number) => ({ email: `user${i}@example.com`, name: `User ${i}`, role: 'Editor' })

const adapter = () => new CodaAdapter()

/** Pages 1..3 at `limit`, returning ids and the hasMore each page reported. */
async function walk(
  limit: number,
  run: (params: QueryParams) => Promise<Array<{ id: string }>>,
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined>; sizes: number[] }> {
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    sizes.push(rows.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, sizes }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('Coda listProjects (GET /docs) pages by pageToken', () => {
  const L = 4
  const N = 2 * L + 1

  it('serves every doc once, in order, with hasMore exact', async () => {
    fakeCoda({ rows: { '/docs': Array.from({ length: N }, (_, i) => doc(i)) } })
    const res = await walk(L, (p) => adapter().listProjects(CREDS, p))
    expect(res.ids).toEqual(Array.from({ length: N }, (_, i) => `doc-${i}`))
    expect(res.sizes).toEqual([L, L, 1])
    expect(res.hasMore).toEqual([true, true, false])
  })

  it('the page-2 request carries the pageToken from page 1', async () => {
    const calls = fakeCoda({ rows: { '/docs': Array.from({ length: N }, (_, i) => doc(i)) } })
    const rows = await adapter().listProjects(CREDS, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['doc-4', 'doc-5', 'doc-6', 'doc-7'])
    expect(calls[0]!.params).toEqual({ limit: L })
    // A continuation sends only the token: everything else is implied by it.
    expect(Object.keys(calls[1]!.params)).toEqual(['pageToken'])
    expect(typeof calls[1]!.params['pageToken']).toBe('string')
  })

  it('a limit above the server maximum still fills the page from the next token', async () => {
    // The reference: a larger `limit` returns only the maximum, with a
    // nextPageToken. The caller's 8 rows come from two upstream pages of 5.
    fakeCoda({ rows: { '/docs': Array.from({ length: 17 }, (_, i) => doc(i)) }, maxLimit: 5 })
    const res = await walk(8, (p) => adapter().listProjects(CREDS, p))
    expect(res.ids).toEqual(Array.from({ length: 17 }, (_, i) => `doc-${i}`))
    expect(res.sizes).toEqual([8, 8, 1])
    expect(res.hasMore).toEqual([true, true, false])
  })

  it('keeps the workspace filter on the first request', async () => {
    const calls = fakeCoda({
      rows: { '/docs': [doc(0, 'ws-a'), doc(1, 'ws-b'), doc(2, 'ws-a'), doc(3, 'ws-a')] },
    })
    const rows = await adapter().listProjects(
      CREDS,
      withPageSink({ page: 2, limit: 2, workspace_id: 'ws-a' }),
    )
    expect(rows.map((r) => r.id)).toEqual(['doc-3'])
    expect(calls[0]!.params).toMatchObject({ workspaceId: 'ws-a', limit: 2 })
  })

  it('API path: parseListQuery → listProjects → listPage serves page 2', async () => {
    fakeCoda({ rows: { '/docs': Array.from({ length: N }, (_, i) => doc(i)) } })
    const params = parseListQuery({ limit: String(L), page: '2' })
    const rows = await adapter().listProjects(CREDS, params)
    const env = listPage(rows, params, 'coda')
    expect(env.data.map((r) => r.id)).toEqual(['doc-4', 'doc-5', 'doc-6', 'doc-7'])
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('Coda listTasks (GET /docs/{docId}/tables) pages by pageToken', () => {
  const L = 3
  const N = 2 * L + 1
  const PATH = '/docs/doc-x/tables'

  it('serves every table once, in order, with hasMore exact', async () => {
    fakeCoda({ rows: { [PATH]: Array.from({ length: N }, (_, i) => table(i)) } })
    const res = await walk(L, (p) => adapter().listTasks(CREDS, 'doc-x', p))
    expect(res.ids).toEqual(Array.from({ length: N }, (_, i) => `doc-x:grid-${i}`))
    expect(res.hasMore).toEqual([true, true, false])
  })

  it('the page-2 request carries the pageToken from page 1', async () => {
    const calls = fakeCoda({ rows: { [PATH]: Array.from({ length: N }, (_, i) => table(i)) } })
    await adapter().listTasks(CREDS, 'doc-x', withPageSink({ page: 2, limit: L }))
    expect(calls[0]!.params['pageToken']).toBeUndefined()
    expect(calls[0]!.params).toMatchObject({ limit: L })
    expect(typeof calls[1]!.params['pageToken']).toBe('string')
  })

  it('a limit above the server maximum still fills the page from the next token', async () => {
    fakeCoda({ rows: { [PATH]: Array.from({ length: 11 }, (_, i) => table(i)) }, maxLimit: 2 })
    const res = await walk(5, (p) => adapter().listTasks(CREDS, 'doc-x', p))
    expect(res.sizes).toEqual([5, 5, 1])
    expect(res.hasMore).toEqual([true, true, false])
  })

  it('API path: parseListQuery → listTasks → listPage serves page 3', async () => {
    fakeCoda({ rows: { [PATH]: Array.from({ length: N }, (_, i) => table(i)) } })
    const params = parseListQuery({ limit: String(L), page: '3' })
    const env = listPage(await adapter().listTasks(CREDS, 'doc-x', params), params, 'coda')
    expect(env.data.map((r) => r.id)).toEqual(['doc-x:grid-6'])
    expect(env.meta.hasMore).toBe(false)
  })
})

describe('Coda listUsers (GET /workspaces/{workspaceId}/users) pages by pageToken', () => {
  const L = 3
  const N = 2 * L + 1
  const PATH = '/workspaces/ws-1/users'

  it('serves every member once, in order, with hasMore exact, whatever the server page size', async () => {
    // The endpoint documents no `limit`: the server's page is its own size.
    fakeCoda({
      rows: { [PATH]: Array.from({ length: N }, (_, i) => member(i)) },
      fixedPage: { [PATH]: 2 },
    })
    const res = await walk(L, (p) => adapter().listUsers(CREDS, 'ws-1', p))
    expect(res.ids).toEqual(Array.from({ length: N }, (_, i) => `user${i}@example.com`))
    expect(res.hasMore).toEqual([true, true, false])
  })

  it('the page-2 request carries the pageToken, and no undocumented limit is sent', async () => {
    const calls = fakeCoda({
      rows: { [PATH]: Array.from({ length: N }, (_, i) => member(i)) },
      fixedPage: { [PATH]: L },
    })
    await adapter().listUsers(CREDS, 'ws-1', withPageSink({ page: 2, limit: L }))
    expect(calls.some((c) => typeof c.params['pageToken'] === 'string')).toBe(true)
    expect(calls.every((c) => c.params['limit'] === undefined)).toBe(true)
  })

  it('API path: parseListQuery → listUsers → listPage serves page 2', async () => {
    fakeCoda({
      rows: { [PATH]: Array.from({ length: N }, (_, i) => member(i)) },
      fixedPage: { [PATH]: 5 },
    })
    const params = parseListQuery({ limit: String(L), page: '2' })
    const env = listPage(await adapter().listUsers(CREDS, 'ws-1', params), params, 'coda')
    expect(env.data.map((r) => r.id)).toEqual([
      'user3@example.com',
      'user4@example.com',
      'user5@example.com',
    ])
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('Coda listWorkspaces (derived from /whoami and every doc) pages locally', () => {
  // Coda has no list-workspaces endpoint: the collection is the token's own
  // workspace plus every doc's workspace, deduped. That needs every doc, not
  // one page of them.
  const L = 2
  const N = 2 * L + 1
  const docs = [
    doc(0, 'ws-1'),
    doc(1, 'ws-2'),
    doc(2, 'ws-1'),
    doc(3, 'ws-3'),
    doc(4, 'ws-2'),
    doc(5, 'ws-4'),
    doc(6, 'ws-3'),
  ]
  const whoami = {
    loginId: 'me@example.com',
    workspace: { id: 'ws-0', type: 'workspace', name: 'Mine' },
  }

  it('serves every workspace once, in order, with hasMore exact', async () => {
    fakeCoda({ rows: { '/docs': docs }, maxLimit: 3, whoami })
    const res = await walk(L, (p) => adapter().listWorkspaces(CREDS, p))
    expect(res.ids).toEqual(Array.from({ length: N }, (_, i) => `ws-${i}`))
    expect(res.hasMore).toEqual([true, true, false])
  })

  it('walks the doc chain by pageToken', async () => {
    const calls = fakeCoda({ rows: { '/docs': docs }, maxLimit: 3, whoami })
    await adapter().listWorkspaces(CREDS, withPageSink({ page: 2, limit: L }))
    const docCalls = calls.filter((c) => c.path === '/docs')
    expect(docCalls).toHaveLength(3)
    expect(docCalls.slice(1).every((c) => typeof c.params['pageToken'] === 'string')).toBe(true)
  })

  it('API path: parseListQuery → listWorkspaces → listPage serves page 3', async () => {
    fakeCoda({ rows: { '/docs': docs }, maxLimit: 3, whoami })
    const params = parseListQuery({ limit: String(L), page: '3' })
    const env = listPage(await adapter().listWorkspaces(CREDS, params), params, 'coda')
    expect(env.data.map((r) => r.id)).toEqual(['ws-4'])
    expect(env.meta.hasMore).toBe(false)
    expect(env.meta.totalCount).toBe(N)
  })
})

describe('Coda pager keys are per connection, collection and filter', () => {
  const token = (o: number, s: number) => Buffer.from(JSON.stringify({ o, s })).toString('base64')

  it('a second connection walks its own chain, never the first connection’s tokens', async () => {
    const docsOf = (p: string) =>
      Array.from({ length: 9 }, (_, i) => ({ ...doc(i), id: `${p}-doc-${i}` }))
    const calls = fakeCoda(
      { rows: { '/docs': docsOf('a') } },
      { 'Bearer token-b': { rows: { '/docs': docsOf('b') } } },
    )
    const A = { accessToken: 'coda-token' }
    const B = { accessToken: 'token-b' }
    await adapter().listProjects(A, withPageSink({ page: 1, limit: 4 }))
    const aTokens = new Set(
      calls.filter((c) => c.auth === 'Bearer coda-token').map((c) => c.params['pageToken']),
    )
    const rows = await adapter().listProjects(B, withPageSink({ page: 2, limit: 4 }))
    expect(rows.map((r) => r.id)).toEqual(['b-doc-4', 'b-doc-5', 'b-doc-6', 'b-doc-7'])
    const bCalls = calls.filter((c) => c.auth === 'Bearer token-b')
    expect(bCalls[0]!.params).toEqual({ limit: 4 })
    for (const c of bCalls) {
      if (c.params['pageToken'] !== undefined) {
        expect(aTokens.has(c.params['pageToken'])).toBe(false)
      }
    }
  })

  it('a filtered walk does not resume an unfiltered chain', async () => {
    const calls = fakeCoda({
      rows: { '/docs': [doc(0, 'ws-a'), doc(1, 'ws-b'), doc(2, 'ws-a'), doc(3, 'ws-a')] },
    })
    await adapter().listProjects(CREDS, withPageSink({ page: 1, limit: 2 }))
    const before = calls.length
    const rows = await adapter().listProjects(
      CREDS,
      withPageSink({ page: 2, limit: 2, workspace_id: 'ws-a' }),
    )
    expect(rows.map((r) => r.id)).toEqual(['doc-3'])
    expect(calls[before]!.params).toEqual({ limit: 2, workspaceId: 'ws-a' })
  })

  it('a walk at another limit does not resume a chain minted at the first', async () => {
    const calls = fakeCoda({ rows: { '/docs': Array.from({ length: 9 }, (_, i) => doc(i)) } })
    await adapter().listProjects(CREDS, withPageSink({ page: 1, limit: 2 }))
    const before = calls.length
    const rows = await adapter().listProjects(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(['doc-3', 'doc-4', 'doc-5'])
    expect(calls[before]!.params).toEqual({ limit: 3 })
  })

  it('tables of one doc never resume the chain of another doc', async () => {
    const calls = fakeCoda({
      rows: {
        '/docs/doc-a/tables': Array.from({ length: 7 }, (_, i) => table(i)),
        '/docs/doc-b/tables': Array.from({ length: 7 }, (_, i) => table(100 + i)),
      },
    })
    await adapter().listTasks(CREDS, 'doc-a', withPageSink({ page: 1, limit: 3 }))
    const rows = await adapter().listTasks(CREDS, 'doc-b', withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(['doc-b:grid-103', 'doc-b:grid-104', 'doc-b:grid-105'])
    const bCalls = calls.filter((c) => c.path === '/docs/doc-b/tables')
    expect(bCalls[0]!.params).toEqual({ limit: 3 })
  })

  it('an explicit cursor is fetched once, as the only parameter, with hasMore from nextPageToken', async () => {
    const calls = fakeCoda({ rows: { '/docs': Array.from({ length: 9 }, (_, i) => doc(i)) } })
    const mid = withPageSink({ cursor: token(2, 3), limit: 3 })
    const rows = await adapter().listProjects(CREDS, mid)
    expect(rows.map((r) => r.id)).toEqual(['doc-2', 'doc-3', 'doc-4'])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toEqual({ pageToken: token(2, 3) })
    expect(readUpstreamPage(mid)?.hasMore).toBe(true)

    const last = withPageSink({ cursor: token(6, 3), limit: 3 })
    await adapter().listProjects(CREDS, last)
    expect(readUpstreamPage(last)?.hasMore).toBe(false)
  })
})

describe('Coda listWorkspaces refuses a doc chain it cannot finish', () => {
  function chain(next: (n: number, token: unknown) => string | undefined) {
    let n = 0
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      if (path === '/whoami') return { data: { loginId: 'me@example.com' } }
      n++
      const nextPageToken = next(n, cfg?.params?.['pageToken'])
      return { data: { items: [doc(n)], ...(nextPageToken ? { nextPageToken } : {}) } }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    return get
  }

  it('throws past the page guard instead of serving a partial list', async () => {
    const get = chain((n) => `t${n}`)
    await expect(
      adapter().listWorkspaces(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/exceeded 1000 pages/)
    expect(get.mock.calls.filter((c) => c[0] === '/docs')).toHaveLength(1000)
  })

  it('throws when a page names its own token as the next one', async () => {
    chain((n, token) => (n === 1 ? 'loop' : (token as string)))
    await expect(
      adapter().listWorkspaces(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/repeated its pageToken/)
  })
})
