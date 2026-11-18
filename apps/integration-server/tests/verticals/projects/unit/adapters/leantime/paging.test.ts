/**
 * Leantime list paging: every list RPC returns the whole collection, so the
 * adapter pages locally.
 *
 * Leantime's first-party API reference (docs.leantime.io, generated from the
 * service classes) documents no paging parameter on any of the four list
 * methods this adapter calls:
 *
 *   Projects.Projects.getAll  — params: `showClosedProjects` only;
 *                               "Gets all the projects for the current user."
 *   Tickets.Tickets.getAll    — params: `searchCriteria` only
 *   Comments.Comments.getComments — params: `module`, `entityId`, `commentOrder`
 *   Users.Users.getAll        — params: `activeOnly` only
 *
 * Before the fix every page returned the whole collection, so page 2 repeated
 * page 1. Now each is sliced by `pageLocally`, which reports the total and
 * `pagedLocally`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { LeantimeAdapter } from '../../../../../../src/verticals/projects/adapters/leantime/index'

const CREDS: Credentials = {
  accessToken: 'lt_user_hash',
  extra: { baseUrl: 'https://pm.example.test', apiKey: 'lt_user_hash' },
}

const L = 2
const N = 2 * L + 1

/** The documented params of each list RPC, by the method name the adapter sends. */
const DOCUMENTED: Record<string, string[]> = {
  'leantime.rpc.Projects.Projects.getAll': ['showClosedProjects'],
  'leantime.rpc.Tickets.getAll': ['searchCriteria'],
  'leantime.rpc.Comments.getComments': ['module', 'entityId', 'commentOrder'],
  'leantime.rpc.Users.getAll': ['activeOnly'],
}

const rows = () => Array.from({ length: N }, (_, i) => ({ id: i + 1 }))

/** A fake Leantime JSON-RPC endpoint honouring only the documented params. */
function fakeLeantime() {
  const post = vi.fn(
    async (url: string, body: { method: string; params: Record<string, unknown> }) => {
      if (url !== 'https://pm.example.test/api/jsonrpc') throw new Error(`unexpected url ${url}`)
      const allowed = DOCUMENTED[body.method]
      if (!allowed) throw new Error(`unexpected method ${body.method}`)
      const extra = Object.keys(body.params).filter((k) => !allowed.includes(k))
      if (extra.length > 0)
        throw new Error(`undocumented param(s) on ${body.method}: ${extra.join(', ')}`)
      return { data: { jsonrpc: '2.0', id: 1, result: rows() } }
    },
  )
  vi.spyOn(axios, 'create').mockReturnValue({
    get: vi.fn(),
    post,
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { post }
}

type Lister = (a: LeantimeAdapter, params: QueryParams) => Promise<{ id: string }[]>

const LISTS: [string, Lister][] = [
  ['listProjects', (a, p) => a.listProjects(CREDS, p)],
  ['listTasks', (a, p) => a.listTasks(CREDS, '7', p)],
  ['listComments', (a, p) => a.listComments(CREDS, '9', p)],
  ['listUsers', (a, p) => a.listUsers(CREDS, 'ws', p)],
]

const ALL_IDS = rows().map((r) => String(r.id))

afterEach(() => vi.restoreAllMocks())

describe.each(LISTS)('leantime %s paging', (_name, list) => {
  it(`walking pages 1..3 at limit ${L} yields every id once, in order, with exact hasMore`, async () => {
    fakeLeantime()
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const page = await list(new LeantimeAdapter(), params)
      expect(page.length).toBe(k < 3 ? L : 1)
      seen.push(...page.map((r) => r.id))
      const up = readUpstreamPage(params)
      expect(up).toMatchObject({ totalCount: N, pagedLocally: true })
      more.push(up?.hasMore)
    }
    expect(seen).toEqual(ALL_IDS)
    expect(more).toEqual([true, true, false])
  })

  it('page 2 does not repeat page 1', async () => {
    fakeLeantime()
    const a = new LeantimeAdapter()
    const p1 = await list(a, withPageSink({ page: 1, limit: L }))
    const p2 = await list(a, withPageSink({ page: 2, limit: L }))
    expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
  })

  it('sends only documented params (no paging key exists upstream)', async () => {
    const { post } = fakeLeantime()
    await list(new LeantimeAdapter(), withPageSink({ page: 2, limit: L }))
    expect(post).toHaveBeenCalledTimes(1)
    const sent = post.mock.calls[0]![1]
    const sentKeys = Object.keys(sent.params)
    expect(sentKeys.every((k) => DOCUMENTED[sent.method]!.includes(k))).toBe(true)
    expect(sentKeys).not.toContain('limit')
    expect(sentKeys).not.toContain('page')
    expect(sentKeys).not.toContain('offset')
  })

  it('a limit above the collection returns it whole and reports the end', async () => {
    fakeLeantime()
    const params = withPageSink({ page: 1, limit: 10_000 })
    expect((await list(new LeantimeAdapter(), params)).map((r) => r.id)).toEqual(ALL_IDS)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: N })
  })

  it('API path: parseListQuery + listPage report an exact end', async () => {
    fakeLeantime()
    const a = new LeantimeAdapter()
    const p1 = withPageSink(parseListQuery({ page: '1', limit: String(L) }))
    const env1 = listPage(await list(a, p1), p1, 'leantime')
    expect(env1.data.map((r) => r.id)).toEqual(ALL_IDS.slice(0, L))
    expect(env1.meta).toMatchObject({ page: 1, hasMore: true, totalCount: N })

    const p3 = withPageSink(parseListQuery({ page: '3', limit: String(L) }))
    const env3 = listPage(await list(a, p3), p3, 'leantime')
    expect(env3.data.map((r) => r.id)).toEqual(ALL_IDS.slice(2 * L))
    expect(env3.meta).toMatchObject({ page: 3, hasMore: false, totalCount: N })
  })
})
