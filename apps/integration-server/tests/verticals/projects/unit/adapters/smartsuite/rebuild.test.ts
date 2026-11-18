/**
 * SmartSuite listComments, listUsers and listTags against the documented API.
 *
 * List Comments
 * (https://developers.smartsuite.com/docs/solution-data/comments/list-comments):
 *   "GET https://app.smartsuite.com/api/v1/comments/?record=[Record_Id]
 *    Gets a record's comments. Returns an object whose results array holds the
 *    comment objects."
 *   Response: "count number or null ... next string or null URL of the next
 *   page of results, or null. previous ... results Array of objects".
 *   No page-size parameter is documented, so the adapter follows `next`
 *   verbatim and cuts the caller's rows out with pageByRows. The adapter read
 *   the response as a bare array and so always returned [].
 *
 * List Members
 * (https://developers.smartsuite.com/docs/org_management/members/list-members):
 *   "POST https://app.smartsuite.com/api/v1/members/list/ List Workspace
 *    Members (users)." with `offset` and `limit` query parameters ("Value must
 *    be less than or equal to 1000") and an optional `sort`/`filter` body. The
 *    adapter called /applications/members/records/list/ with limit in the body.
 *
 * Tags: the REST reference (the sitemap, and the Solution Data category, which
 * lists records, fields, comments, tables, solutions, views and webhooks) documents no tags
 * endpoint, so listTags and getTag refuse before sending anything.
 *
 * The fake upstream honours ONLY the documented parameters. The comment
 * fake's `next` URLs carry a private token (`__c`) the adapter cannot know,
 * so the only way to page 2 is to follow `next` as given.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { SmartsuiteAdapter } from '../../../../../../src/verticals/projects/adapters/smartsuite/index'

const ORIGIN = 'https://app.smartsuite.com'
const COMMENTS = '/api/v1/comments/'
const MEMBERS = '/api/v1/members/list/'
const COMMENT_PARAMS = new Set(['record', 'application', 'solution'])
const MEMBER_PARAMS = new Set(['offset', 'limit'])
const MEMBER_BODY = new Set(['sort', 'filter'])
/** The fake's own comment page size: uneven against the caller's limit. */
const UPSTREAM_COMMENT_PAGE = 7

const adapter = new SmartsuiteAdapter()
const CREDS = { accessToken: 'key', extra: { accountId: 'ws1' } }
const RECORD = 'rec1'

interface Seen {
  method: string
  url: URL
  body: unknown
  headers: Record<string, unknown>
}
let seen: Seen[] = []
const realAdapter = axios.defaults.adapter

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const cids = (n: number, rec = RECORD): string[] =>
  Array.from({ length: n }, (_, i) => `${rec}-c${i + 1}`)
const mids = (n: number): string[] => Array.from({ length: n }, (_, i) => `m${i + 1}`)

function comment(id: string, record: string) {
  return {
    solution: 'sol1',
    application: 'tbl1',
    record,
    member: 'm1',
    message: { data: { type: 'doc' }, html: '<p>x</p>', preview: `text ${id}` },
    parent_comment: null,
    created_on: '2023-03-20T12:49:05.832000Z',
    deleted_on: null,
    updated_on: null,
    reactions: [],
    key: 1,
    assigned_to: null,
    resolved_by: null,
    followers: [],
    type: 'comment',
    email: null,
    id,
  }
}

function fakeSmartsuite(counts: {
  comments?: Record<string, number>
  members?: number
  nextOrigin?: string
}): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    const headers = config.headers.toJSON() as Record<string, unknown>
    seen.push({ method: config.method ?? '', url, body, headers })
    if (url.origin !== ORIGIN) throw httpError(404, { detail: `no host ${url.origin}` })
    const q = url.searchParams
    let data: unknown
    if (url.pathname === COMMENTS && config.method === 'get') {
      for (const k of q.keys())
        if (!COMMENT_PARAMS.has(k) && k !== '__c') throw httpError(400, { detail: `unknown ${k}` })
      const record = q.get('record')
      const all = Object.entries(counts.comments ?? {}).flatMap(([rec, n]) =>
        cids(n, rec).map((id) => comment(id, rec)),
      )
      const rows = record ? all.filter((c) => c.record === record) : all
      const at = Number(q.get('__c') ?? 0)
      const results = rows.slice(at, at + UPSTREAM_COMMENT_PAGE)
      const nextAt = at + UPSTREAM_COMMENT_PAGE
      let next: string | null = null
      if (nextAt < rows.length) {
        const n = new URL(`${counts.nextOrigin ?? ORIGIN}${COMMENTS}`)
        if (record) n.searchParams.set('record', record)
        n.searchParams.set('__c', String(nextAt))
        next = n.toString()
      }
      data = { count: null, next, previous: null, results }
    } else if (url.pathname === MEMBERS && config.method === 'post') {
      for (const k of q.keys())
        if (!MEMBER_PARAMS.has(k)) throw httpError(400, { detail: `unknown ${k}` })
      for (const k of Object.keys((body as object) ?? {}))
        if (!MEMBER_BODY.has(k)) throw httpError(400, { detail: `unknown body field ${k}` })
      const n = counts.members ?? 0
      const limit = q.has('limit') ? Number(q.get('limit')) : 100
      if (limit > 1000) throw httpError(400, { detail: 'limit must be <= 1000' })
      const offset = Number(q.get('offset') ?? 0)
      const items = mids(n)
        .slice(offset, offset + limit)
        .map((id) => ({
          id,
          application_slug: 'members',
          full_name: { first_name: 'A', last_name: id, sys_root: `A ${id}` },
          email: [`${id}@example.com`],
          role: '3',
          type: '1',
          status: { value: '1', updated_on: '2022-12-20T17:52:24.804000Z' },
        }))
      data = { items, total: n, offset, limit, time: '2023-05-30T23:08:27.324200Z' }
    } else {
      throw httpError(404, { detail: `no route ${config.method} ${url.pathname}` })
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

beforeEach(() => _resetCursorPager())
afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type Method = 'listComments' | 'listUsers'

async function call(method: Method, params: QueryParams): Promise<string[]> {
  switch (method) {
    case 'listComments':
      return (await adapter.listComments(CREDS, RECORD, params)).map((r) => r.id)
    case 'listUsers':
      return (await adapter.listUsers(CREDS, 'ws1', params)).map((r) => r.id)
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

const METHODS: Array<
  [Method, (n: number) => Parameters<typeof fakeSmartsuite>[0], (n: number) => string[]]
> = [
  ['listComments', (n) => ({ comments: { [RECORD]: n, rec2: 4 } }), (n) => cids(n)],
  ['listUsers', (n) => ({ members: n }), mids],
]

describe.each(METHODS)('smartsuite %s serves the caller page', (method, counts, idsOf) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    fakeSmartsuite(counts(2 * L + 1))
    const all = idsOf(2 * L + 1)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    fakeSmartsuite(counts(2 * L))
    expect(await syncPage(method, 1, L)).toEqual({ ids: idsOf(2 * L).slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: idsOf(2 * L).slice(L), hasMore: false })
  })

  it('serves every row once at the sync worker page size', async () => {
    fakeSmartsuite(counts(1201))
    const out: string[] = []
    for (let page = 1; page < 10; page++) {
      const { ids: got, hasMore } = await syncPage(method, page, 500)
      out.push(...got)
      if (hasMore === false) break
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(idsOf(1201))
  })

  it('pages through the API path', async () => {
    fakeSmartsuite(counts(45))
    const params = parseListQuery({ limit: '20', page: '2' })
    const env = listPage(await call(method, params), params, 'smartsuite')
    expect(env.data).toEqual(idsOf(45).slice(20, 40))
    expect(env.meta.hasMore).toBe(true)
  })

  it('sends the workspace id as the documented ACCOUNT-ID header and the key as a Token', async () => {
    fakeSmartsuite(counts(3))
    await syncPage(method, 1, L)
    expect(seen[0]!.headers['ACCOUNT-ID']).toBe('ws1')
    expect(seen[0]!.headers['Authorization']).toBe('Token key')
  })
})

describe('smartsuite listComments request shape', () => {
  it('asks for one record by the documented `record` parameter and parses `results`', async () => {
    fakeSmartsuite({ comments: { [RECORD]: 3, rec2: 5 } })
    const got = await adapter.listComments(CREDS, RECORD, withPageSink({ page: 1, limit: 10 }))
    expect(got.map((c) => c.id)).toEqual(cids(3))
    expect(got[0]).toMatchObject({ taskId: RECORD, authorId: 'm1', body: `text ${RECORD}-c1` })
    expect(seen).toHaveLength(1)
    expect(seen[0]!.method).toBe('get')
    expect(seen[0]!.url.pathname).toBe(COMMENTS)
    expect([...seen[0]!.url.searchParams.entries()]).toEqual([['record', RECORD]])
  })

  it('follows `next` verbatim to reach later upstream pages', async () => {
    fakeSmartsuite({ comments: { [RECORD]: 15 } })
    await syncPage('listComments', 2, 10)
    expect(seen.map((s) => s.url.searchParams.get('__c'))).toEqual([null, '7', '14'])
    for (const s of seen) expect(s.url.searchParams.get('record')).toBe(RECORD)
  })

  it('refuses a `next` URL on another host and never sends the key there', async () => {
    fakeSmartsuite({ comments: { [RECORD]: 15 }, nextOrigin: 'https://elsewhere.example' })
    await expect(syncPage('listComments', 2, 10)).rejects.toThrow(/next/)
    expect(seen.every((s) => s.url.origin === ORIGIN)).toBe(true)
  })

  it("walks one walk per record: a later page of another record is that record's rows", async () => {
    fakeSmartsuite({ comments: { [RECORD]: 20, rec2: 20 } })
    const page = (rec: string, n: number) =>
      adapter.listComments(CREDS, rec, withPageSink({ page: n, limit: 5 }))
    await page(RECORD, 1)
    await page(RECORD, 2)
    const other = await page('rec2', 3)
    expect(other.map((c) => c.id)).toEqual(cids(20, 'rec2').slice(10, 15))
  })

  it('walks one walk per workspace: the same key in another ACCOUNT-ID starts afresh', async () => {
    fakeSmartsuite({ comments: { [RECORD]: 20 } })
    const ws2 = { accessToken: 'key', extra: { accountId: 'ws2' } }
    await adapter.listComments(CREDS, RECORD, withPageSink({ page: 1, limit: 5 }))
    await adapter.listComments(CREDS, RECORD, withPageSink({ page: 2, limit: 5 }))
    seen = []
    await adapter.listComments(ws2, RECORD, withPageSink({ page: 3, limit: 5 }))
    // ws2 has walked nothing yet, so its walk must start at the first upstream
    // page under its own ACCOUNT-ID, not resume ws1's `next` cursor.
    expect(seen[0]!.headers['ACCOUNT-ID']).toBe('ws2')
    expect(seen[0]!.url.searchParams.has('__c')).toBe(false)
  })
})

describe('smartsuite listUsers request shape', () => {
  it('posts to the documented /members/list/ with offset and limit as query parameters', async () => {
    fakeSmartsuite({ members: 21 })
    await syncPage('listUsers', 2, 10)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.method).toBe('post')
    expect(seen[0]!.url.pathname).toBe(MEMBERS)
    expect(seen[0]!.url.searchParams.get('offset')).toBe('10')
    expect(seen[0]!.url.searchParams.get('limit')).toBe('10')
    expect(seen[0]!.body).toEqual({})
  })

  it('clamps a limit above 1000 and reports the size it paged at', async () => {
    fakeSmartsuite({ members: 2500 })
    const all = mids(2500)
    expect(await syncPage('listUsers', 1, 5000)).toEqual({ ids: all.slice(0, 1000), hasMore: true })
    const p3 = withPageSink({ page: 3, limit: 5000 })
    expect(await call('listUsers', p3)).toEqual(all.slice(2000))
    expect(readUpstreamPage(p3)).toMatchObject({ hasMore: false, pageSize: 1000, totalCount: 2500 })
    for (const s of seen) expect(s.url.searchParams.get('limit')).toBe('1000')
  })

  it('maps members to users in the connection workspace', async () => {
    fakeSmartsuite({ members: 1 })
    const [u] = await adapter.listUsers(CREDS, 'ws1', withPageSink({ page: 1, limit: 10 }))
    expect(u).toMatchObject({
      id: 'm1',
      name: 'A m1',
      email: 'm1@example.com',
      workspaceIds: ['ws1'],
    })
  })
})

describe('smartsuite tags are not in the documented API', () => {
  it('listTags throws 501 NOT_SUPPORTED and sends no request', async () => {
    fakeSmartsuite({})
    await expect(
      adapter.listTags(CREDS, 'ws1', withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(seen).toHaveLength(0)
  })

  it('getTag throws 501 NOT_SUPPORTED and sends no request', async () => {
    fakeSmartsuite({})
    await expect(adapter.getTag(CREDS, 't1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(seen).toHaveLength(0)
  })
})
