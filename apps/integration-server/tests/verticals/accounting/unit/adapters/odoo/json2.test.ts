/**
 * Odoo accounting over the shared Odoo client, against a JSON-2 fake that
 * honours only what Odoo documents.
 *
 * https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
 *   "Post a JSON object at the /json/2/<model>/<method> URL."
 *   Autorization: "Required, bearer followed by an API key."
 * https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html
 *   "offset and limit parameters are available to only retrieve a subset of all matched records."
 * https://www.odoo.com/documentation/19.0/developer/reference/backend/orm.html
 *   "YYYY-MM-DD HH:MM:SS for Datetime fields." and a string "must be UTC-only".
 *
 * The adapter used to POST /web/dataset/call_kw — the web client's session-only
 * route — with an `api-key` header Odoo never reads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetOdooUidCache,
  readUpstreamPage,
  setDnsResolver,
  withPageSink,
} from '@opensteward/shared'
import { OdooAdapter } from '../../../../../../src/verticals/accounting/adapters/odoo'

const KEY = 'odoo_key'
const BASE = 'https://acme.odoo.com'
const CREDS = { accessToken: KEY, extra: { baseUrl: BASE, database: 'acme', apiVersion: 'json2' } }
const RPC_CREDS = {
  accessToken: KEY,
  extra: { baseUrl: BASE, database: 'acme', login: 'bot@acme.com', apiVersion: 'rpc' },
}

type Row = Record<string, unknown> & { id: number }

interface Sent {
  path: string
  headers: Headers
  body: Record<string, unknown>
}

function matches(row: Row, domain: unknown[]): boolean {
  return domain.every((c) => {
    const [f, op, v] = c as [string, string, unknown]
    if (op === '=') return row[f] === v
    if (op === '>=') return String(row[f]) >= String(v)
    throw new Error(`fake: unsupported operator ${op}`)
  })
}

/**
 * Fields each model has on the fake server. Odoo refuses a read naming any
 * other: `raise ValueError(f"Invalid field {field_name!r} on {self._name!r}")`
 * (odoo/orm/models.py 19.0, _determine_fields_to_fetch). Differences by
 * version, from Odoo's source:
 *   account.account — `deprecated = fields.Boolean(` 14.0–18.0; `active =
 *     fields.Boolean(default=True, tracking=True)` 19.0 only; `account_type =
 *     fields.Selection(` 16.0+; `internal_group = fields.Selection([` 14.0; no
 *     `balance` in any (addons/account/models/account_account.py).
 *   res.partner — `mobile = fields.Char()` 14.0–18.0, absent in 19.0
 *     (odoo/addons/base/models/res_partner.py).
 */
type OdooVersion = '14.0' | '18.0' | '19.0'
const MODEL_FIELDS: Record<OdooVersion, Record<string, string[]>> = (() => {
  const move = [
    'id',
    'name',
    'move_type',
    'partner_id',
    'invoice_date',
    'invoice_date_due',
    'currency_id',
    'amount_total',
    'amount_residual',
    'amount_tax',
    'state',
    'payment_state',
    'invoice_line_ids',
    'write_date',
  ]
  const partner = [
    'id',
    'name',
    'email',
    'phone',
    'vat',
    'customer_rank',
    'supplier_rank',
    'active',
    'currency_id',
    'is_company',
    'street',
    'city',
    'zip',
    'country_id',
    'write_date',
  ]
  const company = [
    'id',
    'name',
    'currency_id',
    'country_id',
    'vat',
    'email',
    'phone',
    'website',
    'partner_id',
  ]
  const account = ['id', 'code', 'name', 'currency_id', 'write_date']
  return {
    '14.0': {
      'account.move': move,
      'res.partner': [...partner, 'mobile'],
      'res.company': company,
      'account.account': [...account, 'internal_group', 'deprecated'],
    },
    '18.0': {
      'account.move': move,
      'res.partner': [...partner, 'mobile'],
      'res.company': company,
      'account.account': [...account, 'account_type', 'deprecated', 'current_balance'],
    },
    '19.0': {
      'account.move': move,
      'res.partner': partner,
      'res.company': company,
      'account.account': [...account, 'account_type', 'active', 'current_balance'],
    },
  }
})()

/**
 * One Odoo server, reachable over JSON-2 (/json/2/<model>/<method>, named
 * arguments) and /jsonrpc (common.authenticate, then object.execute_kw with
 * positional args), answering search_read, search_count, read and fields_get.
 */
function fakeOdoo(stores: Record<string, Row[]>, version: OdooVersion = '19.0') {
  const sent: Sent[] = []
  const err = (status: number, name: string, message = name) =>
    ({ status, body: { name, message } }) as const
  function handle(model: string, method: string, body: Record<string, unknown>) {
    const fields = MODEL_FIELDS[version][model]
    if (!fields)
      return err(404, 'werkzeug.exceptions.NotFound', `the model '${model}' does not exist`)
    if (method === 'fields_get') {
      return { status: 200, body: Object.fromEntries(fields.map((f) => [f, { type: 'char' }])) }
    }
    const asked = (body['fields'] as string[] | undefined) ?? []
    const bad = asked.find((f) => !fields.includes(f))
    if (bad) return err(500, 'builtins.ValueError', `Invalid field '${bad}' on '${model}'`)
    const store = stores[model] ?? []
    const domain = (body['domain'] as unknown[] | undefined) ?? []
    // A datetime string Odoo cannot parse is a ValueError → 500 on a real server.
    for (const c of domain) {
      const [f, , v] = c as [string, string, unknown]
      if (f === 'write_date' && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(v))) {
        return err(500, 'builtins.ValueError', 'bad datetime')
      }
    }
    const pick = (r: Row) =>
      Object.fromEntries([['id', r.id], ...asked.map((f) => [f, r[f] ?? false])])
    if (method === 'read') {
      const ids = body['ids'] as number[]
      return { status: 200, body: store.filter((r) => ids.includes(r.id)).map(pick) }
    }
    const hits = store.filter((r) => matches(r, domain))
    if (method === 'search_count') return { status: 200, body: hits.length }
    if (method !== 'search_read') return err(404, 'werkzeug.exceptions.NotFound')
    const ordered = body['order'] === 'id asc' ? [...hits].sort((a, b) => a.id - b.id) : hits
    const offset = (body['offset'] as number | undefined) ?? 0
    const limit = body['limit'] as number | undefined
    return {
      status: 200,
      body: ordered.slice(offset, limit === undefined ? undefined : offset + limit).map(pick),
    }
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    if (url.origin !== BASE || init?.method !== 'POST') {
      return Response.json({ name: 'werkzeug.exceptions.NotFound' }, { status: 404 })
    }
    if (url.pathname === '/jsonrpc') {
      const id = body['id'] ?? null
      const { service, method, args } = body['params'] as {
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
        return ok(args[0] === 'acme' && args[1] === 'bot@acme.com' && args[2] === KEY ? 7 : false)
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
      if (db !== 'acme' || uid !== 7 || key !== KEY)
        return fault('odoo.exceptions.AccessDenied', 'Access Denied')
      if (m !== 'fields_get') sent.push({ path: `rpc:${model}/${m}`, headers, body: { pos, kw } })
      const named: Record<string, unknown> =
        m === 'read' ? { ids: pos[0], ...kw } : m === 'fields_get' ? kw : { domain: pos[0], ...kw }
      const r = handle(model, m, named)
      if (r.status !== 200) {
        const b = r.body as { name: string; message: string }
        return fault(b.name, b.message)
      }
      return ok(r.body)
    }
    const m = /^\/json\/2\/([^/]+)\/([^/]+)$/.exec(url.pathname)
    if (!m) return Response.json({ name: 'werkzeug.exceptions.NotFound' }, { status: 404 })
    if (m[2] !== 'fields_get') sent.push({ path: url.pathname, headers, body })
    if (headers.get('authorization') !== `bearer ${KEY}`) {
      return Response.json(
        { name: 'werkzeug.exceptions.Unauthorized', message: 'Invalid apikey' },
        { status: 401 },
      )
    }
    const r = handle(m[1]!, m[2]!, body)
    return Response.json(r.body, { status: r.status })
  })
  return sent
}

const invoice = (id: number): Row => ({
  id,
  name: `INV/${id}`,
  move_type: 'out_invoice',
  partner_id: [7, 'Deco Addict'],
  invoice_date: '2026-01-01',
  invoice_date_due: '2026-01-31',
  currency_id: [1, 'EUR'],
  amount_total: 100,
  amount_residual: 0,
  amount_tax: 21,
  state: 'posted',
  payment_state: 'paid',
  write_date: `2026-01-0${id} 00:00:00`,
})

beforeEach(() => {
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
  _resetOdooUidCache()
})
afterEach(() => {
  vi.restoreAllMocks()
  setDnsResolver(undefined)
})

describe('odoo accounting on the documented API', () => {
  it('posts search_read to /json/2 with the bearer key, never /web/dataset/call_kw', async () => {
    const sent = fakeOdoo({ 'account.account': [] })
    await new OdooAdapter().listAccounts(CREDS, { page: 1, limit: 5 })
    expect(sent[0]!.path).toBe('/json/2/account.account/search_read')
    expect(sent[0]!.headers.get('authorization')).toBe(`bearer ${KEY}`)
    expect(sent[0]!.headers.get('x-odoo-database')).toBe('acme')
    expect(sent[0]!.headers.has('api-key')).toBe(false)
  })

  it("sends updated_after as Odoo's UTC 'YYYY-MM-DD HH:MM:SS'", async () => {
    const sent = fakeOdoo({ 'account.move': [1, 2, 3].map(invoice) })
    const rows = await new OdooAdapter().listInvoices(CREDS, {
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-01-02T00:00:00.000Z'),
    })
    expect(rows.map((r) => r.id)).toEqual(['2', '3'])
    expect(sent[0]!.body['domain']).toEqual([
      ['move_type', '=', 'out_invoice'],
      ['write_date', '>=', '2026-01-02 00:00:00'],
    ])
  })

  it('pages invoices by offset/limit in id order and reports the total from search_count', async () => {
    fakeOdoo({ 'account.move': [3, 1, 5, 2, 4].map(invoice) })
    const a = new OdooAdapter()
    const seen: string[] = []
    const metas: unknown[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 2 })
      seen.push(...(await a.listInvoices(CREDS, params)).map((r) => r.id!))
      metas.push(readUpstreamPage(params))
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5'])
    expect(metas).toEqual([
      { totalCount: 5, hasMore: true },
      { totalCount: 5, hasMore: true },
      { totalCount: 5, hasMore: false },
    ])
  })

  it('404s when a record does not exist instead of transforming nothing', async () => {
    fakeOdoo({ 'account.move': [] })
    await expect(new OdooAdapter().getInvoice(CREDS, '42')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('maps a bad key to UNAUTHORIZED', async () => {
    fakeOdoo({})
    await expect(
      new OdooAdapter().listContacts({ ...CREDS, accessToken: 'wrong' }, { page: 1, limit: 5 }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' })
  })
})

describe('odoo accounting across Odoo versions (fields each version has)', () => {
  const acct = (id: number, extra: Row = { id }): Row => ({
    code: `10${id}`,
    name: `Acc ${id}`,
    ...extra,
    id,
  })
  it('Odoo 19 (json2): accounts and contacts read; active=false is ARCHIVED; no mobile asked', async () => {
    const sent = fakeOdoo(
      {
        'account.account': [acct(1, { id: 1, account_type: 'asset_cash', active: false })],
        'res.partner': [{ id: 5, name: 'Deco', is_company: true, phone: '+1' }],
      },
      '19.0',
    )
    const a = new OdooAdapter()
    expect(await a.listAccounts(CREDS, { page: 1, limit: 5 })).toMatchObject([
      { id: '1', type: 'ASSET', status: 'ARCHIVED' },
    ])
    expect(await a.getAccount(CREDS, '1')).toMatchObject({ id: '1', status: 'ARCHIVED' })
    expect((await a.listContacts(CREDS, { page: 1, limit: 5 })).map((c) => c.id)).toEqual(['5'])
    expect(await a.getContact(CREDS, '5')).toMatchObject({ id: '5' })
    const asked = sent.flatMap((x) => (x.body['fields'] as string[] | undefined) ?? [])
    expect(asked).not.toContain('mobile')
    expect(asked).not.toContain('balance')
  })

  it('Odoo 18 (rpc): deprecated=true is ARCHIVED, type from account_type', async () => {
    fakeOdoo(
      {
        'account.account': [
          acct(2, { id: 2, account_type: 'liability_payable', deprecated: true }),
        ],
      },
      '18.0',
    )
    expect(await new OdooAdapter().listAccounts(RPC_CREDS, { page: 1, limit: 5 })).toMatchObject([
      { id: '2', type: 'LIABILITY', status: 'ARCHIVED' },
    ])
  })

  it('Odoo 14 (rpc): type from internal_group, which is all 14.0 has', async () => {
    fakeOdoo(
      { 'account.account': [acct(3, { id: 3, internal_group: 'expense', deprecated: false })] },
      '14.0',
    )
    expect(await new OdooAdapter().getAccount(RPC_CREDS, '3')).toMatchObject({
      id: '3',
      type: 'EXPENSE',
      status: 'ACTIVE',
    })
  })
})

describe('odoo accounting: requests', () => {
  it('pages at the default size when the caller gives no limit', async () => {
    const sent = fakeOdoo({ 'account.move': [] })
    await new OdooAdapter().listInvoices(CREDS, { page: 1 })
    expect(sent[0]!.body['limit']).toBe(80)
  })

  it('refuses limit 0, which Odoo would read as "all"', async () => {
    fakeOdoo({ 'account.move': [] })
    await expect(
      new OdooAdapter().listInvoices(CREDS, { page: 1, limit: 0 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' })
  })

  it('lists only companies as contacts', async () => {
    const sent = fakeOdoo({
      'res.partner': [
        { id: 5, name: 'Deco', is_company: true },
        { id: 6, name: 'Person', is_company: false },
      ],
    })
    expect(
      (await new OdooAdapter().listContacts(CREDS, { page: 1, limit: 5 })).map((c) => c.id),
    ).toEqual(['5'])
    expect(sent[0]!.body['domain']).toEqual([['is_company', '=', true]])
  })

  it('404s a non-numeric id without asking Odoo', async () => {
    const sent = fakeOdoo({ 'account.move': [] })
    await expect(new OdooAdapter().getInvoice(CREDS, 'abc')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(sent).toHaveLength(0)
  })

  it('reads an archived contact by id (read, not search_read)', async () => {
    const sent = fakeOdoo({
      'res.partner': [{ id: 9, name: 'Gone', is_company: true, active: false }],
    })
    expect(await new OdooAdapter().getContact(CREDS, '9')).toMatchObject({ id: '9' })
    expect(sent[0]!.path).toBe('/json/2/res.partner/read')
    expect(sent[0]!.body['ids']).toEqual([9])
  })

  it('getOrganization 404s when the connection sees no company', async () => {
    fakeOdoo({ 'res.company': [] })
    await expect(new OdooAdapter().getOrganization(CREDS)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })
})

describe('odoo accounting connection', () => {
  it('uses the shared Odoo form: URL, version, database, login, API key', () => {
    expect(new OdooAdapter().credentialFields().map((f) => f.name)).toEqual([
      'baseUrl',
      'apiVersion',
      'database',
      'login',
      'apiKey',
    ])
  })

  it('a connection made with the old form (no apiVersion) must reconnect, before any request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(
      new OdooAdapter().listAccounts(
        { accessToken: KEY, extra: { baseUrl: BASE, database: 'acme' } },
        { page: 1, limit: 5 },
      ),
    ).rejects.toMatchObject({ statusCode: 401, message: expect.stringMatching(/reconnect/) })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
