/**
 * Tuleap list paging.
 *
 * Tuleap's REST API spec (https://tuleap.net/api/explorer/swagger.json) gives
 * both endpoints paged here the same two paging parameters:
 *
 *   GET /projects:
 *     limit  — "Number of elements displayed per page", default 10, maximum 50
 *     offset — "Position of the first element to display"
 *   GET /artifacts/{id}/changesets:
 *     limit  — "Number of elements displayed per page", default 10, minimum 1, maximum 50
 *     offset — "Position of the first element to display"
 *
 * The next signal is the `x-pagination-size` header, from
 * https://docs.tuleap.com/user-guide/integration/rest/collections.html:
 *
 *   "So for most routes, `x-pagination-size` gives the maximum number of matching elements."
 *   "you need to iterate from 0 to `x-pagination-size` whatever happen, do not
 *    - stop on empty collections (you will be missing data) - stop when you
 *    retrieved `x-pagination-size` elements (you will have an infinite loop)"
 *
 * So a short or empty page is NOT an end (permissions hide rows), and the size
 * is an upper bound, not a count: hasMore is `offset + limit < x-pagination-size`
 * and no totalCount is reported.
 *
 * The fake honours only that: `limit` (default 10, refused above 50), `offset`
 * (default 0), and `x-pagination-size`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { TuleapAdapter } from '../../../../../../src/verticals/projects/adapters/tuleap/index'

const MAX = 50

let tokenSeq = 0
/** A fresh connection per test, so no row-pager memo is shared between tests. */
const creds = () => ({
  accessToken: `tlp.k1.test-${++tokenSeq}-${Date.now()}`,
  extra: { host: 'https://tuleap.example.com' },
})

type Row = Record<string, unknown>
interface Call {
  path: string
  params: Record<string, unknown>
}

function badRequest(msg: string): never {
  throw Object.assign(new Error(msg), {
    isAxiosError: true,
    response: { status: 400, data: { error: { message: msg } } },
  })
}

/**
 * A fake Tuleap serving `collections[path]`. `hidden` rows count towards
 * `x-pagination-size` but are never returned, as rows the user may not read.
 */
function fakeTuleap(
  collections: Record<string, Row[]>,
  hidden: Set<unknown> = new Set(),
  opts: {
    /** Per access key: rows that key may not read (overrides `hidden`). */
    hiddenByKey?: Record<string, Set<unknown>>
    /** false: the response carries no `x-pagination-size` header. */
    sizeHeader?: boolean
  } = {},
) {
  const calls: Call[] = []
  const get = vi.fn(
    async (key: string, path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = cfg?.params ?? {}
      calls.push({ path, params })
      const hide = opts.hiddenByKey?.[key] ?? hidden
      const rows = collections[path]
      if (!rows) throw new Error(`unexpected path ${path}`)
      const limit = params['limit'] === undefined ? 10 : Number(params['limit'])
      const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX) badRequest(`limit ${limit}`)
      if (!Number.isInteger(offset) || offset < 0) badRequest(`offset ${offset}`)
      return {
        data: rows.slice(offset, offset + limit).filter((r) => !hide.has(r['id'])),
        headers: {
          'x-pagination-limit': String(limit),
          'x-pagination-limit-max': String(MAX),
          'x-pagination-offset': String(offset),
          ...(opts.sizeHeader === false ? {} : { 'x-pagination-size': String(rows.length) }),
        },
      }
    },
  )
  vi.spyOn(axios, 'create').mockImplementation(((cfg?: { headers?: Record<string, string> }) => {
    const key = cfg?.headers?.['X-Auth-AccessKey'] ?? ''
    return { get: (path: string, c?: never) => get(key, path, c) }
  }) as never)
  return { calls, get }
}

const projects = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, label: `P${i + 1}`, shortname: `p${i + 1}` }))

/** Changesets 1..n; every `bare`-th one (by id) carries no comment. */
const changesets = (n: number, bare = 0) =>
  Array.from({ length: n }, (_, i) => {
    const id = i + 1
    const commented = bare === 0 || id % bare !== 0
    return {
      id,
      submitted_by: { id: 7 },
      submitted_on: '2026-01-01T00:00:00+00:00',
      last_comment: { format: 'text', body: commented ? `comment ${id}` : '' },
    }
  })

const adapter = () => new TuleapAdapter()
const strIds = (rows: Row[]) => rows.map((r) => String(r['id']))

afterEach(() => vi.restoreAllMocks())

describe('tuleap listProjects paging (limit + offset, x-pagination-size)', () => {
  const L = 3
  const N = 2 * L + 1

  it('walks pages 1..3 serving every project once, in order, with hasMore exact', async () => {
    fakeTuleap({ '/projects': projects(N) })
    const c = creds()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listProjects(c, params)).map((p) => p.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(strIds(projects(N)))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries offset=L and limit=L', async () => {
    const { calls } = fakeTuleap({ '/projects': projects(N) })
    await adapter().listProjects(creds(), withPageSink({ page: 2, limit: L }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toMatchObject({ limit: L, offset: L })
  })

  it('a limit above 50 is clamped, strides by the clamp, and is reported as the page size', async () => {
    const { calls } = fakeTuleap({ '/projects': projects(120) })
    const c = creds()
    const p1 = withPageSink({ page: 1, limit: 100 })
    const p2 = withPageSink({ page: 2, limit: 100 })
    expect((await adapter().listProjects(c, p1)).map((p) => p.id)).toEqual(strIds(projects(50)))
    expect((await adapter().listProjects(c, p2)).map((p) => p.id)).toEqual(
      strIds(projects(100).slice(50)),
    )
    expect(calls.map((x) => x.params)).toEqual([
      { limit: MAX, offset: 0 },
      { limit: MAX, offset: MAX },
    ])
    expect(readUpstreamPage(p1)).toMatchObject({ pageSize: MAX, hasMore: true })
  })

  it('a page emptied by permissions still reports hasMore from x-pagination-size', async () => {
    // Rows 4..6 are hidden: page 2 comes back empty, yet row 7 is on page 3.
    fakeTuleap({ '/projects': projects(N) }, new Set([4, 5, 6]))
    const params = withPageSink({ page: 2, limit: L })
    expect(await adapter().listProjects(creds(), params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
  })

  it('an exact multiple of the limit ends on the last full page (hasMore [true, false])', async () => {
    // offset + limit === x-pagination-size on page 2: that page is the last one.
    const { calls } = fakeTuleap({ '/projects': projects(2 * L) })
    const c = creds()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 2; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listProjects(c, params)).map((p) => p.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(strIds(projects(2 * L)))
    expect(more).toEqual([true, false])
    expect(calls).toHaveLength(2)
  })

  it('without x-pagination-size, hasMore is not reported (the page length is no end signal)', async () => {
    fakeTuleap({ '/projects': projects(N) }, new Set(), { sizeHeader: false })
    const params = withPageSink({ page: 3, limit: L })
    expect((await adapter().listProjects(creds(), params)).map((p) => p.id)).toEqual(['7'])
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })

  it('an explicit numeric cursor is still honoured as the upstream offset', async () => {
    const { calls } = fakeTuleap({ '/projects': projects(N) })
    const params = withPageSink({ page: 1, limit: L })
    params['cursor'] = '4'
    expect((await adapter().listProjects(creds(), params)).map((p) => p.id)).toEqual([
      '5',
      '6',
      '7',
    ])
    expect(calls[0]!.params).toMatchObject({ limit: L, offset: 4 })
  })

  it('API path: parseListQuery + listPage page through with an exact end', async () => {
    fakeTuleap({ '/projects': projects(N) })
    const c = creds()
    const seen: string[] = []
    const more: Array<boolean | null> = []
    for (let k = 1; k <= 3; k++) {
      const q = parseListQuery({ page: String(k), limit: String(L) })
      const env = listPage(await adapter().listProjects(c, q), q, 'tuleap')
      seen.push(...env.data.map((p) => p.id))
      more.push(env.meta.hasMore)
    }
    expect(seen).toEqual(strIds(projects(N)))
    expect(more).toEqual([true, true, false])
  })
})

describe('tuleap listComments paging (changesets filtered to comments)', () => {
  const L = 3
  const N = 2 * L + 1
  const PATH = '/artifacts/42/changesets'

  it('walks pages 1..3 serving every comment once, in order, with hasMore exact', async () => {
    fakeTuleap({ [PATH]: changesets(N) })
    const c = creds()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listComments(c, '42', params)).map((x) => x.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(strIds(changesets(N)))
    expect(more).toEqual([true, true, false])
  })

  it('skips changesets without a comment and still serves full caller pages', async () => {
    // 150 changesets, every 3rd without a comment: 100 comments across 3 upstream pages.
    const all = changesets(150, 3)
    const commented = all.filter((cs) => cs.last_comment.body !== '')
    fakeTuleap({ [PATH]: all })
    const c = creds()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 40 })
      seen.push(...(await adapter().listComments(c, '42', params)).map((x) => x.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(strIds(commented))
    expect(more).toEqual([true, true, false])
  })

  it('the upstream page-2 request carries offset=50 and limit=50', async () => {
    const { calls } = fakeTuleap({ [PATH]: changesets(120) })
    const c = creds()
    await adapter().listComments(c, '42', withPageSink({ page: 1, limit: 50 }))
    await adapter().listComments(c, '42', withPageSink({ page: 2, limit: 50 }))
    expect(calls.map((x) => x.params)).toEqual([
      { limit: MAX, offset: 0 },
      { limit: MAX, offset: MAX },
      { limit: MAX, offset: 2 * MAX },
    ])
  })

  it('a limit above 50 never sends more than 50 upstream and serves the caller limit', async () => {
    const { calls } = fakeTuleap({ [PATH]: changesets(120) })
    const params = withPageSink({ page: 1, limit: 100 })
    const got = await adapter().listComments(creds(), '42', params)
    expect(got.map((x) => x.id)).toEqual(strIds(changesets(100)))
    expect(calls.every((x) => Number(x.params['limit']) <= MAX)).toBe(true)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('keeps walking past an upstream page emptied by permissions', async () => {
    const hidden = new Set(Array.from({ length: 50 }, (_, i) => 51 + i))
    fakeTuleap({ [PATH]: changesets(120) }, hidden)
    const c = creds()
    const params = withPageSink({ page: 2, limit: 50 })
    const got = await adapter().listComments(c, '42', params)
    expect(got.map((x) => x.id)).toEqual(Array.from({ length: 20 }, (_, i) => String(101 + i)))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an exact multiple of 50 changesets ends on the last upstream page', async () => {
    // offset + 50 === x-pagination-size after upstream page 2: no third request.
    const { calls } = fakeTuleap({ [PATH]: changesets(100) })
    const c = creds()
    const p1 = withPageSink({ page: 1, limit: 50 })
    const p2 = withPageSink({ page: 2, limit: 50 })
    expect((await adapter().listComments(c, '42', p1)).map((x) => x.id)).toEqual(
      strIds(changesets(50)),
    )
    expect((await adapter().listComments(c, '42', p2)).map((x) => x.id)).toEqual(
      strIds(changesets(100).slice(50)),
    )
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
    expect(calls.map((x) => x.params['offset'])).toEqual([0, MAX])
  })

  it('without x-pagination-size, a full upstream page still leads to the next one', async () => {
    const { calls } = fakeTuleap({ [PATH]: changesets(70) }, new Set(), { sizeHeader: false })
    const params = withPageSink({ page: 1, limit: 60 })
    const got = await adapter().listComments(creds(), '42', params)
    expect(got.map((x) => x.id)).toEqual(strIds(changesets(60)))
    expect(calls.map((x) => x.params['offset'])).toEqual([0, MAX])
  })

  it('keeps each artifact apart on one connection', async () => {
    const OTHER = '/artifacts/43/changesets'
    const theirs = changesets(N).map((cs) => ({ ...cs, id: cs.id + 1000 }))
    fakeTuleap({ [PATH]: changesets(N), [OTHER]: theirs })
    const c = creds()
    const a1 = await adapter().listComments(c, '42', withPageSink({ page: 1, limit: L }))
    expect(a1.map((x) => x.id)).toEqual(['1', '2', '3'])
    const b2 = await adapter().listComments(c, '43', withPageSink({ page: 2, limit: L }))
    expect(b2.map((x) => x.id)).toEqual(['1004', '1005', '1006'])
    const b1 = await adapter().listComments(c, '43', withPageSink({ page: 1, limit: L }))
    expect(b1.map((x) => x.id)).toEqual(['1001', '1002', '1003'])
  })

  it('keeps two connections to one host apart (each sees only its own permitted rows)', async () => {
    const alice = creds()
    const bob = creds()
    fakeTuleap({ [PATH]: changesets(N) }, new Set(), {
      hiddenByKey: { [alice.accessToken]: new Set(), [bob.accessToken]: new Set([1, 2, 3]) },
    })
    // Bob's first request is page 2, straight after Alice's page 1: it must be
    // cut from Bob's own view (4, 5, 6, 7), never from Alice's walk.
    const a1 = await adapter().listComments(alice, '42', withPageSink({ page: 1, limit: L }))
    expect(a1.map((x) => x.id)).toEqual(['1', '2', '3'])
    const b2 = await adapter().listComments(bob, '42', withPageSink({ page: 2, limit: L }))
    expect(b2.map((x) => x.id)).toEqual(['7'])
    const a2 = await adapter().listComments(alice, '42', withPageSink({ page: 2, limit: L }))
    expect(a2.map((x) => x.id)).toEqual(['4', '5', '6'])
    const b1 = await adapter().listComments(bob, '42', withPageSink({ page: 1, limit: L }))
    expect(b1.map((x) => x.id)).toEqual(['4', '5', '6'])
  })

  it('API path: parseListQuery + listPage page through with an exact end', async () => {
    fakeTuleap({ [PATH]: changesets(N) })
    const c = creds()
    const seen: string[] = []
    const more: Array<boolean | null> = []
    for (let k = 1; k <= 3; k++) {
      const q = parseListQuery({ page: String(k), limit: String(L) })
      const env = listPage(await adapter().listComments(c, '42', q), q, 'tuleap')
      seen.push(...env.data.map((x) => x.id))
      more.push(env.meta.hasMore)
    }
    expect(seen).toEqual(strIds(changesets(N)))
    expect(more).toEqual([true, true, false])
  })
})
