/**
 * inSign list paging for the per-session sub-collections.
 *
 * The vendor's OpenAPI spec (https://sandbox.test.getinsign.show/v3/api-docs,
 * loaded by https://getinsign.github.io/insign-getting-started/explorer.html)
 * gives POST /extern/users, POST /get/externInfos, POST /get/status and
 * POST /get/documents/full a `SessionIDInput` body ({ sessionid }) and no
 * page, limit, offset or cursor parameter. Their responses carry the whole
 * collection (`externUsers`, `documents`). So listSigners and listDocuments
 * fetch it once and the adapter slices it locally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { InsignAdapter } from '../../../../../../src/verticals/docsign/adapters/insign/index'

const CREDS = { accessToken: 'dXNlcjpwYXNz' }
const CALL_BUDGET = 20

/** Query params each endpoint documents (besides the deprecated `sessionid`). */
const DOCUMENTED_QUERY: Record<string, readonly string[]> = {
  '/extern/users': [],
  '/get/externInfos': ['idVorgangsverwaltung'],
  '/get/status': ['withImages'],
  '/get/documents/full': ['idVorgangsverwaltung', 'includeAnnotations'],
}

/**
 * A fake inSign honouring ONLY what the spec documents: a `{ sessionid }`
 * body and the per-endpoint query params above. Any other body key or query
 * param is refused. `n` extern users and `n` documents on session `S1`.
 */
function fakeInsign(n: number) {
  let calls = 0
  const post = vi.fn(
    async (
      path: string,
      body: Record<string, unknown>,
      cfg?: { params?: Record<string, unknown> },
    ) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      const allowed = DOCUMENTED_QUERY[path]
      if (!allowed) throw new Error(`unexpected path ${path}`)
      for (const k of Object.keys(cfg?.params ?? {})) {
        if (!allowed.includes(k)) throw new Error(`400: ${path} does not take ?${k}`)
      }
      for (const k of Object.keys(body ?? {})) {
        if (k !== 'sessionid') throw new Error(`400: ${path} body does not take ${k}`)
      }
      if (body.sessionid !== 'S1') throw new Error('unknown session')
      const emails = Array.from({ length: n }, (_, i) => `u${i + 1}@example.com`)
      switch (path) {
        case '/extern/users':
          return {
            data: { externUsers: emails.map((e, i) => ({ externUser: e, orderNumber: i })) },
          }
        case '/get/externInfos':
          return { data: { externInfos: [] } }
        case '/get/status':
          return { data: { sessionid: 'S1', signaturFieldsStatusList: [] } }
        default:
          return {
            data: {
              sessionid: 'S1',
              documents: Array.from({ length: n }, (_, i) => ({
                docid: `d${i + 1}`,
                displayname: `Doc ${i + 1}`,
              })),
            },
          }
      }
    },
  )
  vi.spyOn(axios, 'create').mockReturnValue({ post, get: vi.fn() } as never)
  return { post }
}

const adapter = () => new InsignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

const L = 3
const N = 2 * L + 1

const LOCAL_METHODS = [
  {
    name: 'listSigners',
    id: (i: number) => `S1:u${i + 1}@example.com`,
    paths: ['/extern/users', '/get/externInfos', '/get/status'],
    call: (a: InsignAdapter, p: QueryParams) => a.listSigners(CREDS, 'S1', p),
  },
  {
    name: 'listDocuments',
    id: (i: number) => `d${i + 1}`,
    paths: ['/get/documents/full'],
    call: (a: InsignAdapter, p: QueryParams) => a.listDocuments(CREDS, 'S1', p),
  },
] as const

describe('insign capabilities', () => {
  it('declares no maxPageSize: the spec documents no page size at all', () => {
    const caps = (adapter() as { capabilities?: { maxPageSize?: number } }).capabilities
    expect(caps?.maxPageSize).toBeUndefined()
  })
})

describe.each(LOCAL_METHODS)('insign $name local paging', ({ call, id, paths }) => {
  const expected = Array.from({ length: N }, (_, i) => id(i))

  it('pages 1..3 at limit L return every row once, in order, with exact hasMore', async () => {
    fakeInsign(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      const page = await call(adapter(), params)
      expect(page.length).toBeLessThanOrEqual(L)
      seen.push(...page.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('page 2 sends only the documented { sessionid } body, once per endpoint', async () => {
    const { post } = fakeInsign(N)
    await call(adapter(), withPageSink({ page: 2, limit: L }))
    expect(post).toHaveBeenCalledTimes(paths.length)
    for (const c of post.mock.calls) {
      expect(paths).toContain(c[0])
      expect(c[1]).toEqual({ sessionid: 'S1' })
    }
  })

  it('a limit above the row count returns every row with hasMore false', async () => {
    fakeInsign(N)
    const params = parseListQuery({ limit: '500' })
    const rows = await call(adapter(), params)
    expect(rows.map((r) => r.id)).toEqual(expected)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('the API path: parseListQuery + listPage serves page 2 with meta.hasMore', async () => {
    fakeInsign(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage<{ id: string }>(await call(adapter(), params), params, 'insign')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta.hasMore).toBe(true)
  })

  it('with no limit, every row is returned', async () => {
    fakeInsign(N)
    expect((await call(adapter(), {})).map((r) => r.id)).toEqual(expected)
  })
})

describe('insign get-by-id still sees the whole collection', () => {
  it('getSigner finds the last signer', async () => {
    fakeInsign(N)
    const s = await adapter().getSigner(CREDS, `S1:u${N}@example.com`)
    expect(s.id).toBe(`S1:u${N}@example.com`)
  })

  it('getDocument finds the last document', async () => {
    fakeInsign(N)
    const d = await adapter().getDocument(CREDS, `S1:d${N}`)
    expect(d.id).toBe(`d${N}`)
  })
})
