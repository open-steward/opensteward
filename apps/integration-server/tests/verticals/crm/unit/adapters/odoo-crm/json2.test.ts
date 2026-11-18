/**
 * Odoo CRM over the External JSON-2 API, against a fake server that honours
 * only what Odoo documents.
 *
 * https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
 *   "Post a JSON object at the /json/2/<model>/<method> URL."
 *   Autorization: "Required, bearer followed by an API key."
 *   X-Odoo-Database: "Optional, the name of the database to connect to."
 *   "In case of error, a 4xx/5xx status with a JSON-serialized error object in the body."
 *
 * https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html (Pagination)
 *   "offset and limit parameters are available to only retrieve a subset of all matched records."
 *
 * https://www.odoo.com/documentation/19.0/developer/reference/backend/orm.html
 *   search(domain, offset=0, limit=None, order=None): "offset – number of results to ignore
 *   (default: none)", "limit – maximum number of records to return (default: all)",
 *   "order – sort string"; search_count(domain, limit=None): "Return the number of records
 *   in the current model matching the provided domain."
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetOdooUidCache,
  readUpstreamPage,
  setDnsResolver,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { OdooCrmAdapter } from '../../../../../../src/verticals/crm/adapters/odoo-crm/index'
import { CONTACT_FIELDS } from '../../../../../../src/verticals/crm/adapters/odoo-crm/transform/contact'
import { COMPANY_FIELDS } from '../../../../../../src/verticals/crm/adapters/odoo-crm/transform/company'
import { DEAL_FIELDS } from '../../../../../../src/verticals/crm/adapters/odoo-crm/transform/deal'
import { TEAM_FIELDS } from '../../../../../../src/verticals/crm/adapters/odoo-crm/transform/pipeline'
import { ACTIVITY_FIELDS } from '../../../../../../src/verticals/crm/adapters/odoo-crm/transform/activity'
import { NOTE_FIELDS } from '../../../../../../src/verticals/crm/adapters/odoo-crm/transform/note'
import { ContactSchema } from '../../../../../../src/verticals/crm/schema/contact'
import { DealSchema } from '../../../../../../src/verticals/crm/schema/deal'
import { PipelineSchema } from '../../../../../../src/verticals/crm/schema/pipeline'

const API_KEY = '6578616d706c65206a736f6e20617069206b6579'
const CREDS = {
  accessToken: API_KEY,
  extra: { baseUrl: 'https://mycompany.odoo.com', database: 'mycompany', apiVersion: 'json2' },
}

type Row = Record<string, unknown> & { id: number }

/** Domain criteria this adapter sends: `[field, '=' | 'in', value]`, implicitly AND-ed. */
function matches(row: Row, domain: unknown[]): boolean {
  return domain.every((c) => {
    const [field, op, value] = c as [string, string, unknown]
    if (op === '=') return row[field] === value
    if (op === 'in') return (value as unknown[]).includes(row[field])
    throw new Error(`fake: unsupported operator ${op}`)
  })
}

interface Sent {
  model: string
  method: string
  headers: Headers
  body: Record<string, unknown>
}

/**
 * Fields each model has on the fake server, by Odoo version. Odoo refuses a
 * read naming any other: `raise ValueError(f"Invalid field {field_name!r} on
 * {self._name!r}")` (odoo/orm/models.py 19.0, _determine_fields_to_fetch).
 * From Odoo's source: crm.lead's `won_status = fields.Selection(` is 19.0 only
 * (addons/crm/models/crm_lead.py); crm.stage has `team_id = fields.Many2one(`
 * in 14.0–18.0 and `team_ids = fields.Many2many(` in 19.0 only
 * (addons/crm/models/crm_stage.py).
 */
type OdooVersion = '17.0' | '19.0'
const ALL_FIELDS: Record<string, string[]> = {
  'res.partner': [...new Set([...CONTACT_FIELDS, ...COMPANY_FIELDS])],
  'crm.lead': DEAL_FIELDS,
  'crm.team': TEAM_FIELDS,
  'crm.stage': ['id', 'name', 'sequence', 'team_ids', 'team_id'],
  'mail.activity': ACTIVITY_FIELDS,
  'mail.message': NOTE_FIELDS,
}
const ABSENT: Record<OdooVersion, Record<string, string[]>> = {
  '17.0': { 'crm.lead': ['won_status'], 'crm.stage': ['team_ids'] },
  '19.0': { 'crm.stage': ['team_id'] },
}
const RPC_CREDS = {
  accessToken: API_KEY,
  extra: {
    baseUrl: 'https://mycompany.odoo.com',
    database: 'mycompany',
    login: 'bot@mycompany.com',
    apiVersion: 'rpc',
  },
}

/**
 * Stores keyed by model, each in a physical order that is not id order, so a
 * request that does not ask for `order: 'id asc'` gets rows in a different order.
 * One server, reachable over JSON-2 (named arguments) and /jsonrpc
 * (common.authenticate, then object.execute_kw with positional args); `sent`
 * holds every call but fields_get, as named arguments.
 */
function fakeOdoo(stores: Record<string, Row[]>, version: OdooVersion = '19.0') {
  const sent: Sent[] = []
  let nextId = 1000
  const err = (status: number, name: string, message = name) =>
    ({ status, body: { name, message } }) as { status: number; body: unknown }
  function handle(model: string, method: string, body: Record<string, unknown>) {
    const store = (stores[model] ??= [])
    const known = (ALL_FIELDS[model] ?? []).filter((f) => !ABSENT[version][model]?.includes(f))
    const allowed: Record<string, string[]> = {
      search_read: ['domain', 'fields', 'offset', 'limit', 'order', 'context'],
      search_count: ['domain', 'limit', 'context'],
      // "json={ "ids": [1, 2, 3], "context": {"lang": "en_US"}, "fields": ["name"], "load": None }"
      read: ['ids', 'fields', 'load', 'context'],
      fields_get: ['allfields', 'attributes', 'context'],
      create: ['vals_list', 'context'],
      write: ['ids', 'vals', 'context'],
      unlink: ['ids', 'context'],
    }
    const extra = Object.keys(body).filter((k) => !(allowed[method] ?? []).includes(k))
    if (!allowed[method] || extra.length) {
      return err(422, 'UnprocessableEntity', `unexpected ${method} ${extra.join(',')}`)
    }
    if (method === 'fields_get') {
      return { status: 200, body: Object.fromEntries(known.map((f) => [f, { type: 'char' }])) }
    }
    const asked = (body['fields'] as string[] | undefined) ?? []
    const bad = asked.find((f) => !known.includes(f))
    if (bad) return err(500, 'builtins.ValueError', `Invalid field '${bad}' on '${model}'`)
    const pick = (r: Row) => Object.fromEntries(asked.filter((f) => f in r).map((f) => [f, r[f]]))
    const ids = body['ids'] as number[] | undefined
    if (method === 'create') {
      const out = (body['vals_list'] as Record<string, unknown>[]).map((v) => {
        const id = nextId++
        store.push({ ...v, id })
        return id
      })
      return { status: 200, body: out }
    }
    if (method === 'write') {
      for (const r of store) if (ids!.includes(r.id)) Object.assign(r, body['vals'])
      return { status: 200, body: true }
    }
    if (method === 'unlink') {
      stores[model] = store.filter((r) => !ids!.includes(r.id))
      return { status: 200, body: true }
    }
    if (method === 'read') {
      // BaseModel.fetch() reads `_search([('id', 'in', self.ids)], active_test=False)`:
      // archived rows are read, and ids that do not exist are simply absent.
      return { status: 200, body: store.filter((r) => ids!.includes(r.id)).map(pick) }
    }
    const domain = (body['domain'] as unknown[] | undefined) ?? []
    // ORM: an `active` field set to False makes "the record … invisible in most
    // searches and listing" unless the domain names `active` itself.
    const activeTest = !domain.some((c) => Array.isArray(c) && c[0] === 'active')
    const hits = store.filter((r) => !(activeTest && r.active === false) && matches(r, domain))
    if (method === 'search_count') return { status: 200, body: hits.length }
    const ordered = body['order'] === 'id asc' ? [...hits].sort((a, b) => a.id - b.id) : hits
    const offset = (body['offset'] as number | undefined) ?? 0
    const limit = body['limit'] as number | undefined
    const page = ordered.slice(offset, limit === undefined ? undefined : offset + limit)
    return { status: 200, body: page.map(pick) }
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    const notFound = () =>
      new Response(JSON.stringify({ name: 'werkzeug.exceptions.NotFound', message: 'Not Found' }), {
        status: 404,
      })
    if (url.origin !== 'https://mycompany.odoo.com' || init?.method !== 'POST') return notFound()
    const raw = JSON.parse(String(init.body)) as Record<string, unknown>
    if (url.pathname === '/jsonrpc') {
      const id = raw['id'] ?? null
      const { service, method, args } = raw['params'] as {
        service: string
        method: string
        args: unknown[]
      }
      const ok = (result: unknown) => Response.json({ jsonrpc: '2.0', id, result })
      const fault = (name: string, message: string) =>
        Response.json({
          jsonrpc: '2.0',
          id,
          error: { code: 200, message: 'Odoo Server Error', data: { name, message } },
        })
      if (service === 'common' && method === 'authenticate') {
        const good =
          args[0] === 'mycompany' && args[1] === 'bot@mycompany.com' && args[2] === API_KEY
        return ok(good ? 7 : false)
      }
      const [db, uid, key, model, m, pos, kw] = args as [
        string,
        number,
        string,
        string,
        string,
        unknown[],
        Record<string, unknown>,
      ]
      if (db !== 'mycompany' || uid !== 7 || key !== API_KEY) {
        return fault('odoo.exceptions.AccessDenied', 'Access Denied')
      }
      const named: Record<string, unknown> =
        m === 'read' || m === 'unlink'
          ? { ids: pos[0], ...kw }
          : m === 'write'
            ? { ids: pos[0], vals: pos[1], ...kw }
            : m === 'create'
              ? { vals_list: [pos[0]], ...kw }
              : m === 'fields_get'
                ? kw
                : { domain: pos[0], ...kw }
      if (m !== 'fields_get') sent.push({ model, method: m, headers, body: named })
      const r = handle(model, m, named)
      if (r.status !== 200) {
        const b = r.body as { name: string; message: string }
        return fault(b.name, b.message)
      }
      // RPC create "returns its database identifier", not a list.
      return ok(m === 'create' ? (r.body as number[])[0] : r.body)
    }
    const m = /^\/json\/2\/([^/]+)\/([^/]+)$/.exec(url.pathname)
    if (!m) return notFound()
    if (headers.get('authorization') !== `bearer ${API_KEY}`) {
      return new Response(
        JSON.stringify({
          name: 'werkzeug.exceptions.Unauthorized',
          message: 'Invalid apikey',
          arguments: ['Invalid apikey', 401],
          context: {},
        }),
        { status: 401, headers: { 'content-type': 'application/json; charset=utf-8' } },
      )
    }
    const [, model, method] = m as unknown as [string, string, string]
    if (method !== 'fields_get') sent.push({ model, method, headers, body: raw })
    const r = handle(model, method, raw)
    return Response.json(r.body, { status: r.status })
  })
  return { sent, stores }
}

/** 1-based ids in a physical order that is not id order. */
function shuffledIds(n: number): number[] {
  const ids = Array.from({ length: n }, (_, i) => i + 1)
  return [...ids.filter((i) => i % 2 === 0), ...ids.filter((i) => i % 2 === 1)].reverse()
}

type ListCall = (a: OdooCrmAdapter, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: {
  name: string
  model: string
  row: (id: number) => Row
  noise: (id: number) => Row
  call: ListCall
}[] = [
  {
    name: 'listContacts',
    model: 'res.partner',
    row: (id) => ({ id, name: `P${id}`, is_company: false, type: 'contact' }),
    noise: (id) => ({ id, name: `C${id}`, is_company: true, type: 'contact' }),
    call: (a, p) => a.listContacts(CREDS, p),
  },
  {
    name: 'listCompanies',
    model: 'res.partner',
    row: (id) => ({ id, name: `C${id}`, is_company: true, type: 'contact' }),
    noise: (id) => ({ id, name: `P${id}`, is_company: false, type: 'contact' }),
    call: (a, p) => a.listCompanies(CREDS, p),
  },
  {
    name: 'listDeals',
    model: 'crm.lead',
    row: (id) => ({ id, name: `D${id}`, type: 'opportunity' }),
    noise: (id) => ({ id, name: `L${id}`, type: 'lead' }),
    call: (a, p) => a.listDeals(CREDS, p),
  },
  {
    name: 'listActivities',
    model: 'mail.activity',
    row: (id) => ({ id, summary: `A${id}` }),
    noise: () => {
      throw new Error('mail.activity has no filter')
    },
    call: (a, p) => a.listActivities(CREDS, p),
  },
  {
    name: 'listNotes',
    model: 'mail.message',
    row: (id) => ({
      id,
      body: `<p>N${id}</p>`,
      message_type: 'comment',
      model: 'crm.lead',
      res_id: 1,
    }),
    noise: (id) => ({ id, body: 'x', message_type: 'comment', model: 'sale.order', res_id: 1 }),
    call: (a, p) => a.listNotes(CREDS, p),
  },
  {
    name: 'listPipelines',
    model: 'crm.team',
    row: (id) => ({ id, name: `T${id}`, use_opportunities: true, active: true }),
    noise: (id) => ({ id, name: `X${id}`, use_opportunities: false, active: true }),
    call: (a, p) => a.listPipelines(CREDS, p),
  },
]

beforeEach(() => {
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
  _resetOdooUidCache()
})
afterEach(() => {
  vi.restoreAllMocks()
  setDnsResolver(undefined)
})

describe.each(LISTS)('odoo-crm $name paging', ({ model, row, noise, call, name }) => {
  const L = 2
  const N = 2 * L + 1

  function store(): Row[] {
    const rows = shuffledIds(N).map(row)
    if (name === 'listActivities') return rows
    // Records outside the list's domain, with ids interleaved.
    return [...rows, ...[101, 102].map(noise)]
  }

  it('walks every row once, in id order, with an exact end', async () => {
    const { sent } = fakeOdoo({
      [model]: store(),
      'crm.stage': [{ id: 1, name: 'New', sequence: 1, team_ids: [] }],
    })
    const a = new OdooCrmAdapter()
    const seen: string[] = []
    const metas: unknown[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(a, params)
      seen.push(...rows.map((r) => r.id))
      metas.push(readUpstreamPage(params))
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5'])
    expect(metas).toEqual([
      { totalCount: N, hasMore: true },
      { totalCount: N, hasMore: true },
      { totalCount: N, hasMore: false },
    ])
    const reads = sent.filter((s) => s.model === model && s.method === 'search_read')
    expect(reads.map((s) => [s.body['offset'], s.body['limit'], s.body['order']])).toEqual([
      [0, L, 'id asc'],
      [L, L, 'id asc'],
      [2 * L, L, 'id asc'],
    ])
  })

  it('reports the end on an exact multiple of the page size', async () => {
    fakeOdoo({ [model]: shuffledIds(2 * L).map(row), 'crm.stage': [] })
    const a = new OdooCrmAdapter()
    const p2 = withPageSink({ page: 2, limit: L })
    expect((await call(a, p2)).map((r) => r.id)).toEqual(['3', '4'])
    expect(readUpstreamPage(p2)).toEqual({ totalCount: 2 * L, hasMore: false })
    const p3 = withPageSink({ page: 3, limit: L })
    expect(await call(a, p3)).toEqual([])
    expect(readUpstreamPage(p3)).toEqual({ hasMore: false })
  })

  it('sends the documented request: bearer key, database header, named search_read params', async () => {
    const { sent } = fakeOdoo({ [model]: store(), 'crm.stage': [] })
    await call(new OdooCrmAdapter(), { page: 1, limit: 50 })
    const first = sent[0]!
    expect(first.model).toBe(model)
    expect(first.method).toBe('search_read')
    expect(first.headers.get('authorization')).toBe(`bearer ${API_KEY}`)
    expect(first.headers.get('x-odoo-database')).toBe('mycompany')
    expect(first.headers.get('content-type')).toMatch(/^application\/json/)
    expect(Object.keys(first.body).sort()).toEqual(['domain', 'fields', 'limit', 'offset', 'order'])
  })
})

describe('odoo-crm list domains', () => {
  it('contacts are individual contact-type partners', async () => {
    const { sent } = fakeOdoo({ 'res.partner': [] })
    await new OdooCrmAdapter().listContacts(CREDS, { page: 1, limit: 10 })
    expect(sent[0]!.body['domain']).toEqual([
      ['is_company', '=', false],
      ['type', '=', 'contact'],
    ])
  })

  it('notes are comments on partners and opportunities', async () => {
    const { sent } = fakeOdoo({ 'mail.message': [] })
    await new OdooCrmAdapter().listNotes(CREDS, { page: 1, limit: 10 })
    expect(sent[0]!.body['domain']).toEqual([
      ['message_type', '=', 'comment'],
      ['model', 'in', ['res.partner', 'crm.lead']],
    ])
  })

  it('does not pass search through', async () => {
    const { sent } = fakeOdoo({ 'res.partner': [] })
    await new OdooCrmAdapter().listContacts(CREDS, {
      page: 1,
      limit: 10,
      search: 'acme',
    } as QueryParams)
    expect(JSON.stringify(sent[0]!.body)).not.toContain('acme')
  })
})

describe('odoo-crm pipelines', () => {
  it('each sales team is a pipeline with the stages it shows', async () => {
    const { sent } = fakeOdoo({
      'crm.team': [
        { id: 1, name: 'Sales', use_opportunities: true, active: true },
        { id: 2, name: 'Website', use_opportunities: true, active: true },
      ],
      'crm.stage': [
        { id: 1, name: 'New', sequence: 1, team_ids: [] },
        { id: 3, name: 'Web only', sequence: 2, team_ids: [2] },
      ],
    })
    const out = await new OdooCrmAdapter().listPipelines(CREDS, { page: 1, limit: 10 })
    expect(out.map((p) => [p.id, p.name, p.stages?.map((s) => s.id)])).toEqual([
      ['1', 'Sales', ['1']],
      ['2', 'Website', ['1', '3']],
    ])
    for (const p of out) expect(() => PipelineSchema.parse(p)).not.toThrow()
    const stageRead = sent.find((s) => s.model === 'crm.stage')!
    // Every stage: no limit ("default: all"), in crm.stage's own order.
    expect(stageRead.body).toEqual({
      domain: [],
      fields: ['id', 'name', 'sequence', 'team_ids'],
      order: 'sequence, name, id',
    })
  })

  it('getPipeline reads the team by id', async () => {
    fakeOdoo({ 'crm.team': [{ id: 7, name: 'EU', use_opportunities: true }], 'crm.stage': [] })
    expect((await new OdooCrmAdapter().getPipeline(CREDS, '7')).name).toBe('EU')
    await expect(new OdooCrmAdapter().getPipeline(CREDS, 'default')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('odoo-crm get by id', () => {
  it('reads one record by id with the documented read and 404s on a missing one', async () => {
    const { sent } = fakeOdoo({ 'crm.lead': [{ id: 9, name: 'Big deal', type: 'opportunity' }] })
    const a = new OdooCrmAdapter()
    expect((await a.getDeal(CREDS, '9')).title).toBe('Big deal')
    expect(sent[0]!.method).toBe('read')
    expect(sent[0]!.body).toEqual({ ids: [9], fields: expect.arrayContaining(['name']) })
    await expect(a.getDeal(CREDS, '10')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('reads a lost (archived) deal and an archived contact instead of 404ing', async () => {
    // crm_lead.py 19.0 _compute_won_status: "elif not lead.active and lead.probability == 0:
    // lead.won_status = 'lost'" — every lost deal is archived.
    fakeOdoo({
      'crm.lead': [
        { id: 9, name: 'Lost deal', type: 'opportunity', active: false, won_status: 'lost' },
      ],
      'res.partner': [
        { id: 4, name: 'Old contact', is_company: false, type: 'contact', active: false },
      ],
    })
    const a = new OdooCrmAdapter()
    const deal = await a.getDeal(CREDS, '9')
    expect(deal).toMatchObject({ id: '9', status: 'lost' })
    expect(() => DealSchema.parse(deal)).not.toThrow()
    const contact = await a.getContact(CREDS, '4')
    expect(contact).toMatchObject({ id: '4', name: 'Old contact' })
    expect(() => ContactSchema.parse(contact)).not.toThrow()
  })

  it('404s on a non-numeric id without asking Odoo', async () => {
    const { sent } = fakeOdoo({})
    await expect(new OdooCrmAdapter().getContact(CREDS, 'abc')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(sent).toEqual([])
  })
})

describe('odoo-crm connection', () => {
  it('uses the shared Odoo form: URL, version, database, login, API key', async () => {
    const a = new OdooCrmAdapter()
    expect(a.credentialFields().map((f) => f.name)).toEqual([
      'baseUrl',
      'apiVersion',
      'database',
      'login',
      'apiKey',
    ])
    await expect(
      a.exchangeCredentials({
        baseUrl: 'https://mycompany.odoo.com/odoo/crm',
        apiVersion: 'json2',
        apiKey: ' k ',
      }),
    ).resolves.toEqual({
      accessToken: 'k',
      extra: { baseUrl: 'https://mycompany.odoo.com', apiVersion: 'json2' },
    })
  })

  it('omits X-Odoo-Database when no database was given', async () => {
    const { sent } = fakeOdoo({ 'res.partner': [] })
    await new OdooCrmAdapter().listContacts(
      {
        accessToken: API_KEY,
        extra: { baseUrl: 'https://mycompany.odoo.com', apiVersion: 'json2' },
      },
      { page: 1, limit: 5 },
    )
    expect(sent[0]!.headers.has('x-odoo-database')).toBe(false)
  })

  it('a connection made before the Odoo URL was collected refuses without a request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(
      new OdooCrmAdapter().listContacts({ accessToken: API_KEY }, { page: 1, limit: 5 }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a connection made with the old instanceUrl/db form must reconnect', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(
      new OdooCrmAdapter().listContacts(
        {
          accessToken: API_KEY,
          extra: { instanceUrl: 'https://mycompany.odoo.com', db: 'mycompany' },
        },
        { page: 1, limit: 5 },
      ),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: expect.stringMatching(/reconnect/),
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a connection without an API key refuses without a request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json([]))
    await expect(
      new OdooCrmAdapter().listContacts(
        { accessToken: '', extra: CREDS.extra },
        { page: 1, limit: 5 },
      ),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("surfaces Odoo's documented error object with its status", async () => {
    fakeOdoo({ 'res.partner': [] })
    await expect(
      new OdooCrmAdapter().listContacts({ ...CREDS, accessToken: 'wrong' }, { page: 1, limit: 5 }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      odooName: 'werkzeug.exceptions.Unauthorized',
      message: expect.stringContaining('Invalid apikey'),
    })
  })

  it('refreshCredentials returns the key unchanged, without a request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(new OdooCrmAdapter().refreshCredentials(CREDS)).resolves.toBe(CREDS)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('odoo-crm host check', () => {
  it('refuses a host that resolves to a private address, before sending the key', async () => {
    setDnsResolver(async () => [{ address: '10.0.0.5' }])
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(new OdooCrmAdapter().listContacts(CREDS, { page: 1, limit: 5 })).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('odoo-crm webhooks', () => {
  // Odoo documents no webhook signature, so nothing inbound can be authenticated.
  it('refuses every inbound webhook', () => {
    const a = new OdooCrmAdapter()
    expect(a.verifyWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
    expect(a.verifyWebhook(Buffer.from('{"id":1}'), { 'x-odoo-signature': 'anything' }, '')).toBe(
      false,
    )
  })
})

describe('odoo-crm on Odoo 14–18 over the External RPC API', () => {
  it('lists and reads deals without 19-only won_status', async () => {
    const { sent } = fakeOdoo(
      { 'crm.lead': [{ id: 4, name: 'Big', type: 'opportunity', probability: 50 }] },
      '17.0',
    )
    const a = new OdooCrmAdapter()
    expect(await a.listDeals(RPC_CREDS, { page: 1, limit: 5 })).toMatchObject([
      { id: '4', title: 'Big', probability: 50 },
    ])
    expect(await a.getDeal(RPC_CREDS, '4')).toMatchObject({ id: '4', status: undefined })
    const asked = sent.flatMap((s) => (s.body['fields'] as string[] | undefined) ?? [])
    expect(asked).not.toContain('won_status')
  })

  it("shows a stage under its team_id's pipeline, or under every one when it has none", async () => {
    fakeOdoo(
      {
        'crm.team': [
          { id: 1, name: 'Sales', use_opportunities: true, active: true },
          { id: 2, name: 'Website', use_opportunities: true, active: true },
        ],
        'crm.stage': [
          { id: 1, name: 'New', sequence: 1, team_id: false },
          { id: 3, name: 'Web only', sequence: 2, team_id: [2, 'Website'] },
        ],
      },
      '17.0',
    )
    const out = await new OdooCrmAdapter().listPipelines(RPC_CREDS, { page: 1, limit: 10 })
    expect(out.map((p) => [p.id, p.stages?.map((s) => s.id)])).toEqual([
      ['1', ['1']],
      ['2', ['1', '3']],
    ])
  })
})

describe('odoo-crm writes reach the record they name', () => {
  it('createContact creates, then reads back the new id', async () => {
    const { sent } = fakeOdoo({ 'res.partner': [{ id: 1, name: 'Other', is_company: false }] })
    const c = await new OdooCrmAdapter().createContact(CREDS, { name: 'Ada Lovelace' })
    expect(c).toMatchObject({ id: '1000' })
    expect(sent.find((s) => s.method === 'create')!.body).toEqual({
      vals_list: [expect.objectContaining({ name: 'Ada Lovelace' })],
    })
    expect(sent.find((s) => s.method === 'read')!.body['ids']).toEqual([1000])
  })

  it('updateDeal writes the requested id and returns it', async () => {
    const { sent, stores } = fakeOdoo({
      'crm.lead': [
        { id: 1, name: 'One', type: 'opportunity' },
        { id: 5, name: 'Five', type: 'opportunity' },
      ],
    })
    const d = await new OdooCrmAdapter().updateDeal(CREDS, '5', { title: 'Renamed' })
    expect(d).toMatchObject({ id: '5', title: 'Renamed' })
    expect(sent.find((s) => s.method === 'write')!.body).toEqual({
      ids: [5],
      vals: expect.objectContaining({ name: 'Renamed' }),
    })
    expect(stores['crm.lead']!.find((r) => r.id === 1)!['name']).toBe('One')
  })

  it('updateActivity writes the requested id', async () => {
    const { sent } = fakeOdoo({
      'mail.activity': [
        { id: 1, summary: 'a' },
        { id: 8, summary: 'b' },
      ],
    })
    await new OdooCrmAdapter().updateActivity(CREDS, '8', { subject: 'Call back' })
    expect(sent.find((s) => s.method === 'write')!.body).toEqual({
      ids: [8],
      vals: { summary: 'Call back' },
    })
  })

  it('deleteNote unlinks the requested id', async () => {
    const { sent, stores } = fakeOdoo({
      'mail.message': [
        { id: 3, body: 'x', message_type: 'comment', model: 'crm.lead', res_id: 1 },
        { id: 4, body: 'y', message_type: 'comment', model: 'crm.lead', res_id: 1 },
      ],
    })
    await new OdooCrmAdapter().deleteNote(CREDS, '4')
    expect(sent.find((s) => s.method === 'unlink')!.body).toEqual({ ids: [4] })
    expect(stores['mail.message']!.map((r) => r.id)).toEqual([3])
  })
})

describe('odoo-crm requests', () => {
  it('refuses limit 0, which Odoo would read as "all"', async () => {
    fakeOdoo({ 'crm.lead': [] })
    await expect(
      new OdooCrmAdapter().listDeals(CREDS, { page: 1, limit: 0 }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('listPipelines with no teams does not read stages', async () => {
    const { sent } = fakeOdoo({ 'crm.team': [] })
    expect(await new OdooCrmAdapter().listPipelines(CREDS, { page: 1, limit: 5 })).toEqual([])
    expect(sent.some((s) => s.model === 'crm.stage')).toBe(false)
  })
})
