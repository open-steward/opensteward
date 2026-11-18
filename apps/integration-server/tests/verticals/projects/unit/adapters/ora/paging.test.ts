/**
 * Ora list paging: the list methods serve the caller's page `page` at `limit`.
 *
 * Ora's own Swagger spec (https://api.ora.pm/swagger.json, rendered at
 * https://api.ora.pm) gives GET /projects/{project_id}/tasks, /labels and
 * /members two query parameters: `offset`, "Number of items already
 * displayed", and `limit`, "Number of items per page". It documents no total,
 * no next link and no maximum, so a page shorter than `limit` is the end. The
 * adapter sent `per_page`, which Ora does not document, and read the page
 * from `params.cursor`, which the router never sets, so page 2 was page 1.
 *
 * GET /projects ("Get projects") documents no query parameters at all: the
 * whole collection, paged locally.
 *
 * The fake upstream below honours ONLY the documented parameters and rejects
 * anything else, answering at axios's transport.
 */
import { afterEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { OraAdapter } from '../../../../../../src/verticals/projects/adapters/ora/index'

const ORIGIN = 'https://api.ora.pm'
const PROJECT = '42'
const OFFSET_PATHS: Record<string, string> = {
  [`/projects/${PROJECT}/tasks`]: 't',
  [`/projects/${PROJECT}/labels`]: 'l',
  [`/projects/${PROJECT}/members`]: 'u',
}
const OFFSET_PARAMS = new Set(['offset', 'limit'])

const adapter = new OraAdapter()
const CREDS = { accessToken: 'ora_test' }

let seen: URL[] = []
let rowCount = 0
const realAdapter = axios.defaults.adapter

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const ids = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

function fakeOra(n: number): void {
  seen = []
  rowCount = n
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    if (url.origin !== ORIGIN) throw httpError(404, { msg: `no host ${url.origin}` })
    const q = url.searchParams
    let data: unknown
    const prefix = OFFSET_PATHS[url.pathname]
    if (prefix !== undefined) {
      for (const k of q.keys()) if (!OFFSET_PARAMS.has(k)) throw httpError(400, { msg: k })
      const offset = Number(q.get('offset') ?? 0)
      const limit = q.has('limit') ? Number(q.get('limit')) : rowCount
      data = ids(prefix, rowCount)
        .slice(offset, offset + limit)
        .map((id) => ({ id, name: id, title: id }))
    } else if (url.pathname === '/projects') {
      if ([...q.keys()].length > 0) throw httpError(400, { msg: 'no query parameters' })
      data = ids('p', rowCount).map((id) => ({ id, name: id }))
    } else {
      throw httpError(404, { msg: `no route ${url.pathname}` })
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type Method = 'listProjects' | 'listTasks' | 'listTags' | 'listUsers'

async function call(method: Method, params: QueryParams): Promise<string[]> {
  switch (method) {
    case 'listProjects':
      return (await adapter.listProjects(CREDS, params)).map((r) => r.id)
    case 'listTasks':
      return (await adapter.listTasks(CREDS, PROJECT, params)).map((r) => r.id)
    case 'listTags':
      return (await adapter.listTags(CREDS, PROJECT, params)).map((r) => r.id)
    case 'listUsers':
      return (await adapter.listUsers(CREDS, PROJECT, params)).map((r) => r.id)
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

const METHODS: Array<[Method, string]> = [
  ['listProjects', 'p'],
  ['listTasks', 't'],
  ['listTags', 'l'],
  ['listUsers', 'u'],
]

describe.each(METHODS)('ora %s serves the caller page', (method, prefix) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    fakeOra(2 * L + 1)
    const all = ids(prefix, 2 * L + 1)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('serves every row once at the sync worker page size', async () => {
    fakeOra(1234)
    const out: string[] = []
    for (let page = 1; page < 50; page++) {
      const { ids: got, hasMore } = await syncPage(method, page, 500)
      out.push(...got)
      if (hasMore === false) break
      expect(hasMore).toBe(true)
    }
    expect(out).toEqual(ids(prefix, 1234))
  })

  it('pages through the API path', async () => {
    fakeOra(21)
    const params = parseListQuery({ limit: '10', page: '2' }) // no declared maximum
    const env = listPage(await call(method, params), params, 'ora')
    expect(env.data).toEqual(ids(prefix, 21).slice(10, 20))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe.each(METHODS.filter(([m]) => m !== 'listProjects'))(
  'ora %s pages by offset + limit',
  (method) => {
    it('sends the documented offset and limit on page 2', async () => {
      fakeOra(21)
      await syncPage(method, 2, 10)
      expect(seen).toHaveLength(1)
      expect(seen[0]!.searchParams.get('offset')).toBe('10')
      expect(seen[0]!.searchParams.get('limit')).toBe('10')
    })

    it('falls back to a page of 50 when no limit is given', async () => {
      fakeOra(120)
      const params = withPageSink({ page: 2 })
      const got = await call(method, params)
      expect(seen[0]!.searchParams.get('offset')).toBe('50')
      expect(seen[0]!.searchParams.get('limit')).toBe('50')
      expect(got).toHaveLength(50)
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    })

    it('passes a large limit through, since Ora documents no maximum', async () => {
      fakeOra(2500)
      const got = await syncPage(method, 1, 2000)
      expect(got.ids).toHaveLength(2000)
      expect(got.hasMore).toBe(true)
      expect(seen[0]!.searchParams.get('limit')).toBe('2000')
    })
  },
)

describe('ora listProjects is paged locally', () => {
  it('fetches the whole list once and reports pagedLocally and the total', async () => {
    fakeOra(5)
    const params = withPageSink({ page: 2, limit: 2 })
    expect(await call('listProjects', params)).toEqual(['p3', 'p4'])
    expect(readUpstreamPage(params)).toMatchObject({
      pagedLocally: true,
      totalCount: 5,
      hasMore: true,
    })
    expect(seen).toHaveLength(1)
    expect([...seen[0]!.searchParams.keys()]).toEqual([])
  })
})
