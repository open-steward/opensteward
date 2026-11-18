/**
 * Oracle CX reads outside paging.
 *
 * - get*: the documented item paths are keyed by PartyNumber / OptyNumber /
 *   ActivityNumber (e.g. op-contacts-partynumber-get.html: "get
 *   /crmRestApi/resources/11.13.18.05/contacts/{PartyNumber}"), while the list
 *   methods return the integer PartyId / OptyId / ActivityId. The read-back
 *   filters the collection with the documented `q` parameter ("This query
 *   parameter defines the where clause") on that queryable integer key.
 * - listDeals refuses: the opportunities collection is filtered by default to
 *   "only open opportunities (Status = OPEN)" of "the currently logged in user"
 *   in the current fiscal quarter. getDeal uses the documented "PrimaryKey"
 *   finder instead of that collection.
 * - listNotes / getNote: there is no top-level notes resource (openapi.json has
 *   no `/notes` path; notes are child collections such as
 *   "/crmRestApi/resources/11.13.18.05/accounts/{PartyNumber}/child/Note").
 * - fields=: every list and get sends only attributes the item schema names.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { OracleCxAdapter } from '../../../../../../src/verticals/crm/adapters/oracle-cx'
import { CONTACT_FIELDS } from '../../../../../../src/verticals/crm/adapters/oracle-cx/transform/contact'
import { COMPANY_FIELDS } from '../../../../../../src/verticals/crm/adapters/oracle-cx/transform/company'
import { DEAL_FIELDS } from '../../../../../../src/verticals/crm/adapters/oracle-cx/transform/deal'
import { ACTIVITY_FIELDS } from '../../../../../../src/verticals/crm/adapters/oracle-cx/transform/activity'
import { ContactSchema } from '../../../../../../src/verticals/crm/schema/contact'
import { CompanySchema } from '../../../../../../src/verticals/crm/schema/company'
import { DealSchema } from '../../../../../../src/verticals/crm/schema/deal'
import { ActivitySchema } from '../../../../../../src/verticals/crm/schema/activity'

const BASE = 'https://instance.example.test'
const CREDS: Credentials = { accessToken: 'at-1', extra: { instanceUrl: BASE } }

/** Parses a get* result against that resource's canonical schema. */
function parseGet(method: GetMethod, value: unknown): { id: string } {
  switch (method) {
    case 'getContact':
      return ContactSchema.parse(value)
    case 'getCompany':
      return CompanySchema.parse(value)
    case 'getActivity':
      return ActivitySchema.parse(value)
  }
}

const RESOURCES = {
  getContact: {
    path: 'contacts',
    key: 'PartyId',
    fields: CONTACT_FIELDS,
    extra: { FirstName: 'Lisa' },
  },
  getCompany: {
    path: 'accounts',
    key: 'PartyId',
    fields: COMPANY_FIELDS,
    extra: { OrganizationName: 'High Technology_102304669' },
  },
  getActivity: {
    path: 'activities',
    key: 'ActivityId',
    fields: ACTIVITY_FIELDS,
    extra: { Subject: 'ghgh' },
  },
} as const
type GetMethod = keyof typeof RESOURCES

const LISTS = {
  listContacts: CONTACT_FIELDS,
  listCompanies: COMPANY_FIELDS,
  listActivities: ACTIVITY_FIELDS,
} as const

interface Sent {
  path: string
  query: Record<string, string>
}
let sent: Sent[] = []
/** Rows the fake holds, keyed by collection. Each row has its integer key. */
let rows: Record<string, Array<Record<string, unknown>>> = {}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Honours only the documented `q=<Key>=<value>`, `finder=PrimaryKey;OptyId=<id>`,
 * `limit`, `offset` and `fields`, and applies the documented default filter of
 * the opportunities collection (open deals only) when no finder is sent.
 */
async function fakeOracle(input: string | URL | Request): Promise<Response> {
  const url = new URL(String(input))
  const query = Object.fromEntries(url.searchParams.entries())
  sent.push({ path: url.pathname, query })
  const m = /^\/crmRestApi\/resources\/latest\/(\w+)$/.exec(url.pathname)
  if (!m) return json(404, { title: 'Not Found' })
  let items = rows[m[1]!] ?? []
  if (m[1] === 'opportunities' && query['finder'] === undefined) {
    // "By default, the method returns ... only open opportunities (Status = OPEN)"
    items = items.filter((r) => r['StatusCode'] === 'OPEN')
  }
  if (query['finder'] !== undefined) {
    // Only opportunities' documented "PrimaryKey" finder with its "OptyId; integer" variable.
    const fm = /^PrimaryKey;OptyId=(-?\d+)$/.exec(query['finder'])
    if (m[1] !== 'opportunities' || !fm) return json(400, { title: 'bad finder' })
    items = items.filter((r) => String(r['OptyId']) === fm[1])
  }
  if (query['q'] !== undefined) {
    const qm = /^(\w+)=(-?\d+)$/.exec(query['q'])
    if (!qm) return json(400, { title: 'bad q' })
    items = items.filter((r) => String(r[qm[1]!]) === qm[2])
  }
  const offset = Number(query['offset'] ?? 0)
  const limit = Number(query['limit'] ?? 25)
  const page = items.slice(offset, offset + limit)
  return json(200, {
    items: page,
    count: page.length,
    hasMore: offset + page.length < items.length,
  })
}

beforeEach(() => {
  sent = []
  rows = {}
  vi.stubGlobal('fetch', vi.fn(fakeOracle))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new OracleCxAdapter()

describe.each(Object.keys(RESOURCES) as GetMethod[])('oracle-cx %s', (method) => {
  const r = RESOURCES[method]

  it('reads back an id the list returns, by the documented q filter on the integer key', async () => {
    rows[r.path] = [
      { [r.key]: 999997549785817, ...r.extra },
      { [r.key]: 300100036212819, ...r.extra },
    ]
    const got = parseGet(method, await adapter[method](CREDS, '300100036212819'))
    expect(got.id).toBe('300100036212819')
    expect(sent).toEqual([
      {
        path: `/crmRestApi/resources/latest/${r.path}`,
        query: { q: `${r.key}=300100036212819`, limit: '1', fields: r.fields },
      },
    ])
  })

  it('is a 404 when no row matches', async () => {
    rows[r.path] = [{ [r.key]: 1, ...r.extra }]
    await expect(adapter[method](CREDS, '2')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('is a 404 without a request for an id that is not an integer key', async () => {
    await expect(adapter[method](CREDS, "1;Name='x'")).rejects.toMatchObject({ statusCode: 404 })
    expect(sent).toHaveLength(0)
  })
})

describe.each(Object.keys(LISTS) as Array<keyof typeof LISTS>)(
  'oracle-cx %s projection',
  (method) => {
    it('sends only the documented attributes in fields=', async () => {
      await adapter[method](CREDS, { page: 1, limit: 5 })
      expect(sent).toHaveLength(1)
      expect(sent[0]!.query['fields']).toBe(LISTS[method])
    })
  },
)

describe('oracle-cx deals', () => {
  // Not StatusCode 'OPEN', so outside the collection's documented default filter.
  const OUTSIDE_DEFAULT = {
    OptyId: 300100036212819,
    Name: 'Major upgrade of legacy application',
  }

  it('listDeals refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    rows['opportunities'] = [{ OptyId: 1, Name: 'open one', StatusCode: 'OPEN' }]
    await expect(adapter.listDeals(CREDS, { page: 1, limit: 25 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('getDeal reads a deal outside the default filter back through the documented PrimaryKey finder', async () => {
    rows['opportunities'] = [{ OptyId: 1, Name: 'open one', StatusCode: 'OPEN' }, OUTSIDE_DEFAULT]
    const got = DealSchema.parse(await adapter.getDeal(CREDS, '300100036212819'))
    expect(got).toMatchObject({ id: '300100036212819', title: OUTSIDE_DEFAULT.Name })
    expect(sent).toEqual([
      {
        path: '/crmRestApi/resources/latest/opportunities',
        query: { finder: 'PrimaryKey;OptyId=300100036212819', fields: DEAL_FIELDS },
      },
    ])
  })

  it('getDeal is a 404 when no row matches', async () => {
    rows['opportunities'] = [OUTSIDE_DEFAULT]
    await expect(adapter.getDeal(CREDS, '2')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getDeal is a 404 without a request for an id that is not an integer key', async () => {
    await expect(adapter.getDeal(CREDS, "1,Name='x'")).rejects.toMatchObject({ statusCode: 404 })
    expect(sent).toHaveLength(0)
  })
})

describe('oracle-cx notes', () => {
  it('listNotes refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    await expect(adapter.listNotes(CREDS, { page: 1, limit: 25 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(sent).toHaveLength(0)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('getNote refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    await expect(adapter.getNote(CREDS, '42')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})
