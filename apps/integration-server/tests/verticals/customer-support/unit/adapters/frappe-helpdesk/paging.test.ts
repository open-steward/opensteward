/**
 * Frappe Helpdesk list paging.
 *
 * Frappe Helpdesk exposes its DocTypes through the Frappe REST API
 * (https://docs.frappe.io/framework/user/en/api/rest):
 *
 *   "By default, it will return 20 records and will only fetch the name of
 *    the records."
 *   "You can also page the results by providing the limit_start and
 *    limit_page_length params."
 *
 * The debug example on the same page shows `limit_start` is a 0-based row
 * offset (`limit_start=10&limit=5` runs `limit 5 offset 10`). The response is
 * `{ data: [...] }` with no count and no next link, so the end of a
 * collection is a short page. The docs name no maximum page size.
 *
 * The fake honours ONLY `limit_start` and `limit_page_length`: anything else
 * about paging is ignored, a missing size is 20, a missing start is 0.
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
  type PageMaxBearing,
} from '@opensteward/shared'
import { FrappeHelpdeskAdapter } from '../../../../../../src/verticals/customer-support/adapters/frappe-helpdesk/index'

const creds: Credentials = {
  accessToken: 'key:secret',
  extra: { siteUrl: 'https://helpdesk.example.test' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let rowsFor: (path: string) => Array<Record<string, unknown>>

beforeEach(() => {
  calls = []
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
          const params = { ...(cfg?.params ?? {}) }
          calls.push({ path, params })
          const start = params['limit_start'] === undefined ? 0 : Number(params['limit_start'])
          const size =
            params['limit_page_length'] === undefined ? 20 : Number(params['limit_page_length'])
          return { data: { data: rowsFor(path).slice(start, start + size) } }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new FrappeHelpdeskAdapter()

type Lister = (params: QueryParams) => Promise<Array<{ id: string }>>

function rows(n: number, extra: (i: number) => Record<string, unknown>) {
  return Array.from({ length: n }, (_, i) => ({ name: `r${i}`, ...extra(i) }))
}

const METHODS: Array<{
  name: string
  doctype: string
  list: Lister
  extra: (i: number) => Record<string, unknown>
}> = [
  {
    name: 'listTickets',
    doctype: 'HD Ticket',
    list: (p) => adapter.listTickets(creds, p),
    extra: (i) => ({
      subject: `s${i}`,
      status: 'Open',
      priority: 'Low',
      creation: '2026-01-15 09:00:00',
      modified: '2026-01-15 09:00:00',
    }),
  },
  {
    name: 'listMessages',
    doctype: 'HD Ticket Comment',
    list: (p) => adapter.listMessages(creds, 'HD-TICKET-1', p),
    extra: (i) => ({
      reference_ticket: 'HD-TICKET-1',
      commented_by: 'agent@example.test',
      content: `c${i}`,
      creation: '2026-01-15 09:00:00',
      modified: '2026-01-15 09:00:00',
    }),
  },
  {
    name: 'listContacts',
    doctype: 'HD Customer',
    list: (p) => adapter.listContacts(creds, p),
    extra: (i) => ({ customer_name: `Customer ${i}` }),
  },
  {
    name: 'listUsers',
    doctype: 'HD Agent',
    list: (p) => adapter.listUsers(creds, p),
    extra: (i) => ({ agent_name: `Agent ${i}`, user: `a${i}@example.test`, is_active: 1 }),
  },
  {
    name: 'listTags',
    doctype: 'HD Ticket Priority',
    list: (p) => adapter.listTags(creds, p),
    extra: (i) => ({ description: `p${i}`, integer_value: i, disabled: 0 }),
  },
  {
    name: 'listTeams',
    doctype: 'HD Team',
    list: (p) => adapter.listTeams(creds, p),
    extra: (i) => ({ team_name: `Team ${i}`, disabled: 0 }),
  },
  {
    name: 'listMacros',
    doctype: 'HD Saved Reply',
    list: (p) => adapter.listMacros(creds, p),
    extra: (i) => ({ title: `Reply ${i}`, message: `m${i}` }),
  },
]

describe.each(METHODS)(
  'FrappeHelpdeskAdapter.$name pages by limit_start',
  ({ doctype, list, extra }) => {
    const L = 3
    const N = 2 * L + 1

    beforeEach(() => {
      const all = rows(N, extra)
      rowsFor = (path) => {
        if (decodeURIComponent(path) !== `/${doctype}`) throw new Error(`unexpected path ${path}`)
        return all
      }
    })

    it('serves every row once, in order, across pages 1..3, ending on the short page', async () => {
      const seen: string[] = []
      const hasMore: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const got = await list(params)
        seen.push(...got.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(Array.from({ length: N }, (_, i) => `r${i}`))
      // No count and no next link upstream: a full page reports nothing, the
      // short page is the documented end.
      expect(hasMore).toEqual([undefined, undefined, false])
    })

    it('sends limit_start = (page - 1) x limit and limit_page_length = limit on page 2', async () => {
      await list(withPageSink({ page: 2, limit: L }))
      expect(calls).toHaveLength(1)
      expect(calls[0]!.params['limit_start']).toBe(L)
      expect(calls[0]!.params['limit_page_length']).toBe(L)
    })

    it('reports the end on the empty page past the last row', async () => {
      const params = withPageSink({ page: 3, limit: L })
      const got = await list(params)
      expect(got.map((r) => r.id)).toEqual([`r${N - 1}`])
      const empty = withPageSink({ page: 4, limit: L })
      expect(await list(empty)).toEqual([])
      expect(readUpstreamPage(empty)?.hasMore).toBe(false)
    })

    it('serves pages 2 and 3 through parseListQuery and listPage on the API path', async () => {
      const p2 = parseListQuery({ page: '2', limit: String(L) }, adapter as PageMaxBearing)
      const env2 = listPage(await list(p2), p2, 'frappe-helpdesk')
      expect(env2.data.map((r) => r.id)).toEqual(['r3', 'r4', 'r5'])
      expect(calls.at(-1)!.params['limit_start']).toBe(L)

      const p3 = parseListQuery({ page: '3', limit: String(L) }, adapter as PageMaxBearing)
      const env3 = listPage(await list(p3), p3, 'frappe-helpdesk')
      expect(env3.data.map((r) => r.id)).toEqual(['r6'])
      expect(env3.meta.hasMore).toBe(false)
    })
  },
)

describe('FrappeHelpdeskAdapter page size', () => {
  it('declares no maxPageSize: the Frappe REST docs name no maximum', () => {
    expect(
      (adapter as { capabilities?: { maxPageSize?: number } }).capabilities?.maxPageSize,
    ).toBeUndefined()
  })

  it('sends a large caller limit through unchanged', async () => {
    rowsFor = () => rows(3, () => ({ team_name: 't', disabled: 0 }))
    await adapter.listTeams(creds, withPageSink({ page: 1, limit: 500 }))
    expect(calls[0]!.params['limit_page_length']).toBe(500)
    expect(calls[0]!.params['limit_start']).toBe(0)
  })
})

describe('FrappeHelpdeskAdapter legacy cursor offset', () => {
  beforeEach(() => {
    rowsFor = () => rows(10, () => ({ team_name: 't', disabled: 0 }))
  })

  it('reads a numeric cursor as a raw offset when no page is given', async () => {
    const res = await adapter.listTeams(creds, { limit: 3, cursor: '4' } as QueryParams)
    expect(calls[0]!.params['limit_start']).toBe(4)
    expect(calls[0]!.params['limit_page_length']).toBe(3)
    expect(res.map((r) => r.id)).toEqual(['r4', 'r5', 'r6'])
  })

  it('lets an explicit page win over a cursor', async () => {
    await adapter.listTeams(creds, withPageSink({ page: 2, limit: 3, cursor: '0' } as QueryParams))
    expect(calls[0]!.params['limit_start']).toBe(3)
  })
})
