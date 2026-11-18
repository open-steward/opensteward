/**
 * Mifiel list paging and request shape.
 *
 * The fake answers at the axios layer and honours ONLY the documented request.
 *
 *   - Servers (https://docs.mifiel.com/en/api.json): "https://app.mifiel.com"
 *     and "https://app-sandbox.mifiel.com".
 *   - Auth: securitySchemes `BasicAuth` ("type": "http", "scheme": "basic");
 *     the cURL samples send `-u "$APP_ID:$APP_SECRET"`.
 *   - `POST /api/query` ("Advanced information"), body `QueryRequest`:
 *     `fields`, `resource` (both required), `page` ("default": 1), `per_page`
 *     ("default": 10), `q`, `sort`, `version`. The guide
 *     (https://guia.mifiel.com/como-hacer-busquedas-avanzadas-api) adds: "El
 *     endpoint que utilizarás para solicitar los recursos es: /api/query",
 *     the `"q": { "{attribute_name}": { "{predicate}": "{search term}" } }`
 *     filter form with the String predicate "eq: igual a", and responses of
 *     `{ "_metadata": { page, per_page, page_count, total_count }, "records": [...] }`.
 *     Only the requested `fields` come back, so the fake projects on them.
 */
import axios, { type AxiosRequestConfig } from 'axios'
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  DEFAULT_PAGE_LIMIT,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { MifielAdapter } from '../../../../../../src/verticals/docsign/adapters/mifiel'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { QUERY_RECORD_EXAMPLE, STAKEHOLDER_EXAMPLE } from './transform/fixtures'

const CREDS: Credentials = { accessToken: 'app-secret-1', extra: { appId: 'app-id-1' } }
const L = 2
const N = 2 * L + 1
const CALL_BUDGET = 50
const QUERY_KEYS = ['fields', 'resource', 'page', 'per_page', 'q', 'sort', 'version']

const adapter = new MifielAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

interface Sent {
  method: string
  url: string
  body: Record<string, unknown> | undefined
  params: unknown
  headers: Record<string, unknown>
  auth: unknown
  baseURL: string | undefined
}

type Row = Record<string, unknown>

/** Keep only the requested `fields`, including `relation(a,b)` sub-fields. */
function project(row: Row, fields: string): Row {
  const out: Row = {}
  for (const m of fields.matchAll(/([a-z_]+)(?:\(([^)]*)\))?/g)) {
    const [, name, sub] = m
    if (!(name! in row)) continue
    const value = row[name!]
    out[name!] =
      sub !== undefined && Array.isArray(value) ? value.map((v) => project(v as Row, sub)) : value
  }
  return out
}

/** POST /api/query over `rows`, honouring only the documented body. */
function fakeQuery(rows: Row[], opts: { metadata?: boolean } = {}) {
  const sent: Sent[] = []
  let calls = 0
  const spy = vi.spyOn(axios.Axios.prototype, 'request').mockImplementation(async function (
    this: { defaults: AxiosRequestConfig },
    config,
  ) {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    const cfg = config as AxiosRequestConfig
    const body = cfg.data as Record<string, unknown> | undefined
    sent.push({
      method: String(cfg.method),
      url: String(cfg.url),
      body,
      params: cfg.params,
      headers: { ...(this.defaults.headers as unknown as Record<string, unknown>) },
      auth: this.defaults.auth,
      baseURL: this.defaults.baseURL,
    })
    if (cfg.method !== 'post' || cfg.url !== '/api/query') {
      throw new Error(`undocumented request ${String(cfg.method)} ${String(cfg.url)}`)
    }
    if (cfg.params !== undefined) throw new Error('POST /api/query takes no query string')
    for (const k of Object.keys(body ?? {})) {
      if (!QUERY_KEYS.includes(k)) throw new Error(`undocumented body key ${k}`)
    }
    if (body?.['resource'] !== 'document') throw new Error('resource must be "document"')
    if (typeof body['fields'] !== 'string') throw new Error('fields is required')
    let matching = rows
    const q = body['q'] as Record<string, Record<string, unknown>> | undefined
    if (q !== undefined) {
      for (const [attr, pred] of Object.entries(q)) {
        const keys = Object.keys(pred)
        if (keys.length !== 1 || keys[0] !== 'eq') throw new Error('only eq is honoured')
        matching = matching.filter((r) => r[attr] === pred['eq'])
      }
    }
    const page = (body['page'] as number | undefined) ?? 1
    const perPage = (body['per_page'] as number | undefined) ?? 10
    const records = matching
      .slice((page - 1) * perPage, page * perPage)
      .map((r) => project(r, body['fields'] as string))
    const data: Record<string, unknown> = { records }
    if (opts.metadata !== false) {
      data['_metadata'] = {
        page,
        per_page: perPage,
        page_count: Math.ceil(matching.length / perPage),
        total_count: matching.length,
      }
    }
    return { data, status: 200, headers: {}, config: cfg } as never
  })
  return { sent, spy }
}

const docIds = (n: number) => Array.from({ length: n }, (_, i) => `doc-${i + 1}`)
const docs = (n: number): Row[] =>
  docIds(n).map((id) => ({ ...QUERY_RECORD_EXAMPLE, id, file_file_name: `${id}.pdf` }))

async function walk(
  list: (params: QueryParams) => Promise<Array<{ id: string }>>,
  pages: number,
  limit = L,
) {
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    seen.push(...(await list(params)).map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

describe('MifielAdapter auth and base URL', () => {
  it('sends HTTP Basic APP_ID:APP_SECRET to app.mifiel.com, not a bearer token', async () => {
    const { sent } = fakeQuery(docs(1))
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    expect(sent[0]!.baseURL).toBe('https://app.mifiel.com')
    expect(sent[0]!.auth).toEqual({ username: 'app-id-1', password: 'app-secret-1' })
    expect(sent[0]!.headers['Authorization']).toBeUndefined()
  })

  it('exchangeCredentials stores the secret as the token and the app id in extra', async () => {
    await expect(adapter.exchangeCredentials({ appId: 'id', appSecret: 'sec' })).resolves.toEqual({
      accessToken: 'sec',
      extra: { appId: 'id' },
    })
    await expect(adapter.exchangeCredentials({ appSecret: 'sec' })).rejects.toThrow(/appId/)
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['appId', 'appSecret'])
  })

  it('a connection without an app id fails before sending anything', async () => {
    const { spy } = fakeQuery(docs(1))
    await expect(
      adapter.listEnvelopes({ accessToken: 'k' }, withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/APP_ID/)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('MifielAdapter.listEnvelopes pages POST /api/query by page and per_page', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeQuery(docs(N))
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p), 3)
    expect(seen).toEqual(docIds(N))
    expect(more).toEqual([true, true, false])
  })

  it("sends the caller's page and exact limit in the documented body", async () => {
    const { sent } = fakeQuery(docs(N))
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.body).toEqual({
      version: '1.0.0',
      resource: 'document',
      page: 2,
      per_page: L,
      sort: 'created_at-asc',
      fields: 'id,file_file_name,state,signed,created_at,stakeholders(id,type,email,name,state)',
    })
  })

  it('with no page or limit it asks for page 1 and the default limit, not the upstream 10', async () => {
    const { sent } = fakeQuery(docs(N))
    await adapter.listEnvelopes(CREDS, withPageSink({}))
    expect(sent[0]!.body).toMatchObject({ page: 1, per_page: DEFAULT_PAGE_LIMIT })
  })

  it('a fractional page or limit is floored to a whole number', async () => {
    const { sent } = fakeQuery(docs(N))
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2.7, limit: 2.9 }))
    expect(sent[0]!.body).toMatchObject({ page: 2, per_page: 2 })
  })

  it('reports the total and page count from _metadata', async () => {
    fakeQuery(docs(N))
    const params = withPageSink({ page: 1, limit: L })
    await adapter.listEnvelopes(CREDS, params)
    expect(readUpstreamPage(params)).toEqual({
      totalCount: N,
      totalPages: 3,
      currentPage: 1,
      hasMore: true,
    })
  })

  it('an exactly full last page reports its end from page_count', async () => {
    fakeQuery(docs(2 * L))
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p), 2)
    expect(seen).toEqual(docIds(2 * L))
    expect(more).toEqual([true, false])
  })

  it('without _metadata nothing is reported rather than guessed', async () => {
    fakeQuery(docs(N), { metadata: false })
    const params = withPageSink({ page: 1, limit: L })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows).toHaveLength(L)
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('a response without a records array is an error', async () => {
    vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValue({ data: {} } as never)
    await expect(adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /records/,
    )
  })

  it('every envelope parses', async () => {
    fakeQuery(docs(1))
    const [env] = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    expect(EnvelopeSchema.parse(env).signerIds).toEqual([STAKEHOLDER_EXAMPLE.id])
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    fakeQuery(docs(N))
    const params = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'mifiel')
    expect(env.data.map((r) => r.id)).toEqual(docIds(N).slice(L, 2 * L))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('MifielAdapter reads one document through POST /api/query q.id.eq', () => {
  it('getEnvelope sends the id filter and parses the record', async () => {
    const { sent } = fakeQuery(docs(3))
    const env = EnvelopeSchema.parse(await adapter.getEnvelope(CREDS, 'doc-2'))
    expect(env.id).toBe('doc-2')
    expect(sent[0]!.body).toEqual({
      version: '1.0.0',
      resource: 'document',
      q: { id: { eq: 'doc-2' } },
      fields: 'id,file_file_name,state,signed,created_at,stakeholders(id,type,email,name,state)',
    })
  })

  it('an id that matches nothing is a 404', async () => {
    fakeQuery(docs(3))
    await expect(adapter.getEnvelope(CREDS, 'nope')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('records other than the requested id are an error, never read as that document', async () => {
    vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValue({
      data: { records: docs(2) },
    } as never)
    await expect(adapter.getEnvelope(CREDS, 'doc-2')).rejects.toThrow(/other than doc-2/)
  })

  it('getDocument returns the document as its one file', async () => {
    fakeQuery(docs(3))
    const doc = DocumentSchema.parse(await adapter.getDocument(CREDS, 'doc-3'))
    expect(doc).toMatchObject({ id: 'doc-3', envelopeId: 'doc-3', name: 'doc-3.pdf', order: 0 })
  })
})

describe('MifielAdapter.listSigners pages the document stakeholders locally', () => {
  const signers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ ...STAKEHOLDER_EXAMPLE, id: `stk-${i + 1}` }))

  function fakeDoc(n: number) {
    return fakeQuery([
      {
        ...QUERY_RECORD_EXAMPLE,
        id: 'doc-1',
        stakeholders: [
          ...signers(n),
          { ...STAKEHOLDER_EXAMPLE, id: 'reviewer-1', type: 'Reviewer' },
        ],
      },
      { ...QUERY_RECORD_EXAMPLE, id: 'doc-2', stakeholders: signers(1) },
    ])
  }

  it('pages 1..3 return every signer once with an exact hasMore', async () => {
    const { sent } = fakeDoc(N)
    const { seen, more } = await walk((p) => adapter.listSigners(CREDS, 'doc-1', p), 3)
    expect(seen).toEqual(signers(N).map((s) => s.id))
    expect(more).toEqual([true, true, false])
    expect(sent.every((s) => JSON.stringify(s.body?.['q']) === '{"id":{"eq":"doc-1"}}')).toBe(true)
  })

  it('every signer parses and carries the document id it was listed under', async () => {
    fakeDoc(1)
    const [s] = await adapter.listSigners(CREDS, 'doc-1', withPageSink({ page: 1, limit: L }))
    expect(SignerSchema.parse(s).envelopeId).toBe('doc-1')
  })
})

describe('MifielAdapter.listDocuments serves the document itself, paged locally', () => {
  it('page 1 holds the one file and page 2 is empty, hasMore exact', async () => {
    fakeQuery(docs(3))
    const { seen, more } = await walk((p) => adapter.listDocuments(CREDS, 'doc-2', p), 2, 1)
    expect(seen).toEqual(['doc-2'])
    expect(more).toEqual([false, false])
  })
})
