/**
 * movidesk list paging.
 *
 * The Movidesk API reference documents OData paging on /tickets, /persons and
 * /services: "$top: permite especificar o número de itens que devem ser
 * incluídos no retorno da consulta; $skip: permite especificar a quantidade de
 * itens que devem ser ignorados e não incluídos no retorno da consulta", with
 * `&$top=100&$skip=100` as the second page. "Conceito de $Skip e $top" caps a
 * request at 1000 rows ("O Movidesk trabalha com um limite de 1000 registros é
 * o máximo de request por consulta"). `$count` is not supported, so the
 * response carries no total and no next link.
 *
 * The fake below honours ONLY $top and $skip (at most 1000 rows) and
 * returns a plain array.
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
import { MovideskAdapter } from '../../../../../../src/verticals/customer-support/adapters/movidesk/index'

const creds: Credentials = { accessToken: 'tok' }

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

const MAX = 1000
const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

/** An OData collection: $skip, then $top (at most 1000 rows per request). */
function odata(n: number, row: (id: number) => Record<string, unknown>) {
  return (_path: string, params: Record<string, unknown>) => {
    const skip = Number(params['$skip'] ?? 0)
    const top = Math.min(params['$top'] === undefined ? MAX : Number(params['$top']), MAX)
    return Array.from({ length: n }, (_, i) => i + 1)
      .slice(skip, skip + top)
      .map(row)
  }
}

const ticket = (id: number) => ({
  id,
  subject: `t${id}`,
  status: 'Novo',
  baseStatus: 'New',
  createdDate: '2024-01-01T00:00:00',
})
const person = (profileType: number) => (id: number) => ({
  id: String(id),
  businessName: `p${id}`,
  profileType,
  personType: 1,
  emails: [{ email: `p${id}@x.test`, isDefault: true }],
})
const service = (id: number) => ({ id, name: `s${id}`, isActive: true })

type Row = { id: string }

const cases: {
  name: string
  path: string
  /** The non-paging OData params each method must still send. */
  query: Record<string, unknown>
  fake: (n: number) => (path: string, params: Record<string, unknown>) => unknown
  run: (a: MovideskAdapter, p: QueryParams) => Promise<Row[]>
}[] = [
  {
    name: 'listTickets',
    path: '/tickets',
    query: {
      $select: expect.stringContaining('id,protocol'),
      $expand: expect.stringContaining('clients('),
    },
    fake: (n) => odata(n, ticket),
    run: (a, p) => a.listTickets(creds, p),
  },
  {
    name: 'listContacts',
    path: '/persons',
    query: { $filter: 'profileType eq 2', $expand: 'emails,contacts' },
    fake: (n) => odata(n, person(2)),
    run: (a, p) => a.listContacts(creds, p),
  },
  {
    name: 'listUsers',
    path: '/persons',
    query: { $filter: 'profileType eq 1', $expand: 'emails,teams' },
    fake: (n) => odata(n, person(1)),
    run: (a, p) => a.listUsers(creds, p),
  },
  {
    name: 'listTags',
    path: '/services',
    query: {},
    fake: (n) => odata(n, service),
    run: (a, p) => a.listTags(creds, p),
  },
]

for (const { name, path, query, fake, run: runOn } of cases) {
  describe(`movidesk ${name} paging ($top/$skip on ${path})`, () => {
    const adapter = new MovideskAdapter()
    const run = (p: QueryParams) => runOn(adapter, p)

    async function walk(n: number, limit: number) {
      handler = fake(n)
      const out: string[] = []
      const hasMore: (boolean | null)[] = []
      const reported: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit })
        const rows = await run(params)
        out.push(...rows.map((r) => r.id))
        reported.push(readUpstreamPage(params)?.hasMore)
        hasMore.push(listPage(rows, params, 'movidesk').meta.hasMore)
      }
      return { ids: out, hasMore, reported }
    }

    // No $count and no next link: a full page is unknown (null), never a
    // guessed true; the short page ends the list.
    it('serves every row once, in order, across pages of 2L+1 rows; the short page ends it', async () => {
      const L = 5
      const { ids, hasMore, reported } = await walk(2 * L + 1, L)
      expect(ids).toEqual(range(2 * L + 1))
      expect(hasMore).toEqual([null, null, false])
      expect(reported).toEqual([undefined, undefined, false])
    })

    it('an exact multiple ends on the empty page after it', async () => {
      const { ids, hasMore } = await walk(10, 5)
      expect(ids).toEqual(range(10))
      expect(hasMore).toEqual([null, null, false])
    })

    it('page 2 requests $skip=L with $top=L', async () => {
      handler = fake(11)
      const params = withPageSink({ page: 2, limit: 5 })
      await run(params)
      expect(calls).toHaveLength(1)
      expect(calls[0]!.path).toBe(path)
      expect(calls[0]!.params['$skip']).toBe(5)
      expect(calls[0]!.params['$top']).toBe(5)
      expect(readUpstreamPage(params)?.pageSize).toBe(5)
      // Paging must not drop the method's own filter/select/expand.
      expect(calls[0]!.params).toEqual({ token: 'tok', $top: 5, $skip: 5, ...query })
    })

    it('an invalid limit falls back to the default page size (100)', async () => {
      handler = fake(150)
      for (const limit of [0, -3, Number.NaN]) {
        calls = []
        await run(withPageSink({ page: 2, limit }))
        expect(calls[0]!.params['$top']).toBe(100)
        expect(calls[0]!.params['$skip']).toBe(100)
      }
    })

    it('an explicit cursor is sent as the $skip offset', async () => {
      handler = fake(20)
      const rows = await run({ limit: 5, cursor: '7' } as QueryParams)
      expect(calls[0]!.params['$skip']).toBe(7)
      expect(rows.map((r) => r.id)).toEqual(['8', '9', '10', '11', '12'])
    })

    it('a limit above the maximum is clamped', async () => {
      handler = fake(1200)
      const routed = parseListQuery({ limit: '9999' })
      expect(routed.limit).toBe(500)
      const rows = await run(routed)
      expect(rows).toHaveLength(500)
      expect(calls[0]!.params['$top']).toBe(500)

      calls = []
      const direct = withPageSink({ page: 1, limit: 9999 })
      const all = await run(direct)
      expect(calls[0]!.params['$top']).toBe(MAX)
      expect(all).toHaveLength(MAX)
      expect(readUpstreamPage(direct)?.pageSize).toBe(MAX)
    })

    it('API path: page 2 through parseListQuery and listPage', async () => {
      handler = fake(11)
      const params = parseListQuery({ page: '2', limit: '5' })
      const env = listPage(await run(params), params, 'movidesk')
      expect(env.data.map((r) => r.id)).toEqual(['6', '7', '8', '9', '10'])
      expect(env.meta.hasMore).toBeNull()
    })
  })
}
