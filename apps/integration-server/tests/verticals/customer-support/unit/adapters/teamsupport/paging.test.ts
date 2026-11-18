/**
 * TeamSupport list paging.
 *
 * https://support.teamsupport.com/knowledgeBase/20136045 ("API Pagination"):
 *   "Pagination works with the following tables/urls: API Tickets Table
 *    Contacts Table Customer Table ..."
 *   "pageSize: Default value is 50. Specifies the maximum number of results
 *    returned per page."
 *   "pageNumber: Default value is 1. Specifies a specific page to return."
 *   "The results returned will include a TotalRecords element."
 * Users, Groups and ticket Actions are absent from that list, so they are
 * treated as unpaginated. Their endpoints come from the spreadsheet embedded
 * in https://support.teamsupport.com/knowledgeBase/20136023 ("API URLs"):
 *   "Groups,Lists all the groups." / "Users,Lists all the users." /
 *   "Tickets/{TicketID}/Actions,List actions for a ticket"
 *
 * The fake honours `pageNumber` + `pageSize` (default 50) ONLY on /tickets
 * and /contacts, and returns the whole list on /users, /groups and
 * /tickets/{id}/actions whatever the query says.
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
import { TeamsupportAdapter } from '../../../../../../src/verticals/customer-support/adapters/teamsupport/index'

const creds: Credentials = { accessToken: 'tok', extra: { orgId: '123' } }

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let handler: (call: Call) => unknown

beforeEach(() => {
  calls = []
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: async (path: string, config?: { params?: Record<string, unknown> }) => {
          const call = { path, params: { ...(config?.params ?? {}) } }
          calls.push(call)
          return { data: handler(call) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

/** A paginated TeamSupport table: pageNumber (default 1) × pageSize (default 50). */
function paged(key: string, n: number, total: number | string | null = n) {
  return (call: Call) => {
    const size = Number(call.params['pageSize'] ?? 50)
    const page = Number(call.params['pageNumber'] ?? 1)
    const rows = range(n)
      .slice((page - 1) * size, page * size)
      .map((id) => ({ ID: Number(id), Name: `n${id}` }))
    return total === null ? { [key]: rows } : { [key]: rows, TotalRecords: total }
  }
}

/** A table the API returns whole, ignoring any paging parameters. */
function whole(key: string, n: number) {
  return () => ({ [key]: range(n).map((id) => ({ ID: Number(id), Name: `n${id}` })) })
}

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const ids: string[] = []
  const hasMore: (boolean | null | undefined)[] = []
  const reportedHasMore: (boolean | undefined)[] = []
  const reportedTotal: (number | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    // The sync worker trusts the adapter's own report alone, so pin it directly:
    // listPage's envelope prefers totalCount and would hide a wrong hasMore.
    reportedHasMore.push(readUpstreamPage(params)?.hasMore)
    reportedTotal.push(readUpstreamPage(params)?.totalCount)
    hasMore.push(listPage(rows, params, 'teamsupport').meta.hasMore)
  }
  return { ids, hasMore, reportedHasMore, reportedTotal }
}

const adapter = new TeamsupportAdapter({})

type Run = (p: QueryParams) => Promise<{ id: string }[]>

const pagedMethods: [string, string, string, Run][] = [
  ['listTickets', '/api/json/tickets.json', 'Tickets', (p) => adapter.listTickets(creds, p)],
  ['listContacts', '/api/json/contacts.json', 'Contacts', (p) => adapter.listContacts(creds, p)],
]

for (const [method, path, key, run] of pagedMethods) {
  describe(`teamsupport ${method} paging`, () => {
    it('serves every row once, in order, across pages of 2L+1 rows', async () => {
      const L = 10
      handler = paged(key, 2 * L + 1)
      const { ids, hasMore, reportedHasMore, reportedTotal } = await walk(run, L)
      expect(ids).toEqual(range(2 * L + 1))
      expect(hasMore).toEqual([true, true, false])
      expect(reportedHasMore).toEqual([true, true, false])
      expect(reportedTotal).toEqual([21, 21, 21])
    })

    it('reports hasMore from TotalRecords when the total is an exact multiple', async () => {
      handler = paged(key, 20)
      const { ids, hasMore, reportedHasMore, reportedTotal } = await walk(run, 10)
      expect(ids).toEqual(range(20))
      expect(hasMore).toEqual([true, false, false])
      expect(reportedHasMore).toEqual([true, false, false])
      expect(reportedTotal).toEqual([20, 20, 20])
    })

    it('reads TotalRecords sent as a numeric string (the KB 20136020 sample shape)', async () => {
      handler = paged(key, 21, '21')
      const { ids, hasMore, reportedHasMore, reportedTotal } = await walk(run, 10)
      expect(ids).toEqual(range(21))
      expect(hasMore).toEqual([true, true, false])
      expect(reportedHasMore).toEqual([true, true, false])
      expect(reportedTotal).toEqual([21, 21, 21])
    })

    it('reports nothing for an unusable TotalRecords', async () => {
      for (const bad of [-1, '', 'n/a', 2.5]) {
        handler = paged(key, 21, bad)
        const params = withPageSink({ page: 1, limit: 10 })
        await run(params)
        expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
        expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
      }
    })

    it('still serves every row once when TotalRecords is absent', async () => {
      handler = paged(key, 21, null)
      const { ids, reportedHasMore } = await walk(run, 10)
      expect(ids).toEqual(range(21))
      expect(reportedHasMore).toEqual([undefined, undefined, undefined])
    })

    it('page 2 requests the documented pageNumber and pageSize', async () => {
      handler = paged(key, 500)
      await run(withPageSink({ page: 2, limit: 25 }))
      expect(calls).toHaveLength(1)
      expect(calls[0]!.path).toBe(path)
      expect(calls[0]!.params).toEqual({ pageNumber: 2, pageSize: 25 })
    })

    it('a limit above the maximum is clamped by the router', async () => {
      handler = paged(key, 600)
      const params = parseListQuery({ limit: '9999' })
      expect(params.limit).toBe(500)
      const rows = await run(params)
      expect(calls[0]!.params['pageSize']).toBe(500)
      expect(rows.map((r) => r.id)).toEqual(range(500))
      expect(listPage(rows, params, 'teamsupport').meta.hasMore).toBe(true)
    })

    it('API path: page 2 through parseListQuery and listPage', async () => {
      handler = paged(key, 41)
      const params = parseListQuery({ page: '2', limit: '20' })
      const env = listPage(await run(params), params, 'teamsupport')
      expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
      expect(env.meta.hasMore).toBe(true)
    })
  })
}

const wholeMethods: [string, string, string, Run][] = [
  ['listUsers', '/api/json/users.json', 'Users', (p) => adapter.listUsers(creds, p)],
  ['listTeams', '/api/json/groups.json', 'Groups', (p) => adapter.listTeams(creds, p)],
  [
    'listMessages',
    '/api/json/tickets/77/actions.json',
    'Actions',
    (p) => adapter.listMessages(creds, '77', p),
  ],
]

for (const [method, path, key, run] of wholeMethods) {
  describe(`teamsupport ${method} paging`, () => {
    it('serves every row once, in order, across pages of 2L+1 rows', async () => {
      const L = 5
      handler = whole(key, 2 * L + 1)
      const { ids, hasMore } = await walk(run, L)
      expect(ids).toEqual(range(2 * L + 1))
      expect(hasMore).toEqual([true, true, false])
    })

    it('requests the whole list, with no paging parameters', async () => {
      handler = whole(key, 3)
      await run(withPageSink({ page: 2, limit: 1 }))
      expect(calls).toHaveLength(1)
      expect(calls[0]!.path).toBe(path)
      expect(calls[0]!.params).toEqual({})
    })

    it('a limit above the maximum is clamped', async () => {
      handler = whole(key, 600)
      const params = parseListQuery({ limit: '9999' })
      const rows = await run(params)
      expect(rows).toHaveLength(500)
      expect(listPage(rows, params, 'teamsupport').meta.hasMore).toBe(true)
    })

    it('API path: page 2 through parseListQuery and listPage', async () => {
      handler = whole(key, 41)
      const params = parseListQuery({ page: '2', limit: '20' })
      const env = listPage(await run(params), params, 'teamsupport')
      expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
      expect(env.meta.hasMore).toBe(true)
    })
  })
}
