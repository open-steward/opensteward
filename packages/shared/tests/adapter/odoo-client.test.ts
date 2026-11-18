/**
 * The shared Odoo client, against fakes that honour only what Odoo documents
 * (or, where the page is silent, what Odoo's own source does).
 *
 * JSON-2 — https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
 *   "Post a JSON object at the /json/2/<model>/<method> URL."
 *   Autorization: "Required, bearer followed by an API key."
 *   X-Odoo-Database: "Optional, the name of the database to connect to."
 *   "In case of error, a 4xx/5xx status with a JSON-serialized error object in the body."
 *   Status per exception class: odoo/exceptions.py (19.0) — AccessDenied/AccessError
 *   `http_status = 403`, MissingError `http_status = 404`, UserError `http_status = 422`,
 *   LockError `http_status = 409`; addons/rpc/controllers/json2.py raises NotFound for
 *   an unknown model or method.
 *
 * External RPC — https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html
 *   "uid = common.authenticate(db, username, password, {})"
 *   "models.execute_kw(db, uid, password, 'res.partner', 'search', [[['is_company', '=', True]]], {'offset': 10, 'limit': 5})"
 *   "The way to use API Keys in your scripts is to simply replace your password by the key.
 *    The login remains in-use."
 *   /jsonrpc is `@route('/jsonrpc', type='json', auth="none")` taking `service, method, args`
 *   (odoo/addons/base/controllers/rpc.py, 14.0 and 17.0; addons/rpc/controllers/jsonrpc.py,
 *   19.0). Envelope and error shape: JsonRPCDispatcher docstring, odoo/http.py 19.0:
 *   `{"jsonrpc": "2.0", "method": "call", "params": {...}, "id": null}` →
 *   `{"jsonrpc": "2.0", "error": {"code": ..., "message": ..., "data": {...}}}`, where
 *   `data` is `serialize_exception(exc)` whose `name` is `f'{module}.{name}'`.
 *   exp_authenticate returns `False` on AccessDenied (odoo/service/common.py 14.0–19.0).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDnsResolver } from '../../src/net/safe-fetch'
import {
  OdooClient,
  OdooError,
  odooDatetime,
  _resetOdooUidCache,
} from '../../src/adapter/odoo/client'
import { ODOO_CREDENTIAL_FORM } from '../../src/adapter/odoo/form'

const KEY = '6578616d706c65206a736f6e20617069206b6579'
const BASE = 'https://mycompany.example.com'

const JSON2_CREDS = {
  accessToken: KEY,
  extra: { baseUrl: BASE, database: 'mycompany', apiVersion: 'json2' },
}
const RPC_CREDS = {
  accessToken: KEY,
  extra: { baseUrl: BASE, database: 'mycompany', login: 'bot@example.com', apiVersion: 'rpc' },
}

type Row = Record<string, unknown> & { id: number }

/** res.partner's fields on the fake server; fields_get answers these, as {name: {type}}. */
const PARTNER_FIELDS = ['id', 'name', 'is_company', 'write_date']
const fieldsGet = () => Object.fromEntries(PARTNER_FIELDS.map((f) => [f, { type: 'char' }]))
/** Odoo 19 refuses a read naming a field the model lacks (odoo/orm/models.py, _determine_fields_to_fetch). */
function unknownField(kw: Record<string, unknown>): string | undefined {
  return ((kw['fields'] as string[] | undefined) ?? []).find((f) => !PARTNER_FIELDS.includes(f))
}

function matches(row: Row, domain: unknown[]): boolean {
  return domain.every((c) => {
    const [f, op, v] = c as [string, string, unknown]
    if (op === '=') return row[f] === v
    if (op === '>=') return String(row[f]) >= String(v)
    throw new Error(`fake: unsupported operator ${op}`)
  })
}

/** search_read over a store, honouring domain/offset/limit/order('id'). */
function searchRead(rows: Row[], kw: Record<string, unknown>): Row[] {
  let out = rows.filter((r) => matches(r, (kw['domain'] as unknown[]) ?? []))
  if (kw['order'] === 'id asc' || kw['order'] === 'id') out = [...out].sort((a, b) => a.id - b.id)
  const offset = (kw['offset'] as number) ?? 0
  const limit = kw['limit'] as number | undefined
  out = out.slice(offset, limit === undefined ? undefined : offset + limit)
  const fields = kw['fields'] as string[] | undefined
  return out.map((r) =>
    fields ? Object.fromEntries([['id', r.id], ...fields.map((f) => [f, r[f]])]) : r,
  ) as Row[]
}

/** fields_get calls, kept out of `sent` so each test sees only the calls it made. */
let fieldsGetCalls: Sent[] = []
const isFieldsGet = (body: Record<string, unknown>, url: string) =>
  url.endsWith('/fields_get') ||
  (body['params'] as { args?: unknown[] } | undefined)?.args?.[4] === 'fields_get'

interface Sent {
  url: string
  headers: Headers
  body: Record<string, unknown>
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

/** A JSON-2 server: bearer key, named arguments only, errors as HTTP statuses. */
function fakeJson2(store: Row[], opts: { errorFor?: Record<string, [number, string]> } = {}) {
  const sent: Sent[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    if (isFieldsGet(body, url)) fieldsGetCalls.push({ url, headers, body })
    else sent.push({ url, headers, body })
    if (init?.method !== 'POST') return json(404, { name: 'werkzeug.exceptions.NotFound' })
    if (headers.get('Authorization') !== `bearer ${KEY}`) {
      return json(401, {
        name: 'werkzeug.exceptions.Unauthorized',
        message: 'Invalid apikey',
        arguments: ['Invalid apikey', 401],
        context: {},
      })
    }
    const m = /^https:\/\/mycompany\.example\.com\/json\/2\/([^/]+)\/([^/]+)$/.exec(url)
    if (!m) return json(404, { name: 'werkzeug.exceptions.NotFound', message: 'Not Found' })
    const [, model, method] = m
    const err = opts.errorFor?.[method!]
    if (err)
      return json(err[0], { name: err[1], message: `${err[1]} raised`, arguments: [], context: {} })
    if (model !== 'res.partner') {
      return json(404, {
        name: 'werkzeug.exceptions.NotFound',
        message: `the model '${model}' does not exist`,
      })
    }
    if ((method === 'search_read' || method === 'read') && unknownField(body)) {
      return json(500, {
        name: 'builtins.ValueError',
        message: `Invalid field '${unknownField(body)}' on 'res.partner'`,
      })
    }
    switch (method) {
      case 'fields_get':
        return json(200, fieldsGet())
      case 'search_read':
        return json(200, searchRead(store, body))
      case 'search_count':
        return json(200, store.filter((r) => matches(r, body['domain'] as unknown[])).length)
      case 'read': {
        const ids = body['ids'] as number[]
        return json(
          200,
          store.filter((r) => ids.includes(r.id)),
        )
      }
      case 'create': {
        const vals = body['vals_list'] as Record<string, unknown>[]
        const ids = vals.map((v, i) => {
          const id = 1000 + i
          store.push({ ...v, id })
          return id
        })
        return json(200, ids)
      }
      case 'write':
        return json(200, true)
      case 'unlink':
        return json(200, true)
      default:
        return json(404, { name: 'werkzeug.exceptions.NotFound', message: method })
    }
  })
  return sent
}

/** A /jsonrpc server: common.authenticate then object.execute_kw with positional args. */
function fakeRpc(
  store: Row[],
  opts: {
    faultName?: string
    badLogin?: boolean
    uid?: unknown
    deny?: { now: boolean }
    faultCode?: number
  } = {},
) {
  const sent: Sent[] = []
  let calls = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    if (isFieldsGet(body, url)) fieldsGetCalls.push({ url, headers, body })
    else sent.push({ url, headers, body })
    if (url !== `${BASE}/jsonrpc` || init?.method !== 'POST')
      return new Response('Not Found', { status: 404 })
    const id = body['id'] ?? null
    const params = body['params'] as { service: string; method: string; args: unknown[] }
    const ok = (result: unknown) => json(200, { jsonrpc: '2.0', id, result })
    const fault = (name: string, code = 200) =>
      json(200, {
        jsonrpc: '2.0',
        id,
        error: {
          code,
          message: 'Odoo Server Error',
          data: { name, message: `${name} raised`, arguments: [], debug: '' },
        },
      })
    if (params.service === 'common' && params.method === 'authenticate') {
      const [db, login, password, env] = params.args
      if (typeof env !== 'object') return fault('builtins.TypeError')
      if (opts.badLogin || db !== 'mycompany' || login !== 'bot@example.com' || password !== KEY)
        return ok(false)
      return ok(opts.uid ?? 7)
    }
    if (params.service === 'object' && params.method === 'execute_kw') {
      calls++
      const [db, uid, password, model, method, args, kw] = params.args as [
        string,
        number,
        string,
        string,
        string,
        unknown[],
        Record<string, unknown> | undefined,
      ]
      if (db !== 'mycompany' || uid !== 7 || password !== KEY)
        return fault('odoo.exceptions.AccessDenied')
      if (opts.deny?.now) return fault('odoo.exceptions.AccessDenied')
      if (opts.faultName) return fault(opts.faultName, opts.faultCode)
      if (model !== 'res.partner') return fault('builtins.KeyError')
      const k = kw ?? {}
      if ((method === 'search_read' || method === 'read') && unknownField(k)) {
        return fault('builtins.ValueError')
      }
      switch (method) {
        case 'fields_get':
          return ok(fieldsGet())
        case 'search_read':
          return ok(searchRead(store, { domain: args[0], ...k }))
        case 'search_count':
          return ok(store.filter((r) => matches(r, args[0] as unknown[])).length)
        case 'read': {
          const ids = args[0] as number[]
          return ok(store.filter((r) => ids.includes(r.id)))
        }
        case 'create':
          return ok(2000)
        case 'write':
        case 'unlink':
          return ok(true)
      }
      return fault('builtins.AttributeError')
    }
    return fault('builtins.KeyError')
  })
  return { sent, objectCalls: () => calls }
}

const STORE = (): Row[] => [
  { id: 3, name: 'Charlie', is_company: true, write_date: '2026-01-03 00:00:00' },
  { id: 1, name: 'Alpha', is_company: true, write_date: '2026-01-01 00:00:00' },
  { id: 2, name: 'Bravo', is_company: true, write_date: '2026-01-02 00:00:00' },
  { id: 4, name: 'Person', is_company: false, write_date: '2026-01-04 00:00:00' },
]

beforeEach(() => {
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
  _resetOdooUidCache()
  fieldsGetCalls = []
})
afterEach(() => {
  vi.restoreAllMocks()
  setDnsResolver(undefined)
})

describe('JSON-2 transport (Odoo 19+)', () => {
  it('POSTs /json/2/<model>/<method> with bearer key, X-Odoo-Database and named arguments', async () => {
    const sent = fakeJson2(STORE())
    const rows = await new OdooClient(JSON2_CREDS).searchRead('res.partner', {
      domain: [['is_company', '=', true]],
      fields: ['name'],
      offset: 1,
      limit: 1,
      order: 'id asc',
    })
    expect(rows).toEqual([{ id: 2, name: 'Bravo' }])
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe(`${BASE}/json/2/res.partner/search_read`)
    expect(sent[0]!.headers.get('Authorization')).toBe(`bearer ${KEY}`)
    expect(sent[0]!.headers.get('X-Odoo-Database')).toBe('mycompany')
    expect(sent[0]!.headers.get('Content-Type')).toMatch(/^application\/json/)
    expect(sent[0]!.body).toEqual({
      domain: [['is_company', '=', true]],
      fields: ['name'],
      offset: 1,
      limit: 1,
      order: 'id asc',
    })
  })

  it('omits X-Odoo-Database when the connection has no database', async () => {
    const sent = fakeJson2(STORE())
    await new OdooClient({
      accessToken: KEY,
      extra: { baseUrl: BASE, apiVersion: 'json2' },
    }).searchCount('res.partner', [])
    expect(sent[0]!.headers.has('X-Odoo-Database')).toBe(false)
    expect(sent[0]!.body).toEqual({ domain: [] })
  })

  it('reads, creates, writes and unlinks with ids in the body', async () => {
    const sent = fakeJson2(STORE())
    const c = new OdooClient(JSON2_CREDS)
    expect(await c.read('res.partner', [1], ['name'])).toHaveLength(1)
    expect(await c.create('res.partner', { name: 'New' })).toBe(1000)
    expect(await c.write('res.partner', [1], { name: 'X' })).toBe(true)
    expect(await c.unlink('res.partner', [1])).toBe(true)
    expect(sent.map((s) => s.body)).toEqual([
      { ids: [1], fields: ['name'] },
      { vals_list: [{ name: 'New' }] },
      { ids: [1], vals: { name: 'X' } },
      { ids: [1] },
    ])
  })

  it.each([
    [401, 'werkzeug.exceptions.Unauthorized', 'UNAUTHORIZED', 401],
    [403, 'odoo.exceptions.AccessError', 'FORBIDDEN', 403],
    [404, 'odoo.exceptions.MissingError', 'NOT_FOUND', 404],
    [409, 'odoo.exceptions.LockError', 'CONFLICT', 409],
    [422, 'odoo.exceptions.ValidationError', 'VALIDATION', 422],
    [500, 'builtins.ValueError', 'UPSTREAM_ERROR', 502],
  ])('maps HTTP %i (%s) to %s', async (status, name, code, statusCode) => {
    fakeJson2(STORE(), { errorFor: { read: [status, name] } })
    const err = await new OdooClient(JSON2_CREDS).read('res.partner', [1], ['name']).catch((e) => e)
    expect(err).toBeInstanceOf(OdooError)
    expect(err).toMatchObject({ code, statusCode, odooName: name })
  })

  it('a wrong key is the documented 401 "Invalid apikey", mapped to UNAUTHORIZED', async () => {
    fakeJson2(STORE())
    const err = await new OdooClient({ ...JSON2_CREDS, accessToken: 'wrong' })
      .searchCount('res.partner', [])
      .catch((e) => e)
    expect(err).toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 })
    expect(String(err.message)).toContain('Invalid apikey')
  })
})

describe('External RPC transport (Odoo 14–18), /jsonrpc', () => {
  it('authenticates with (db, login, apiKey, {}) then calls execute_kw(db, uid, apiKey, model, method, args, kw)', async () => {
    const { sent } = fakeRpc(STORE())
    const rows = await new OdooClient(RPC_CREDS).searchRead('res.partner', {
      domain: [['is_company', '=', true]],
      fields: ['name'],
      offset: 0,
      limit: 2,
      order: 'id asc',
    })
    expect(rows).toEqual([
      { id: 1, name: 'Alpha' },
      { id: 2, name: 'Bravo' },
    ])
    expect(sent.map((s) => s.url)).toEqual([`${BASE}/jsonrpc`, `${BASE}/jsonrpc`])
    expect(sent[0]!.body).toMatchObject({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'common',
        method: 'authenticate',
        args: ['mycompany', 'bot@example.com', KEY, {}],
      },
    })
    expect(sent[1]!.body).toMatchObject({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          'mycompany',
          7,
          KEY,
          'res.partner',
          'search_read',
          [[['is_company', '=', true]]],
          { fields: ['name'], offset: 0, limit: 2, order: 'id asc' },
        ],
      },
    })
    expect(sent[1]!.headers.has('Authorization')).toBe(false)
  })

  it('passes ids and values positionally, as the RPC page shows', async () => {
    const { sent } = fakeRpc(STORE())
    const c = new OdooClient(RPC_CREDS)
    await c.searchCount('res.partner', [['is_company', '=', true]])
    await c.read('res.partner', [1], ['name'])
    expect(await c.create('res.partner', { name: 'New' })).toBe(2000)
    await c.write('res.partner', [1], { name: 'X' })
    await c.unlink('res.partner', [1])
    const exec = sent.filter((s) => (s.body['params'] as { service: string }).service === 'object')
    expect(exec.map((s) => (s.body['params'] as { args: unknown[] }).args.slice(4))).toEqual([
      ['search_count', [[['is_company', '=', true]]], {}],
      ['read', [[1]], { fields: ['name'] }],
      ['create', [{ name: 'New' }], {}],
      ['write', [[1], { name: 'X' }], {}],
      ['unlink', [[1]], {}],
    ])
  })

  it('authenticates once per connection, not once per call', async () => {
    const { sent } = fakeRpc(STORE())
    await new OdooClient(RPC_CREDS).searchCount('res.partner', [])
    await new OdooClient(RPC_CREDS).searchCount('res.partner', [])
    const auths = sent.filter((s) => (s.body['params'] as { service: string }).service === 'common')
    expect(auths).toHaveLength(1)
  })

  it('authenticate returning false is UNAUTHORIZED', async () => {
    fakeRpc(STORE(), { badLogin: true })
    const err = await new OdooClient(RPC_CREDS).searchCount('res.partner', []).catch((e) => e)
    expect(err).toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 })
  })

  it.each([
    ['odoo.exceptions.AccessDenied', 'UNAUTHORIZED', 401],
    ['odoo.exceptions.AccessError', 'FORBIDDEN', 403],
    ['odoo.exceptions.MissingError', 'NOT_FOUND', 404],
    ['odoo.exceptions.ValidationError', 'VALIDATION', 422],
    ['odoo.exceptions.UserError', 'VALIDATION', 422],
    ['builtins.ValueError', 'UPSTREAM_ERROR', 502],
  ])('maps a %s fault to %s', async (name, code, statusCode) => {
    fakeRpc(STORE(), { faultName: name })
    const err = await new OdooClient(RPC_CREDS).searchCount('res.partner', []).catch((e) => e)
    expect(err).toBeInstanceOf(OdooError)
    expect(err).toMatchObject({ code, statusCode, odooName: name })
  })

  it('refuses to call RPC without a login or database', async () => {
    fakeRpc(STORE())
    const err = await new OdooClient({
      accessToken: KEY,
      extra: { baseUrl: BASE, database: 'mycompany', apiVersion: 'rpc' },
    })
      .searchCount('res.partner', [])
      .catch((e) => e)
    expect(err).toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 })
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled()
  })
})

describe('connection', () => {
  it('refuses a connection that never chose an API version', () => {
    expect(() => new OdooClient({ accessToken: KEY, extra: { baseUrl: BASE } })).toThrow(
      /reconnect/i,
    )
  })

  it('refuses a connection with no baseUrl (the pre-shared-client shape)', () => {
    expect(
      () =>
        new OdooClient({
          accessToken: KEY,
          extra: { instanceUrl: BASE, db: 'x', apiVersion: 'json2' },
        }),
    ).toThrow(/reconnect/i)
  })
})

describe('searchPage: offset/limit paging with search_count for the total', () => {
  for (const [label, creds, install] of [
    ['json2', JSON2_CREDS, () => fakeJson2(STORE())],
    ['rpc', RPC_CREDS, () => fakeRpc(STORE()).sent],
  ] as const) {
    it(`${label}: walks every row exactly once and reports the total`, async () => {
      install()
      const c = new OdooClient(creds)
      const seen: number[] = []
      const metas: unknown[] = []
      for (let page = 1; page <= 3; page++) {
        const p = await c.searchPage<Row>('res.partner', {
          domain: [['is_company', '=', true]],
          fields: ['name'],
          offset: (page - 1) * 2,
          limit: 2,
        })
        seen.push(...p.rows.map((r) => r.id))
        metas.push({ totalCount: p.totalCount, hasMore: p.hasMore })
        if (!p.hasMore) break
      }
      expect(seen).toEqual([1, 2, 3])
      expect(metas).toEqual([
        { totalCount: 3, hasMore: true },
        { totalCount: 3, hasMore: false },
      ])
    })
  }

  it('orders by id so a page is the same rows on every call', async () => {
    const sent = fakeJson2(STORE())
    await new OdooClient(JSON2_CREDS).searchPage('res.partner', {
      domain: [],
      fields: [],
      offset: 0,
      limit: 10,
    })
    expect(sent[0]!.body['order']).toBe('id asc')
  })
})

describe('odooDatetime', () => {
  it("formats a Date as Odoo's UTC 'YYYY-MM-DD HH:MM:SS'", () => {
    expect(odooDatetime(new Date('2026-03-04T05:06:07.890Z'))).toBe('2026-03-04 05:06:07')
  })
})

describe('ODOO_CREDENTIAL_FORM', () => {
  const form = ODOO_CREDENTIAL_FORM
  it('collects baseUrl, apiVersion, database, login and apiKey', () => {
    expect(form.credentialFields().map((f) => f.name)).toEqual([
      'baseUrl',
      'apiVersion',
      'database',
      'login',
      'apiKey',
    ])
    const key = form.credentialFields().find((f) => f.name === 'apiKey')!
    expect(key.helpText).toMatch(/three months/)
  })

  it('stores a JSON-2 connection', async () => {
    const creds = await form.exchangeCredentials({
      baseUrl: 'https://mycompany.example.com/odoo/crm',
      apiVersion: 'json2',
      database: '',
      login: '',
      apiKey: ` ${KEY} `,
    })
    expect(creds).toEqual({ accessToken: KEY, extra: { baseUrl: BASE, apiVersion: 'json2' } })
  })

  it('stores an RPC connection and requires its login and database', async () => {
    const creds = await form.exchangeCredentials({
      baseUrl: BASE,
      apiVersion: 'rpc',
      database: 'mycompany',
      login: 'bot@example.com',
      apiKey: KEY,
    })
    expect(creds).toEqual({
      accessToken: KEY,
      extra: { baseUrl: BASE, apiVersion: 'rpc', database: 'mycompany', login: 'bot@example.com' },
    })
    await expect(
      form.exchangeCredentials({
        baseUrl: BASE,
        apiVersion: 'rpc',
        database: 'mycompany',
        apiKey: KEY,
      }),
    ).rejects.toThrow(/login/i)
    await expect(
      form.exchangeCredentials({
        baseUrl: BASE,
        apiVersion: 'rpc',
        login: 'bot@example.com',
        apiKey: KEY,
      }),
    ).rejects.toThrow(/database/i)
  })

  it('refuses http, an unknown version and private hosts', async () => {
    await expect(
      form.exchangeCredentials({
        baseUrl: 'http://mycompany.example.com',
        apiVersion: 'json2',
        apiKey: KEY,
      }),
    ).rejects.toThrow(/https/)
    await expect(
      form.exchangeCredentials({ baseUrl: BASE, apiVersion: '', apiKey: KEY }),
    ).rejects.toThrow(/version/i)
    setDnsResolver(async () => [{ address: '10.0.0.5' }])
    await expect(
      form.exchangeCredentials({ baseUrl: BASE, apiVersion: 'json2', apiKey: KEY }),
    ).rejects.toThrow(/private/)
  })

  it('refuses a literal loopback IP and keeps a non-default port', async () => {
    await expect(
      form.exchangeCredentials({
        baseUrl: 'https://127.0.0.1:8069',
        apiVersion: 'json2',
        apiKey: KEY,
      }),
    ).rejects.toThrow(/private or reserved/)
    const creds = await form.exchangeCredentials({
      baseUrl: 'https://erp.example.com:8443/web#action=1',
      apiVersion: 'json2',
      apiKey: KEY,
    })
    expect(creds.extra).toEqual({ baseUrl: 'https://erp.example.com:8443', apiVersion: 'json2' })
  })
})

/** Answer every request with \`respond\`, recording what was sent. */
function fakeAll(
  respond: (url: string, body: Record<string, unknown>) => Response | Promise<Response>,
) {
  const inits: RequestInit[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    inits.push(init ?? {})
    return respond(String(input), JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
  })
  return inits
}

describe('fields: every read names only fields the server has (fields_get)', () => {
  it('json2: drops a field the model lacks, asking fields_get once per model', async () => {
    fakeJson2(STORE())
    const c = new OdooClient(JSON2_CREDS)
    const rows = await c.searchRead('res.partner', {
      domain: [['id', '=', 1]],
      fields: ['name', 'mobile'],
    })
    expect(rows).toEqual([{ id: 1, name: 'Alpha' }])
    expect(await c.read('res.partner', [2], ['name', 'mobile'])).toHaveLength(1)
    expect(fieldsGetCalls).toHaveLength(1)
    expect(fieldsGetCalls[0]!.url).toBe(`${BASE}/json/2/res.partner/fields_get`)
    expect(fieldsGetCalls[0]!.body).toEqual({ attributes: ['type'] })
  })

  it('rpc: fields_get is execute_kw(…, "fields_get", [], {attributes})', async () => {
    fakeRpc(STORE())
    const rows = await new OdooClient(RPC_CREDS).read<Row>('res.partner', [1], ['name', 'mobile'])
    expect(rows).toEqual([
      { id: 1, name: 'Alpha', is_company: true, write_date: '2026-01-01 00:00:00' },
    ])
    expect((fieldsGetCalls[0]!.body['params'] as { args: unknown[] }).args.slice(3)).toEqual([
      'res.partner',
      'fields_get',
      [],
      { attributes: ['type'] },
    ])
  })
})

describe('redirects are refused, never followed', () => {
  it('a 307 to a metadata address is an error and fetch is told not to follow', async () => {
    const inits = fakeAll(
      () => new Response(null, { status: 307, headers: { location: 'http://169.254.169.254/' } }),
    )
    const err = await new OdooClient(RPC_CREDS).searchCount('res.partner', []).catch((e) => e)
    expect(err).toMatchObject({ code: 'UPSTREAM_ERROR', statusCode: 502, upstreamStatus: 307 })
    expect(err.message).toMatch(/redirect \(307 to http:\/\/169\.254\.169\.254\/\)/)
    expect(inits).toHaveLength(1)
    expect(inits[0]!.redirect).toBe('manual')
  })
})

describe('transport failures', () => {
  it('json2: a 429 is retried, and one that persists is RATE_LIMITED', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      let n = 0
      fakeAll(() => (++n === 1 ? json(429, { name: 'x', message: 'slow down' }) : json(200, 4)))
      const once = new OdooClient(JSON2_CREDS).searchCount('res.partner', [])
      await vi.runAllTimersAsync()
      expect(await once).toBe(4)
      expect(n).toBe(2)

      vi.mocked(globalThis.fetch).mockImplementation(async () =>
        json(429, { message: 'slow down' }),
      )
      const always = new OdooClient(JSON2_CREDS).searchCount('res.partner', []).catch((e) => e)
      await vi.runAllTimersAsync()
      expect(await always).toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('rpc: an HTTP 429 from /jsonrpc is RATE_LIMITED', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      fakeAll(() => new Response('Too Many Requests', { status: 429 }))
      const p = new OdooClient(RPC_CREDS).searchCount('res.partner', []).catch((e) => e)
      await vi.runAllTimersAsync()
      expect(await p).toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('a timeout is UPSTREAM_TIMEOUT (504); a refused connection is UPSTREAM_UNREACHABLE (502)', async () => {
    fakeAll(() => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    })
    expect(
      await new OdooClient(JSON2_CREDS).searchCount('res.partner', []).catch((e) => e),
    ).toMatchObject({ code: 'UPSTREAM_TIMEOUT', statusCode: 504 })
    vi.mocked(globalThis.fetch).mockImplementation(async () => {
      throw new TypeError('fetch failed')
    })
    expect(
      await new OdooClient(JSON2_CREDS).searchCount('res.partner', []).catch((e) => e),
    ).toMatchObject({ code: 'UPSTREAM_UNREACHABLE', statusCode: 502 })
  })

  it('re-checks the host on every call, not only when the connection was made', async () => {
    fakeJson2(STORE())
    const c = new OdooClient(JSON2_CREDS)
    setDnsResolver(async () => [{ address: '10.0.0.5' }])
    await expect(c.searchCount('res.partner', [])).rejects.toThrow(/SSRF|private/)
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled()
  })

  it("JSON-2: the error message is Odoo's `message`, not the raw body", async () => {
    fakeJson2(STORE(), { errorFor: { read: [422, 'odoo.exceptions.ValidationError'] } })
    const err = await new OdooClient(JSON2_CREDS).read('res.partner', [1], ['name']).catch((e) => e)
    expect(err.message).toMatch(/: odoo\.exceptions\.ValidationError raised$/)
  })

  it('URL-encodes the model and method, and sends a User-Agent', async () => {
    const sent = fakeJson2(STORE())
    await new OdooClient(JSON2_CREDS).searchCount('a/b', []).catch(() => undefined)
    expect(sent[0]!.url).toBe(`${BASE}/json/2/a%2Fb/search_count`)
    expect(sent[0]!.headers.get('User-Agent')).toBe('OpenSteward')
  })

  it('drops a trailing slash from the stored URL', async () => {
    const sent = fakeJson2(STORE())
    await new OdooClient({
      ...JSON2_CREDS,
      extra: { ...JSON2_CREDS.extra, baseUrl: `${BASE}/` },
    }).searchCount('res.partner', [])
    expect(sent[0]!.url).toBe(`${BASE}/json/2/res.partner/search_count`)
  })
})

describe('results that are not the documented shape', () => {
  it.each([
    ['search_count', '3'],
    ['search_read', {}],
  ])('%s returning %j is UPSTREAM_ERROR', async (method, body) => {
    fakeAll((url) =>
      url.endsWith('/fields_get') ? json(200, { name: { type: 'char' } }) : json(200, body),
    )
    const c = new OdooClient(JSON2_CREDS)
    const p =
      method === 'search_count'
        ? c.searchCount('res.partner', [])
        : c.searchRead('res.partner', { domain: [], fields: ['name'] })
    expect(await p.catch((e) => e)).toMatchObject({ code: 'UPSTREAM_ERROR', statusCode: 502 })
  })

  it('write passes on what Odoo answered', async () => {
    fakeAll(() => json(200, false))
    expect(await new OdooClient(JSON2_CREDS).write('res.partner', [1], { name: 'X' })).toBe(false)
  })
})

describe('RPC: faults and the uid', () => {
  it('maps a LockError fault to CONFLICT (409)', async () => {
    fakeRpc(STORE(), { faultName: 'odoo.exceptions.LockError' })
    expect(
      await new OdooClient(RPC_CREDS).searchCount('res.partner', []).catch((e) => e),
    ).toMatchObject({ code: 'CONFLICT', statusCode: 409 })
  })

  it('maps a NotFound fault (error.code 404, odoo/http.py) to NOT_FOUND', async () => {
    fakeRpc(STORE(), { faultName: 'werkzeug.exceptions.NotFound', faultCode: 404 })
    expect(
      await new OdooClient(RPC_CREDS).searchCount('res.partner', []).catch((e) => e),
    ).toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('authenticate returning 0 is UNAUTHORIZED, and no call is made with it', async () => {
    const { objectCalls } = fakeRpc(STORE(), { uid: 0 })
    const err = await new OdooClient(RPC_CREDS).searchCount('res.partner', []).catch((e) => e)
    expect(err).toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 })
    expect(err.message).toMatch(/no user id/)
    expect(objectCalls()).toBe(0)
  })

  it('a revoked key drops the cached uid, so the next call authenticates again', async () => {
    const deny = { now: false }
    const { sent } = fakeRpc(STORE(), { deny })
    const auths = () =>
      sent.filter((s) => (s.body['params'] as { service: string }).service === 'common').length
    await new OdooClient(RPC_CREDS).searchCount('res.partner', [])
    deny.now = true
    await expect(new OdooClient(RPC_CREDS).searchCount('res.partner', [])).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    deny.now = false
    await new OdooClient(RPC_CREDS).searchCount('res.partner', [])
    expect(auths()).toBe(2)
  })

  it('a different key never reuses the uid cached for the old one', async () => {
    const { sent } = fakeRpc(STORE())
    await new OdooClient(RPC_CREDS).searchCount('res.partner', [])
    const err = await new OdooClient({ ...RPC_CREDS, accessToken: 'rotated-key' })
      .searchCount('res.partner', [])
      .catch((e) => e)
    expect(err).toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 })
    const auths = sent.filter((x) => (x.body['params'] as { service: string }).service === 'common')
    expect(auths.map((x) => (x.body['params'] as { args: unknown[] }).args[2])).toEqual([
      KEY,
      'rotated-key',
    ])
  })
})

describe('searchPage: a full last page', () => {
  it('reports no more rows when the page ends exactly at the total', async () => {
    fakeJson2(STORE())
    const p = await new OdooClient(JSON2_CREDS).searchPage('res.partner', {
      domain: [['is_company', '=', true]],
      fields: ['name'],
      offset: 0,
      limit: 3,
    })
    expect(p).toMatchObject({ totalCount: 3, hasMore: false })
    expect(p.rows).toHaveLength(3)
  })
})

describe('ODOO_CREDENTIAL_FORM: refusals', () => {
  const form = ODOO_CREDENTIAL_FORM
  const ok = { baseUrl: BASE, apiVersion: 'json2', apiKey: KEY }
  it('refuses a URL with a user name or password', async () => {
    await expect(
      form.exchangeCredentials({ ...ok, baseUrl: 'https://u:p@mycompany.example.com' }),
    ).rejects.toThrow(/user name or password/)
  })
  it('refuses a database name outside [A-Za-z0-9_.-]', async () => {
    await expect(form.exchangeCredentials({ ...ok, database: 'my db;' })).rejects.toThrow(
      /Database name may only contain/,
    )
  })
  it('keeps no login on a JSON-2 connection', async () => {
    const creds = await form.exchangeCredentials({ ...ok, login: 'bot@example.com' })
    expect(creds.extra).not.toHaveProperty('login')
  })
  it('refuses a blank API key', async () => {
    await expect(form.exchangeCredentials({ ...ok, apiKey: '   ' })).rejects.toThrow(
      /API key is required/,
    )
  })
  it('refuses a host that does not resolve', async () => {
    setDnsResolver(async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    })
    await expect(form.exchangeCredentials(ok)).rejects.toThrow(/could not be resolved/)
  })
})
