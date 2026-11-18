/**
 * Libredesk listTags paging.
 *
 * From https://github.com/abhinavxd/libredesk/blob/v2.8.0/cmd/tags.go (latest release):
 *
 *   "// handleGetTags returns all tags from the database."
 *
 * and it reads no query parameters. On main
 * (https://github.com/abhinavxd/libredesk/blob/main/cmd/tags.go):
 *
 *   "// handleGetTags returns tags from the database, all of them without page params."
 *
 * So GET /api/v1/tags without page params returns the whole collection on every
 * version, as a bare array with no total: the adapter pages it locally.
 *
 * The fake honours ONLY what v2.8.0 documents: no query parameters at all.
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
import { LibredeskAdapter } from '../../../../../../src/verticals/customer-support/adapters/libredesk/index'

const creds: Credentials = {
  accessToken: 'ld_test',
  extra: { baseUrl: 'https://libredesk.example.test' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let total = 0

const ids = () => Array.from({ length: total }, (_, i) => i + 1)

function respond(path: string, params: Record<string, unknown>): unknown {
  if (path !== '/tags') throw new Error(`unexpected path ${path}`)
  const keys = Object.keys(params)
  if (keys.length > 0) throw new Error(`undocumented params on /tags: ${keys.join(',')}`)
  return { status: 'success', data: ids().map((id) => ({ id, name: `tag ${id}` })) }
}

beforeEach(() => {
  calls = []
  total = 0
  vi.spyOn(axios, 'create').mockImplementation(() => {
    return {
      get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        const params = { ...(cfg?.params ?? {}) }
        calls.push({ path, params })
        return { data: respond(path, params) }
      },
      post: vi.fn(),
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new LibredeskAdapter()
const run = (p: QueryParams) => adapter.listTags(creds, p)

describe('libredesk listTags pages the whole collection locally', () => {
  it('serves 2L+1 rows once, in order, over pages 1..3, with hasMore exact', async () => {
    const L = 4
    total = 2 * L + 1
    const seen: string[] = []
    const reported: Array<boolean | undefined> = []
    const meta: Array<boolean | null | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await run(params)
      seen.push(...rows.map((r) => r.id))
      reported.push(readUpstreamPage(params)?.hasMore)
      meta.push(listPage(rows, params, 'libredesk').meta.hasMore)
    }
    expect(seen).toEqual(ids().map(String))
    expect(reported).toEqual([true, true, false])
    expect(meta).toEqual([true, true, false])
  })

  it('the page-2 request sends no paging parameters (the release documents none)', async () => {
    total = 9
    await run(withPageSink({ page: 2, limit: 4 }))
    expect(calls).toEqual([{ path: '/tags', params: {} }])
  })

  it('a limit above the router cap is clamped', async () => {
    total = 600
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows).toHaveLength(500)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    total = 9
    const params = parseListQuery({ page: '2', limit: '4' })
    const env = listPage(await run(params), params, 'libredesk')
    expect(env.data.map((r) => r.id)).toEqual(['5', '6', '7', '8'])
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(9)
  })
})
