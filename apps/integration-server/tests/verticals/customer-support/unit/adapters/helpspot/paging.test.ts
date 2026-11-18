/**
 * HelpSpot list paging.
 *
 * From https://support.helpspot.com/index.php?pg=kb.page&id=157 (API Field Definitions):
 *
 *   start:  "Result sets should start from this row, defaults to 0. Use this to paginate
 *            results in methods which support it."
 *   length: "Number of results to return in a result set."
 *
 * From https://support.helpspot.com/index.php?pg=kb.page&id=164 (Private Methods):
 *
 *   private.request.search lists `start` and `length` among its parameters and returns
 *   <requests> with no count or next marker, so a short page is the only end signal.
 *   private.addressbook.getContacts: "Retreives all contacts in the internal
 *     addressbook." ... "Parameters: none"
 *   private.util.getActiveStaff: "Return all currently active staff in the system and
 *     their information." ... "Parameters: none"
 *   private.request.getCategories: "Returns a list of all categories" ... "Parameters: none"
 *   private.response.listAll: "Return all your responses." ... "Parameters: None"
 *   private.request.get: "Return all information on a request." (request_history inline)
 *
 * No maximum `length` is documented, so the adapter declares none and the router's
 * default cap applies.
 *
 * The fake honours ONLY those parameters: `start`/`length` on private.request.search
 * (plus its documented filters), `xRequest` on private.request.get, and nothing on the
 * whole-collection methods, which refuse any other parameter.
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
import { HelpspotAdapter } from '../../../../../../src/verticals/customer-support/adapters/helpspot/index'

const creds: Credentials = {
  accessToken: 'hs_test',
  extra: { baseUrl: 'https://helpspot.example.test' },
}

interface Call {
  method: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let total = 0

const COMMON = new Set(['method', 'output'])
const SEARCH_PARAMS = new Set([...COMMON, 'start', 'length', 'fOpen', 'orderBy', 'orderByDir'])

/** HelpSpot's JSON lists as the adapter reads them: numeric keys "0", "1", … */
function numbered(rows: Record<string, unknown>[]): Record<string, unknown> {
  return Object.fromEntries(rows.map((r, i) => [String(i), r]))
}

function only(params: Record<string, unknown>, allowed: Set<string>): void {
  for (const k of Object.keys(params)) {
    if (!allowed.has(k)) throw new Error(`undocumented param ${k} on ${String(params['method'])}`)
  }
}

const ids = () => Array.from({ length: total }, (_, i) => i + 1)

function respond(params: Record<string, unknown>): unknown {
  const method = String(params['method'])
  switch (method) {
    case 'private.request.search': {
      only(params, SEARCH_PARAMS)
      const start = Number(params['start'] ?? 0)
      const length = params['length'] === undefined ? total : Number(params['length'])
      return numbered(
        ids()
          .slice(start, start + length)
          .map((id) => ({ xRequest: id, fOpen: 1 })),
      )
    }
    case 'private.request.get':
      only(params, new Set([...COMMON, 'xRequest']))
      return {
        xRequest: Number(params['xRequest']),
        request_history: ids().map((id) => ({ xRequestHistory: id, tNote: `n${id}` })),
      }
    case 'private.addressbook.getContacts':
      only(params, COMMON)
      return numbered(ids().map((id) => ({ xContact: id, sEmail: `c${id}@example.test` })))
    case 'private.util.getActiveStaff':
      only(params, COMMON)
      return numbered(ids().map((id) => ({ xPerson: id, sFname: 'S', sLname: `${id}` })))
    case 'private.request.getCategories':
      only(params, COMMON)
      return numbered(ids().map((id) => ({ xCategory: id, sCategory: `cat ${id}` })))
    case 'private.response.listAll':
      only(params, COMMON)
      return numbered(ids().map((id) => ({ xResponse: id, sResponseTitle: `r${id}` })))
    default:
      throw new Error(`unexpected method ${method}`)
  }
}

beforeEach(() => {
  calls = []
  total = 0
  vi.spyOn(axios, 'create').mockImplementation(() => {
    return {
      get: async (_path: string, cfg?: { params?: Record<string, unknown> }) => {
        const params = { ...(cfg?.params ?? {}) }
        calls.push({ method: String(params['method']), params })
        return { data: respond(params) }
      },
      post: vi.fn(),
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new HelpspotAdapter()

/** Each whole-collection method, and the id its n-th (1-based) row carries. */
const methods: {
  name: string
  method: string
  run: (p: QueryParams) => Promise<Array<{ id: string }>>
  idOf: (n: number) => string
}[] = [
  {
    name: 'listContacts',
    method: 'private.addressbook.getContacts',
    run: (p) => adapter.listContacts(creds, p),
    idOf: (n) => String(n),
  },
  {
    name: 'listUsers',
    method: 'private.util.getActiveStaff',
    run: (p) => adapter.listUsers(creds, p),
    idOf: (n) => String(n),
  },
  {
    name: 'listTeams',
    method: 'private.request.getCategories',
    run: (p) => adapter.listTeams(creds, p),
    idOf: (n) => String(n),
  },
  {
    name: 'listMacros',
    method: 'private.response.listAll',
    run: (p) => adapter.listMacros(creds, p),
    idOf: (n) => String(n),
  },
  {
    name: 'listMessages',
    method: 'private.request.get',
    run: (p) => adapter.listMessages(creds, '77', p),
    // Messages are keyed by the ticket and their 0-based place in request_history.
    idOf: (n) => `77:${n - 1}`,
  },
]

async function walk(run: (p: QueryParams) => Promise<Array<{ id: string }>>, limit: number) {
  const seen: string[] = []
  const reported: Array<boolean | undefined> = []
  const meta: Array<boolean | null | undefined> = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    seen.push(...rows.map((r) => r.id))
    reported.push(readUpstreamPage(params)?.hasMore)
    meta.push(listPage(rows, params, 'helpspot').meta.hasMore)
  }
  return { seen, reported, meta }
}

describe('helpspot listTickets pages by start + length', () => {
  const run = (p: QueryParams) => adapter.listTickets(creds, p)

  it('serves 2L+1 rows once, in order, over pages 1..3', async () => {
    const L = 4
    total = 2 * L + 1
    const { seen, meta } = await walk(run, L)
    expect(seen).toEqual(ids().map(String))
    // No count or next marker: a full page is unknown, the short page ends it.
    expect(meta).toEqual([null, null, false])
  })

  it('reports hasMore false on the short last page', async () => {
    total = 9
    const params = withPageSink({ page: 3, limit: 4 })
    await run(params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('page 2 sends start = limit and length = limit', async () => {
    total = 9
    await run(withPageSink({ page: 2, limit: 4 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toMatchObject({
      method: 'private.request.search',
      start: 4,
      length: 4,
      fOpen: 1,
      // No default search order is documented: offset pages need an explicit stable one.
      orderBy: 'xRequest',
      orderByDir: 'asc',
    })
  })

  it('without a limit, a short page at the default length still ends the walk', async () => {
    // DEFAULT_PAGE_SIZE is 50: a 3-row collection is a short page at that length,
    // whatever params.limit is (here undefined).
    total = 3
    const params = withPageSink({ page: 1 })
    const rows = await run(params)
    expect(rows).toHaveLength(3)
    expect(calls[0]!.params['length']).toBe(50)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a limit above the router cap is clamped (no HelpSpot maximum is documented)', async () => {
    total = 3
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    await run(params)
    expect(calls[0]!.params['length']).toBe(500)
    expect(calls[0]!.params['start']).toBe(0)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    total = 9
    const params = parseListQuery({ page: '2', limit: '4' })
    const env = listPage(await run(params), params, 'helpspot')
    expect(env.data.map((r) => r.id)).toEqual(['5', '6', '7', '8'])
    expect(calls[0]!.params['start']).toBe(4)
  })
})

for (const { name, method, run, idOf } of methods) {
  describe(`helpspot ${name} pages the whole collection locally`, () => {
    it('serves 2L+1 rows once, in order, over pages 1..3, with hasMore exact', async () => {
      const L = 4
      total = 2 * L + 1
      const { seen, reported, meta } = await walk(run, L)
      expect(seen).toEqual(ids().map(idOf))
      expect(reported).toEqual([true, true, false])
      expect(meta).toEqual([true, true, false])
    })

    it('sends no paging parameters (the method documents none)', async () => {
      total = 9
      await run(withPageSink({ page: 2, limit: 4 }))
      expect(calls).toHaveLength(1)
      expect(calls[0]!.method).toBe(method)
      expect(calls[0]!.params).not.toHaveProperty('start')
      expect(calls[0]!.params).not.toHaveProperty('length')
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
      const env = listPage(await run(params), params, 'helpspot')
      expect(env.data.map((r) => r.id)).toEqual(['5', '6', '7', '8'].map((n) => idOf(Number(n))))
      expect(env.meta.hasMore).toBe(true)
      expect(env.meta.totalCount).toBe(9)
    })
  })
}
