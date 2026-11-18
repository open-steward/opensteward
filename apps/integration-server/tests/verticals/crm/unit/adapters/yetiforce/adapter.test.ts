/**
 * YetiForce reads against a fake that honours only what the docs name.
 *
 * Spec: https://doc.yetiforce.com/api/7x/WebservicePremium.json
 *   - POST /webservice/WebservicePremium/Users/Login, security basicAuth +
 *     ApiKeyAuth (X-API-KEY), body { userName, password }, returns
 *     result.token and result.preferences.raw_time_zone;
 *   - GET /{moduleName}/RecordsList, security basicAuth + X-API-KEY +
 *     X-TOKEN, paged by the headers x-row-limit ("Get rows limit, default:
 *     100") and x-row-offset ("Offset, default: 0"), returning
 *     result.rawData (with x-raw-data: 1) and result.isMorePages ("There are
 *     more pages");
 *   - GET /{moduleName}/Record/{recordId} → result.id, result.rawData;
 *   - GET /{moduleName}/Fields → result.fields keyed by field name.
 * Auth: https://doc.yetiforce.com/en/developer-guides/api/first-connect/
 * (X-API-KEY, "Basic base64(userName:password)" of the application, x-token).
 *
 * The fake ignores every query parameter by refusing any request that has
 * one: the server reads paging from headers only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { YetiForceAdapter } from '../../../../../../src/verticals/crm/adapters/yetiforce'
import { _resetYetiForceSessions } from '../../../../../../src/verticals/crm/adapters/yetiforce/client'
import { wallTimeToIso } from '../../../../../../src/verticals/crm/adapters/yetiforce/dates'
import { ContactSchema } from '../../../../../../src/verticals/crm/schema/contact'
import { CompanySchema } from '../../../../../../src/verticals/crm/schema/company'
import { DealSchema } from '../../../../../../src/verticals/crm/schema/deal'
import { ActivitySchema } from '../../../../../../src/verticals/crm/schema/activity'
import { NoteSchema } from '../../../../../../src/verticals/crm/schema/note'
import { PipelineSchema } from '../../../../../../src/verticals/crm/schema/pipeline'
import login from './fixtures/login.json'
import ssalesFields from './fixtures/ssalesprocesses-fields.json'

const BASE = 'https://crm.example.com/webservice/WebservicePremium'
const TOKEN = login.result.token
const BASIC = `Basic ${Buffer.from('portal-app:app-secret').toString('base64')}`

const CREDS: Credentials = {
  accessToken: 'api-key-123',
  extra: {
    instanceUrl: 'https://crm.example.com/',
    appName: 'portal-app',
    appPassword: 'app-secret',
    userName: 'apiuser',
    password: 'apipassword',
  },
}

function rowFor(module: string, id: number): Record<string, unknown> {
  const common = {
    id,
    assigned_user_id: 1,
    createdtime: '2026-01-15 09:30:00',
    modifiedtime: '2026-02-01 14:20:00',
  }
  // Every field a transform maps is set, so a list that fails to ask for one
  // (x-fields) comes back with it missing: see the "asks for every mapped field" test.
  switch (module) {
    case 'Contacts':
      return {
        ...common,
        firstname: `First${id}`,
        lastname: `Last${id}`,
        email: `c${id}@example.com`,
        phone: '+48 22 000 00 00',
        mobile: '+48 600 000 000',
        jobtitle: 'Buyer',
      }
    case 'Accounts':
      return {
        ...common,
        accountname: `Account ${id}`,
        website: 'https://www.acme.example/about',
        phone: '+48 22 000 00 01',
        industry: 'Banking',
        employees: 50,
      }
    case 'SSalesProcesses':
      return {
        ...common,
        subject: `Process ${id}`,
        ssalesprocesses_status: 'PLL_DRAFT',
        related_to: 117,
        estimated_date: '2026-03-31',
        probability: 40,
      }
    case 'Calendar':
      return {
        ...common,
        subject: `Call ${id}`,
        activitytype: 'Call',
        description: 'Follow up',
        activitystatus: 'PLL_PLANNED',
        due_date: '2026-03-01',
        time_end: '10:30:00',
      }
    default:
      return { ...common, commentcontent: `Comment ${id}` }
  }
}

/**
 * What RecordsList returns in rawData for x-fields: only the named columns
 * plus id (RecordsList.php: clearFields(), then setField() per entry).
 */
function onlyFields(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => k === 'id' || fields.includes(k)))
}

type Module = 'Contacts' | 'Accounts' | 'SSalesProcesses' | 'Calendar' | 'ModComments'
/** Ids per module, deliberately not contiguous, served sorted by id. */
let data: Record<string, number[]> = {}

interface Seen {
  method: string
  url: URL
  headers: Record<string, string>
  body?: string
}

let seen: Seen[] = []
let expireTokenOnce = false
let loginBody: unknown = login
let omitIsMorePages = false

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function err(message: string, code: number): Response {
  return json({ status: 0, error: { message, code } }, code)
}

function lower(h: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]))
}

beforeEach(() => {
  _resetYetiForceSessions()
  seen = []
  expireTokenOnce = false
  loginBody = login
  omitIsMorePages = false
  data = {
    Contacts: [3, 5, 8, 13, 21],
    Accounts: [2, 4, 6, 8, 10],
    SSalesProcesses: [101, 102, 103, 104, 105],
    Calendar: [7, 70, 700, 7000, 70000],
    ModComments: [1, 2, 3, 4, 5],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input)
      const headers = lower(init.headers as Record<string, string>)
      const method = init.method ?? 'GET'
      seen.push({ method, url, headers, body: init.body as string | undefined })
      if (url.search !== '') return err('Unexpected query string', 400)
      if (headers['x-api-key'] !== 'api-key-123' || headers['authorization'] !== BASIC)
        return err('Web service - Applications: Unauthorized', 401)
      if (!url.href.startsWith(`${BASE}/`)) return err('No action found', 405)
      const path = url.pathname.slice('/webservice/WebservicePremium/'.length).split('/')

      if (path.join('/') === 'Users/Login') {
        if (method !== 'POST') return err('Invalid method', 405)
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        if (body['userName'] !== 'apiuser' || body['password'] !== 'apipassword')
          return err('Invalid user password', 401)
        return json(loginBody)
      }

      if (headers['x-token'] !== TOKEN) return err('Invalid token', 401)
      if (expireTokenOnce) {
        expireTokenOnce = false
        return err('Token has expired', 401)
      }
      if (method !== 'GET') return err('Invalid method', 405)
      const [module, action, recordId] = path
      if (!module || !(module in data)) return err('No action found', 405)

      if (action === 'RecordsList' && path.length === 2) {
        if (headers['x-raw-data'] !== '1') return err('rawData not requested', 400)
        const fields = JSON.parse(headers['x-fields'] ?? '[]') as string[]
        if (!Array.isArray(fields) || fields.length === 0)
          return err('Incorrect json syntax: x-fields', 400)
        if (headers['x-order-by'] !== JSON.stringify({ id: 'ASC' })) return err('unsorted', 400)
        const limit = headers['x-row-limit'] ? Number(headers['x-row-limit']) : 100
        const offset = headers['x-row-offset'] ? Number(headers['x-row-offset']) : 0
        const ids = [...data[module]!].sort((a, b) => a - b)
        const window = ids.slice(offset, offset + limit + 1)
        const isMorePages = window.length > limit
        const pageIds = window.slice(0, limit)
        const rawData: Record<string, unknown> = {}
        const records: Record<string, unknown> = {}
        for (const id of pageIds) {
          rawData[String(id)] = onlyFields(rowFor(module, id), fields)
          records[String(id)] = { recordLabel: `Record ${id}` }
        }
        return json({
          status: 1,
          result: {
            headers: {},
            records,
            permissions: {},
            rawData,
            numberOfRecords: pageIds.length,
            ...(omitIsMorePages ? {} : { isMorePages }),
          },
        })
      }

      if (action === 'Record' && path.length === 3) {
        const id = Number(recordId)
        if (!data[module]!.includes(id)) return err("Record doesn't exist", 404)
        return json({
          status: 1,
          result: {
            name: `Record ${id}`,
            id,
            fields: {},
            data: {},
            ...(headers['x-raw-data'] === '1' ? { rawData: rowFor(module, id) } : {}),
          },
        })
      }

      if (action === 'Fields' && path.length === 2 && module === 'SSalesProcesses')
        return json(ssalesFields)
      return err('No action found', 405)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new YetiForceAdapter()

function paramsFor(page: number, limit: number): QueryParams {
  return withPageSink({ page, limit } as QueryParams)
}

type ListName = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities' | 'listNotes'
const LISTS: Array<[ListName, Module, { parse: (v: unknown) => unknown }]> = [
  ['listContacts', 'Contacts', ContactSchema],
  ['listCompanies', 'Accounts', CompanySchema],
  ['listDeals', 'SSalesProcesses', DealSchema],
  ['listActivities', 'Calendar', ActivitySchema],
  ['listNotes', 'ModComments', NoteSchema],
]

describe('yetiforce auth', () => {
  it('logs in with X-API-KEY, Basic application auth and the web service user, then sends X-TOKEN', async () => {
    await adapter.listContacts(CREDS, paramsFor(1, 2))
    expect(seen).toHaveLength(2)
    expect(seen[0]!.method).toBe('POST')
    expect(seen[0]!.url.href).toBe(`${BASE}/Users/Login`)
    expect(seen[0]!.headers['x-api-key']).toBe('api-key-123')
    expect(seen[0]!.headers['authorization']).toBe(BASIC)
    expect(JSON.parse(seen[0]!.body!)).toEqual({ userName: 'apiuser', password: 'apipassword' })
    expect(seen[1]!.headers['x-token']).toBe(TOKEN)
  })

  it('logs in once for a walk, not once per page', async () => {
    for (let page = 1; page <= 3; page++) await adapter.listNotes(CREDS, paramsFor(page, 2))
    expect(seen.filter((s) => s.url.pathname.endsWith('/Users/Login'))).toHaveLength(1)
  })

  it('logs in again once when the token has expired', async () => {
    await adapter.listNotes(CREDS, paramsFor(1, 2))
    expireTokenOnce = true
    const rows = await adapter.listNotes(CREDS, paramsFor(1, 2))
    expect(rows.map((r) => r.id)).toEqual(['1', '2'])
    expect(seen.filter((s) => s.url.pathname.endsWith('/Users/Login'))).toHaveLength(2)
  })

  it('refuses when Users/Login returns no raw_time_zone, rather than assuming a zone', async () => {
    const { raw_time_zone: _dropped, ...preferences } = login.result.preferences
    loginBody = { ...login, result: { ...login.result, preferences } }
    await expect(adapter.listContacts(CREDS, paramsFor(1, 2))).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('raw_time_zone'),
    })
    expect(seen.map((s) => s.url.pathname)).toEqual(['/webservice/WebservicePremium/Users/Login'])
  })

  it('refuses, sending nothing, when a connection lacks the application or user login', async () => {
    const legacy: Credentials = {
      accessToken: 'api-key-123',
      extra: { instanceUrl: 'https://crm.example.com' },
    }
    await expect(adapter.listContacts(legacy, paramsFor(1, 2))).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(seen).toHaveLength(0)
  })

  it('collects every credential the documented auth needs on the connect form', async () => {
    expect(adapter.credentialFields().map((f) => f.name)).toEqual([
      'instanceUrl',
      'apiKey',
      'appName',
      'appPassword',
      'userName',
      'password',
    ])
    const creds = await adapter.exchangeCredentials({
      instanceUrl: 'https://crm.example.com/',
      apiKey: 'api-key-123',
      appName: 'portal-app',
      appPassword: 'app-secret',
      userName: 'apiuser',
      password: 'apipassword',
    })
    expect(creds).toEqual({
      accessToken: 'api-key-123',
      extra: {
        instanceUrl: 'https://crm.example.com',
        appName: 'portal-app',
        appPassword: 'app-secret',
        userName: 'apiuser',
        password: 'apipassword',
      },
    })
  })
})

describe.each(LISTS)('yetiforce %s', (method, module, schema) => {
  it(`calls GET ${module}/RecordsList with the paging headers and no query string`, async () => {
    await adapter[method](CREDS, paramsFor(2, 2))
    const list = seen.at(-1)!
    expect(list.method).toBe('GET')
    expect(list.url.href).toBe(`${BASE}/${module}/RecordsList`)
    expect(list.headers['x-row-limit']).toBe('2')
    expect(list.headers['x-row-offset']).toBe('2')
    expect(list.headers['x-raw-data']).toBe('1')
  })

  it('walks 2L+1 rows at L=2: every id once, hasMore exact from isMorePages', async () => {
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 4; page++) {
      const params = paramsFor(page, 2)
      const rows = await adapter[method](CREDS, params)
      for (const r of rows) schema.parse(r)
      got.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(got).toEqual(data[module]!.map(String))
    expect(more).toEqual([true, true, false, false])
  })

  it('takes hasMore from isMorePages, not from a full page: 4 rows at L=2 end on page 2', async () => {
    data[module] = data[module]!.slice(0, 4)
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 2; page++) {
      const params = paramsFor(page, 2)
      expect(await adapter[method](CREDS, params)).toHaveLength(2)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(more).toEqual([true, false])
  })

  it('asks for every mapped field: a listed row equals the same record read back', async () => {
    const [listed] = await adapter[method](CREDS, paramsFor(1, 1))
    for (const [k, v] of Object.entries(listed!)) expect(v, k).not.toBeUndefined()
    const getName = method.replace('list', 'get').replace(/ies$/, 'y').replace(/s$/, '') as
      'getContact' | 'getCompany' | 'getDeal' | 'getActivity' | 'getNote'
    expect(listed).toEqual(await adapter[getName](CREDS, listed!.id))
  })

  it('sends the documented default of 100 rows when the caller gives no limit', async () => {
    await adapter[method](CREDS, withPageSink({} as QueryParams))
    expect(seen.at(-1)!.headers['x-row-limit']).toBe('100')
    expect(seen.at(-1)!.headers['x-row-offset']).toBe('0')
  })

  it('sends a whole-number row limit for a fractional one', async () => {
    await adapter[method](CREDS, paramsFor(2, 2.7))
    expect(seen.at(-1)!.headers['x-row-limit']).toBe('2')
    expect(seen.at(-1)!.headers['x-row-offset']).toBe('2')
  })

  it('refuses a page with no isMorePages instead of calling the collection complete', async () => {
    omitIsMorePages = true
    await expect(adapter[method](CREDS, paramsFor(1, 2))).rejects.toMatchObject({
      statusCode: 502,
    })
  })

  it('reads a record back by the id the list returned', async () => {
    const [first] = await adapter[method](CREDS, paramsFor(1, 1))
    const getName = method.replace('list', 'get').replace(/ies$/, 'y').replace(/s$/, '') as
      'getContact' | 'getCompany' | 'getDeal' | 'getActivity' | 'getNote'
    const got = await adapter[getName](CREDS, first!.id)
    expect(seen.at(-1)!.url.href).toBe(`${BASE}/${module}/Record/${first!.id}`)
    expect(seen.at(-1)!.headers['x-raw-data']).toBe('1')
    expect(schema.parse(got)).toMatchObject({ id: first!.id })
  })
})

describe('yetiforce get', () => {
  it('surfaces a missing record as the upstream 404', async () => {
    await expect(adapter.getDeal(CREDS, '999')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('yetiforce listPipelines', () => {
  it('reads the SSalesProcesses status picklist from GET SSalesProcesses/Fields', async () => {
    const params = paramsFor(1, 10)
    const rows = await adapter.listPipelines(CREDS, params)
    expect(seen.at(-1)!.url.href).toBe(`${BASE}/SSalesProcesses/Fields`)
    expect(rows).toHaveLength(1)
    const p = PipelineSchema.parse(rows[0])
    expect(p.id).toBe('ssalesprocesses_status')
    expect(p.stages?.map((s) => s.id)).toEqual([
      'PLL_DRAFT',
      'PLL_FOR_REALIZATION',
      'PLL_NEGOTIATIONS',
      'PLL_SALE_COMPLETED',
      'PLL_SALE_FAILED',
    ])
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 1,
      hasMore: false,
      pagedLocally: true,
    })
  })

  it('pages the one pipeline locally: page 2 is empty', async () => {
    const params = paramsFor(2, 1)
    expect(await adapter.listPipelines(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('matches the pipeline id and stage ids a deal carries', async () => {
    const [pipeline] = await adapter.listPipelines(CREDS, paramsFor(1, 10))
    const [deal] = await adapter.listDeals(CREDS, paramsFor(1, 1))
    expect(deal!.pipeline_id).toBe(pipeline!.id)
    expect(pipeline!.stages?.map((s) => s.id)).toContain(deal!.stage_id)
  })
})

describe('yetiforce wallTimeToIso', () => {
  it('converts across a DST change in the raw time zone', () => {
    expect(wallTimeToIso('2026-07-01 12:00:00', 'Europe/Warsaw')).toBe('2026-07-01T10:00:00.000Z')
    expect(wallTimeToIso('2026-01-01 12:00:00', 'Europe/Warsaw')).toBe('2026-01-01T11:00:00.000Z')
  })

  it('uses the offset at the answer, not at the first guess, next to the change', () => {
    // 01:30 on 2026-10-25 in Warsaw is still CEST (+2); the change is at 01:00Z.
    expect(wallTimeToIso('2026-10-25 01:30:00', 'Europe/Warsaw')).toBe('2026-10-24T23:30:00.000Z')
  })

  it('returns undefined for an unknown zone or a malformed value', () => {
    expect(wallTimeToIso('2026-01-01 12:00:00', 'Not/AZone')).toBeUndefined()
    expect(wallTimeToIso('2026-01-01', 'UTC')).toBeUndefined()
  })
})
