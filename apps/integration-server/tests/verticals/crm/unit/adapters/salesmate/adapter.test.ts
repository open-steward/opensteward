import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { SalesmateAdapter } from '../../../../../../src/verticals/crm/adapters/salesmate/index'
import { ContactSchema } from '../../../../../../src/verticals/crm/schema/contact'
import { CompanySchema } from '../../../../../../src/verticals/crm/schema/company'
import { DealSchema } from '../../../../../../src/verticals/crm/schema/deal'
import { ActivitySchema } from '../../../../../../src/verticals/crm/schema/activity'

/**
 * Salesmate v4, per the first-party Postman collection behind
 * https://apidocs.salesmate.io/:
 *
 *   POST https://link_name.salesmate.io/apis/contact/v4/search?rows=250&from=0
 *   POST https://link_name.salesmate.io/apis/company/v4/search?rows=250&from=0
 *   POST https://link_name.salesmate.io/apis/deal/v4/search
 *   POST https://link_name.salesmate.io/apis/activity/v4/search?rows=250&from=0&viewType=list
 *   headers: x-linkname: link_name.salesmate.io, accessToken: {{sessionToken}}
 *   "A maximum of 250 records will be fetched in one request."
 *   "from (integer): The starting index of the records returned."
 *   → { "Status": "success", "Data": { "data": [...], "totalRows", "totalPages" } }
 */

const creds = { accessToken: 'sess-tok', extra: { linkname: 'acme' } }
const HOST = 'acme.salesmate.io'
const DOC_MAX = 250

interface Req {
  method: string
  url: URL
  headers: Record<string, string>
  body: Record<string, unknown> | undefined
}
let requests: Req[] = []

type ListMethod = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities'

const CASES: Array<{
  method: ListMethod
  module: string
  moduleId: number
  moduleName: string
  row: (i: number) => Record<string, unknown>
  schema: { parse: (v: unknown) => unknown }
}> = [
  {
    method: 'listContacts',
    module: 'contact',
    moduleId: 1,
    moduleName: 'Contact',
    row: (i) => ({ id: i, name: `Contact ${i}`, email: '', owner: { id: 1 } }),
    schema: ContactSchema,
  },
  {
    method: 'listCompanies',
    module: 'company',
    moduleId: 5,
    moduleName: 'Company',
    row: (i) => ({ id: i, name: `Company ${i}`, owner: { id: 1 } }),
    schema: CompanySchema,
  },
  {
    method: 'listDeals',
    module: 'deal',
    moduleId: 4,
    moduleName: 'Deal',
    row: (i) => ({ id: i, title: `Deal ${i}`, dealValue: 10, currency: 'USD', status: 'Open' }),
    schema: DealSchema,
  },
  {
    method: 'listActivities',
    module: 'activity',
    moduleId: 2,
    moduleName: 'Task',
    row: (i) => ({ id: i, title: `Call ${i}`, type: 'Call', isCompleted: false }),
    schema: ActivitySchema,
  },
]

function headersOf(init: RequestInit | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
    out[k.toLowerCase()] = v
  }
  return out
}

/**
 * A fake Salesmate that honours only what the docs name: POST to the
 * module's search path on the account host, the accessToken and x-linkname
 * headers, and the `rows` (≤ 250) / `from` query parameters. Anything else
 * is ignored or refused.
 */
function serve(module: string, total: number, row: (i: number) => Record<string, unknown>) {
  const rows = Array.from({ length: total }, (_, i) => row(i + 1))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      const headers = headersOf(init)
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined
      requests.push({ method: init?.method ?? 'GET', url, headers, body })
      if (
        url.host !== HOST ||
        headers['x-linkname'] !== HOST ||
        headers['accesstoken'] !== 'sess-tok'
      ) {
        return new Response(
          JSON.stringify({ Status: 'failure', Error: { Code: '401', Message: 'auth' } }),
          { status: 401 },
        )
      }
      if (init?.method !== 'POST' || url.pathname !== `/apis/${module}/v4/search`) {
        return new Response('not found', { status: 404 })
      }
      const size = Math.min(Number(url.searchParams.get('rows') ?? 25), DOC_MAX)
      const from = Number(url.searchParams.get('from') ?? 0)
      const page = rows.slice(from, from + size)
      return new Response(
        JSON.stringify({
          Status: 'success',
          Data: {
            data: page,
            selectedView: 25,
            totalRows: rows.length,
            totalPages: Math.ceil(rows.length / size),
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }),
  )
}

function call(method: string, params: QueryParams, c: typeof creds = creds) {
  const adapter = new SalesmateAdapter() as unknown as Record<
    string,
    (c: unknown, p: QueryParams) => Promise<Array<{ id: string }>>
  >
  return adapter[method]!.call(adapter, c, params)
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(CASES)(
  'salesmate $method',
  ({ method, module, moduleId, moduleName, row, schema }) => {
    it('walks 2L+1 rows across pages 1..3, each id once, with exact hasMore', async () => {
      const L = 3
      serve(module, 2 * L + 1, row)
      const seen: string[] = []
      const hasMore: Array<boolean | undefined> = []
      const totals: Array<number | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const out = await call(method, params)
        for (const r of out) schema.parse(r)
        seen.push(...out.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
        totals.push(readUpstreamPage(params)?.totalCount)
      }
      expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
      expect(hasMore).toEqual([true, true, false])
      expect(totals).toEqual([7, 7, 7])
    })

    it('POSTs the documented search path with rows = limit and from = (page - 1) × limit', async () => {
      serve(module, 20, row)
      await call(method, withPageSink({ page: 3, limit: 4 }))
      const req = requests.at(-1)!
      expect(req.method).toBe('POST')
      expect(req.url.origin).toBe(`https://${HOST}`)
      expect(req.url.pathname).toBe(`/apis/${module}/v4/search`)
      expect(req.url.searchParams.get('rows')).toBe('4')
      expect(req.url.searchParams.get('from')).toBe('8')
    })

    it('sends the documented auth headers, not Access-Key', async () => {
      serve(module, 1, row)
      await call(method, withPageSink({ page: 1, limit: 5 }))
      const h = requests[0]!.headers
      expect(h['accesstoken']).toBe('sess-tok')
      expect(h['x-linkname']).toBe(HOST)
      expect(h['access-key']).toBeUndefined()
    })

    it('posts the documented search body for the module, sorted by id', async () => {
      serve(module, 1, row)
      await call(method, withPageSink({ page: 1, limit: 5 }))
      const body = requests[0]!.body!
      expect(body['moduleId']).toBe(moduleId)
      expect(body['reportType']).toBe('get_data')
      expect(body['getRecordsCount']).toBe(true)
      expect(body['sort']).toEqual({ fieldName: `${module}.id`, order: 'asc' })
      const rule = (body['filterQuery'] as { group: { rules: Array<Record<string, unknown>> } })
        .group.rules[0]!
      expect(rule['moduleName']).toBe(moduleName)
      expect(rule['condition']).toBe('IS_AFTER')
      for (const f of body['displayingFields'] as string[])
        expect(f.startsWith(`${module}.`)).toBe(true)
    })

    it('clamps rows to the documented 250 and reports the size it sent', async () => {
      serve(module, 600, row)
      const params = withPageSink({ page: 2, limit: 400 })
      const out = await call(method, params)
      const req = requests.at(-1)!
      expect(req.url.searchParams.get('rows')).toBe('250')
      expect(req.url.searchParams.get('from')).toBe('250')
      expect(out.map((r) => r.id)[0]).toBe('251')
      expect(readUpstreamPage(params)?.pageSize).toBe(250)
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    })

    it('throws on a Status: failure body even when the HTTP status is 200', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                Status: 'failure',
                Error: { Code: '4001', Name: 'ValidationError', Message: 'Title is required' },
              }),
              { status: 200 },
            ),
        ),
      )
      await expect(call(method, withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(
        /Title is required/,
      )
    })
  },
)

describe('salesmate listActivities', () => {
  it('sends the documented viewType=list', async () => {
    serve('activity', 1, CASES[3]!.row)
    await call('listActivities', withPageSink({ page: 1, limit: 5 }))
    expect(requests[0]!.url.searchParams.get('viewType')).toBe('list')
  })
})

describe('salesmate listDeals', () => {
  it('sends the documented empty pipeline field', async () => {
    serve('deal', 1, CASES[2]!.row)
    await call('listDeals', withPageSink({ page: 1, limit: 5 }))
    expect(requests[0]!.body!['pipeline']).toBe('')
  })
})

describe('salesmate refusals', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        requests.push({ method: 'GET', url: new URL(input), headers: {}, body: undefined })
        return new Response('{}', { status: 200 })
      }),
    )
  })

  it.each(['listPipelines', 'listNotes'])(
    '%s throws 501 NOT_SUPPORTED and sends nothing',
    async (m) => {
      await expect(call(m, withPageSink({ page: 1, limit: 10 }))).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
      expect(requests).toHaveLength(0)
    },
  )

  it('getNote throws 501 NOT_SUPPORTED and sends nothing', async () => {
    const adapter = new SalesmateAdapter()
    await expect(adapter.getNote(creds, '245')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(requests).toHaveLength(0)
  })
})

describe('salesmate get methods', () => {
  function serveOne(data: Record<string, unknown>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        requests.push({
          method: init?.method ?? 'GET',
          url: new URL(input),
          headers: headersOf(init),
          body: undefined,
        })
        return new Response(JSON.stringify({ Status: 'success', Data: data }), { status: 200 })
      }),
    )
  }

  it.each([
    ['getContact', 'contact', { id: 40, name: 'Chaitali updated Chouhan' }],
    ['getCompany', 'company', { id: 371, name: 'Salesmate' }],
    ['getDeal', 'deal', { id: 341, title: 'Bags Deal with VIP' }],
    ['getActivity', 'activity', { id: 589, title: 'Call Engineer' }],
  ] as const)('%s reads GET /apis/%s/v4/{id} and unwraps Data', async (m, module, data) => {
    serveOne(data)
    const adapter = new SalesmateAdapter() as unknown as Record<
      string,
      (c: unknown, id: string) => Promise<{ id: string }>
    >
    const out = await adapter[m]!.call(adapter, creds, String(data.id))
    expect(out.id).toBe(String(data.id))
    const req = requests[0]!
    expect(req.method).toBe('GET')
    expect(req.url.toString()).toBe(`https://${HOST}/apis/${module}/v4/${data.id}`)
    expect(req.headers['accesstoken']).toBe('sess-tok')
    expect(req.headers['x-linkname']).toBe(HOST)
  })
})

describe('salesmate credentials', () => {
  it('collects the link name and session token', async () => {
    const adapter = new SalesmateAdapter()
    const names = adapter.credentialFields().map((f) => f.name)
    expect(names).toEqual(['linkname', 'accessToken'])
    await expect(
      adapter.exchangeCredentials({ linkname: 'https://Acme.salesmate.io/', accessToken: ' t ' }),
    ).resolves.toEqual({ accessToken: 't', extra: { linkname: 'acme' } })
  })

  it('rejects a link name that would change the host', async () => {
    const adapter = new SalesmateAdapter()
    await expect(
      adapter.exchangeCredentials({ linkname: 'evil.com/x', accessToken: 't' }),
    ).rejects.toThrow(/link name/)
  })

  it('refuses before sending when the connection has no link name', async () => {
    serve('contact', 1, CASES[0]!.row)
    await expect(
      call('listContacts', withPageSink({ page: 1, limit: 5 }), {
        accessToken: 't',
        extra: {},
      } as never),
    ).rejects.toThrow(/linkname is required/)
    expect(requests).toHaveLength(0)
  })
})

/**
 * The documented "all records" rule. Search contacts, Search a Company
 * (originalRequest) and Search a deal each post exactly this rule for their
 * module: {"condition":"IS_AFTER","moduleName":"Contact","field":{"fieldName":
 * "contact.createdAt","displayName":"Created At","type":"DateTime"},"data":
 * "Jan 01, 1970 05:30 AM","eventType":"DateTime"}. The activity search
 * documents only an overdue-tasks filter, so its rule is this one written for
 * moduleName "Task" and `activity.createdAt` (a documented search column).
 */
function allRecordsRule(module: string, moduleName: string) {
  return {
    group: {
      operator: 'AND',
      rules: [
        {
          condition: 'IS_AFTER',
          moduleName,
          field: { fieldName: `${module}.createdAt`, displayName: 'Created At', type: 'DateTime' },
          data: 'Jan 01, 1970 05:30 AM',
          eventType: 'DateTime',
        },
      ],
    },
  }
}

const DISPLAYING_FIELDS: Record<string, string[]> = {
  contact: [
    'contact.id',
    'contact.name',
    'contact.firstName',
    'contact.lastName',
    'contact.email',
    'contact.phone',
    'contact.mobile',
    'contact.designation',
    'contact.company.id',
    'contact.owner.id',
    'contact.createdAt',
    'contact.lastModifiedAt',
  ],
  company: [
    'company.id',
    'company.name',
    'company.phone',
    'company.owner.id',
    'company.createdAt',
    'company.lastModifiedAt',
  ],
  deal: [
    'deal.id',
    'deal.title',
    'deal.dealValue',
    'deal.currency',
    'deal.status',
    'deal.stage',
    'deal.pipeline',
    'deal.primaryContact.id',
    'deal.primaryCompany.id',
    'deal.owner.id',
    'deal.estimatedCloseDate',
    'deal.createdAt',
    'deal.lastModifiedAt',
  ],
  activity: [
    'activity.id',
    'activity.title',
    'activity.type',
    'activity.description',
    'activity.isCompleted',
    'activity.primaryContact.id',
    'activity.primaryCompany.id',
    'activity.relatedTo.id',
    'activity.owner.id',
    'activity.createdAt',
    'activity.lastModifiedAt',
  ],
}

function stubJson(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
  )
}

describe.each(CASES)(
  'salesmate $method request and answer guards',
  ({ method, module, moduleName, row }) => {
    it('posts the documented all-records filter, unchanged', async () => {
      serve(module, 1, row)
      await call(method, withPageSink({ page: 1, limit: 5 }))
      expect(requests[0]!.body!['filterQuery']).toEqual(allRecordsRule(module, moduleName))
    })

    it('asks for the columns the transform reads', async () => {
      serve(module, 1, row)
      await call(method, withPageSink({ page: 1, limit: 5 }))
      expect(requests[0]!.body!['displayingFields']).toEqual(DISPLAYING_FIELDS[module])
    })

    it('sends the documented Content-Type: application/json', async () => {
      serve(module, 1, row)
      await call(method, withPageSink({ page: 1, limit: 5 }))
      expect(requests[0]!.headers['content-type']).toBe('application/json')
    })

    it('asks for the documented 250 when the caller gives no limit', async () => {
      serve(module, 3, row)
      const params = withPageSink({ page: 1 })
      await call(method, params)
      expect(requests[0]!.url.searchParams.get('rows')).toBe('250')
      expect(requests[0]!.url.searchParams.get('from')).toBe('0')
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('reports hasMore false on a full last page (a walk over exactly 2L rows)', async () => {
      const L = 3
      serve(module, 2 * L, row)
      const seen: string[] = []
      const hasMore: Array<boolean | undefined> = []
      for (const page of [1, 2]) {
        const params = withPageSink({ page, limit: L })
        const out = await call(method, params)
        seen.push(...out.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(['1', '2', '3', '4', '5', '6'])
      expect(hasMore).toEqual([true, false])
    })

    it('throws, rather than serving an empty page, when a success has no Data', async () => {
      stubJson({ Status: 'success' })
      await expect(call(method, withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/Data/)
    })

    it('throws, rather than serving an empty page, when Data has no data array', async () => {
      stubJson({ Status: 'success', Data: { totalRows: 4 } })
      await expect(call(method, withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/Data\.data/)
    })

    it('throws when the server returns more rows than it was asked for (page size ignored)', async () => {
      stubJson({
        Status: 'success',
        Data: { data: [row(1), row(2), row(3)], totalRows: 9, totalPages: 1 },
      })
      await expect(call(method, withPageSink({ page: 2, limit: 2 }))).rejects.toThrow(
        /page size was not applied/,
      )
    })
  },
)

describe('salesmate get guards', () => {
  it('throws when a GET success has no Data instead of transforming the envelope', async () => {
    stubJson({ Status: 'success' })
    await expect(new SalesmateAdapter().getContact(creds, '40')).rejects.toThrow(/Data/)
  })
})
