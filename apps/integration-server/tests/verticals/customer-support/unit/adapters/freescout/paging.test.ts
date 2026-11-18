/**
 * FreeScout list paging for tags and mailboxes (teams).
 *
 * https://api-docs.freescout.net/ documents both GET api/tags and
 * GET api/mailboxes with the query parameters `page` ("Page number.") and
 * `pageSize` ("Page size (defaults to 50)."), and a response `page` object
 * carrying `size`, `totalElements`, `totalPages` and `number`.
 *
 * The fake below honours ONLY `page` (1-based, default 1) and `pageSize`
 * (default 50), and reports the end through `page.totalPages`.
 *
 * Tag rows are served as plain names in `_embedded.tags`, the shape the
 * adapter's tag transform reads today; the docs show tag objects there, which
 * is a mapping bug outside this paging change.
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
import { FreescoutAdapter } from '../../../../../../src/verticals/customer-support/adapters/freescout/index'

const creds: Credentials = {
  accessToken: 'key',
  extra: { instanceUrl: 'https://support.example.test' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let handler: (path: string, params: Record<string, unknown>) => unknown

beforeEach(() => {
  calls = []
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
          const params = { ...(cfg?.params ?? {}) }
          calls.push({ path, params })
          return { data: handler(path, params) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

function paged(n: number, embedKey: string, row: (id: number) => unknown) {
  return (_path: string, params: Record<string, unknown>) => {
    const page = Number(params['page'] ?? 1)
    const size = Number(params['pageSize'] ?? 50)
    const ids = Array.from({ length: n }, (_, i) => i + 1)
    return {
      _embedded: { [embedKey]: ids.slice((page - 1) * size, page * size).map(row) },
      page: {
        size,
        totalElements: n,
        totalPages: Math.ceil(n / size),
        number: page,
      },
    }
  }
}

const tags = (n: number) => paged(n, 'tags', (id) => `tag${id}`)
const mailboxes = (n: number) =>
  paged(n, 'mailboxes', (id) => ({ id, name: `Mailbox ${id}`, email: `m${id}@example.test` }))

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const reported: (boolean | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    reported.push(readUpstreamPage(params)?.hasMore)
    hasMore.push(listPage(rows, params, 'freescout').meta.hasMore ?? undefined)
  }
  return { ids, hasMore, reported }
}

const range = (n: number, prefix = '') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

const cases = [
  {
    name: 'listTags',
    path: '/tags',
    fake: tags,
    prefix: 'tag',
    run: (a: FreescoutAdapter, p: QueryParams) => a.listTags(creds, p),
  },
  {
    name: 'listTeams',
    path: '/mailboxes',
    fake: mailboxes,
    prefix: '',
    run: (a: FreescoutAdapter, p: QueryParams) => a.listTeams(creds, p),
  },
] as const

describe.each(cases)('freescout $name paging', ({ path, fake, prefix, run: runWith }) => {
  const adapter = new FreescoutAdapter()
  const run = (p: QueryParams) => runWith(adapter, p)

  it('serves every row once, in order, across pages of 2L+1 rows', async () => {
    const L = 5
    handler = fake(2 * L + 1)
    const { ids, hasMore, reported } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1, prefix))
    expect(hasMore).toEqual([true, true, false])
    // The sync worker reads only the reported flag, so pin it on its own.
    expect(reported).toEqual([true, true, false])
  })

  it('an exact multiple of the limit ends on its last full page', async () => {
    handler = fake(10)
    const { ids, hasMore, reported } = await walk(run, 5)
    expect(ids).toEqual(range(10, prefix))
    expect(hasMore).toEqual([true, false, false])
    expect(reported).toEqual([true, false, false])
  })

  it('page 2 requests the documented page and pageSize', async () => {
    handler = fake(30)
    await run(withPageSink({ page: 2, limit: 7 }))
    expect(calls).toEqual([{ path, params: { page: 2, pageSize: 7 } }])
  })

  it('a limit above the maximum is clamped', async () => {
    handler = fake(600)
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(calls).toEqual([{ path, params: { page: 1, pageSize: 500 } }])
    expect(rows.map((r) => r.id)).toEqual(range(500, prefix))
    expect(listPage(rows, params, 'freescout').meta.hasMore).toBe(true)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = fake(41)
    const params = parseListQuery({ page: '2', limit: '20' })
    const env = listPage(await run(params), params, 'freescout')
    expect(env.data.map((r) => r.id)).toEqual(range(40, prefix).slice(20))
    expect(env.meta.hasMore).toBe(true)
  })
})
