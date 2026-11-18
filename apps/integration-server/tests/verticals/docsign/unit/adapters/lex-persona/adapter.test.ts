/**
 * Request shape and paging for the Lex Persona (Goodflag Signature Workflow
 * Manager) adapter, against a fake tenant that honours only what the docs
 * document:
 *
 * - every `Search *` endpoint takes `itemsPerPage` ("maximum 50", default 50)
 *   and a 0-based `pageIndex` (default 0), answers `{ pageIndex,
 *   itemsPerPage, totalItems, items }`
 *   (https://docs.goodflag.com/wm/api-reference/structure.md);
 * - `GET /api/workflows`, `GET /api/workflows/{workflowId}`,
 *   `GET /api/documents` (filter `items.workflowId`),
 *   `GET /api/documents/{documentId}`, `GET /api/templates`,
 *   `GET /api/templates/{templateId}`, `GET /api/templateDocuments`
 *   (filter `items.templateId`);
 * - `Authorization: Bearer <token>` on the tenant's own host.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { withPageSink, readUpstreamPage, _resetRowPager } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { LexPersonaAdapter } from '../../../../../../src/verticals/docsign/adapters/lex-persona'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { TemplateSchema } from '../../../../../../src/verticals/docsign/schema/template'
import { document, template, workflow } from './fixtures'

const HOST = 'https://acme.tenant.example'
const TOKEN = 'act_abc.secret'
const CREDS: Credentials = { accessToken: TOKEN, extra: { baseUrl: HOST } }
const MAX = 50
const adapter = new LexPersonaAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

interface Sent {
  path: string
  params: Record<string, unknown>
}

const SEARCH_FILTERS: Record<string, string[]> = {
  '/api/workflows': [],
  '/api/documents': ['items.workflowId'],
  '/api/templates': [],
  '/api/templateDocuments': ['items.templateId'],
}

function httpError(status: number, config: InternalAxiosRequestConfig): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    config,
    response: { status, data: { status, code: 'InvalidRequestField' } },
  })
}

let sent: Sent[] = []
let inFlight = 0
let maxInFlight = 0
let originalAdapter: typeof axios.defaults.adapter

/**
 * Installs a fake tenant. `rows[path]` is the whole collection of a search
 * endpoint (already filtered); `byId[path]` answers a lookup.
 */
function fakeTenant(opts: {
  rows?: Record<string, Array<Record<string, unknown>>>
  byId?: Record<string, unknown>
  omitTotal?: boolean
  /** Answer this `totalItems` instead of the true count. */
  totalOverride?: number
  /** Other tenant hosts (same token), each with its own collections. */
  tenants?: Record<string, Record<string, Array<Record<string, unknown>>>>
}) {
  const fake: AxiosAdapter = async (config) => {
    const url = new URL(axios.getUri(config))
    const rows = url.origin === HOST ? opts.rows : opts.tenants?.[url.origin]
    if (url.origin !== HOST && !rows) throw new Error(`request left the tenant host: ${url.origin}`)
    if (config.headers?.['Authorization'] !== `Bearer ${TOKEN}`) throw httpError(403, config)
    const params = { ...(config.params as Record<string, unknown> | undefined) }
    sent.push({ path: url.pathname, params })
    if (url.pathname === '/api/templateDocuments') {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
    }
    const filters = SEARCH_FILTERS[url.pathname]
    if (filters) {
      for (const k of Object.keys(params))
        if (!['itemsPerPage', 'pageIndex', ...filters].includes(k)) throw httpError(400, config)
      const size = params['itemsPerPage'] === undefined ? 50 : Number(params['itemsPerPage'])
      const pageIndex = params['pageIndex'] === undefined ? 0 : Number(params['pageIndex'])
      if (!Number.isInteger(size) || size < 1 || size > MAX) throw httpError(400, config)
      if (!Number.isInteger(pageIndex) || pageIndex < 0) throw httpError(400, config)
      const all = rows?.[url.pathname] ?? []
      const data: Record<string, unknown> = {
        pageIndex,
        itemsPerPage: size,
        items: all.slice(pageIndex * size, (pageIndex + 1) * size),
      }
      if (!opts.omitTotal) data['totalItems'] = opts.totalOverride ?? all.length
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    if (Object.keys(params).length > 0) throw httpError(400, config)
    const found = opts.byId?.[url.pathname]
    if (found === undefined) throw httpError(404, config)
    return { data: found, status: 200, statusText: 'OK', headers: {}, config }
  }
  axios.defaults.adapter = fake
}

beforeEach(() => {
  _resetRowPager()
  sent = []
  inFlight = 0
  maxInFlight = 0
  originalAdapter = axios.defaults.adapter
})
afterEach(() => {
  axios.defaults.adapter = originalAdapter
})

const workflows = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => workflow({ id: `wfl_${i}` }) as unknown as Record<string, unknown>,
  )
const documents = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => document({ id: `doc_${i}` }) as unknown as Record<string, unknown>,
  )
const templates = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => template({ id: `wtm_${i}` }) as unknown as Record<string, unknown>,
  )

type Lister = (p: QueryParams) => Promise<Array<{ id: string }>>

describe('LexPersonaAdapter request shape', () => {
  it('listEnvelopes sends GET {tenant}/api/workflows with itemsPerPage and a 0-based pageIndex', async () => {
    fakeTenant({ rows: { '/api/workflows': workflows(3) } })
    const out = await adapter.listEnvelopes(CREDS, { page: 2, limit: 2 })
    expect(sent).toEqual([{ path: '/api/workflows', params: { itemsPerPage: 2, pageIndex: 1 } }])
    expect(out.map((e) => EnvelopeSchema.parse(e).id)).toEqual(['wfl_2'])
  })

  it('getEnvelope reads GET /api/workflows/{workflowId}', async () => {
    fakeTenant({ byId: { '/api/workflows/wfl_9': workflow({ id: 'wfl_9' }) } })
    const env = EnvelopeSchema.parse(await adapter.getEnvelope(CREDS, 'wfl_9'))
    expect(env.id).toBe('wfl_9')
    expect(sent).toEqual([{ path: '/api/workflows/wfl_9', params: {} }])
  })

  it('listSigners reads the step recipients of GET /api/workflows/{workflowId}', async () => {
    fakeTenant({ byId: { '/api/workflows/wfl_1': workflow() } })
    const out = await adapter.listSigners(CREDS, 'wfl_1', { page: 1, limit: 50 })
    expect(sent).toEqual([{ path: '/api/workflows/wfl_1', params: {} }])
    expect(out.map((s) => SignerSchema.parse(s).id)).toEqual([
      'stp_A:alice@example.com',
      'stp_B:bob@example.com',
      'stp_B:carol@example.com',
      'stp_C:dave@example.com',
    ])
  })

  it('listDocuments searches GET /api/documents filtered by items.workflowId', async () => {
    fakeTenant({ rows: { '/api/documents': documents(2) } })
    const out = await adapter.listDocuments(CREDS, 'wfl_1', { page: 1, limit: 10 })
    expect(sent).toEqual([
      {
        path: '/api/documents',
        params: { 'items.workflowId': 'wfl_1', itemsPerPage: 10, pageIndex: 0 },
      },
    ])
    expect(out.map((d) => DocumentSchema.parse(d).id)).toEqual(['doc_0', 'doc_1'])
  })

  it('getDocument reads GET /api/documents/{documentId}', async () => {
    fakeTenant({ byId: { '/api/documents/doc_5': document({ id: 'doc_5' }) } })
    expect(DocumentSchema.parse(await adapter.getDocument(CREDS, 'doc_5')).id).toBe('doc_5')
  })

  it("listTemplates searches GET /api/templates and counts each template's documents", async () => {
    fakeTenant({
      rows: { '/api/templates': templates(1), '/api/templateDocuments': documents(3) },
    })
    const out = await adapter.listTemplates(CREDS, { page: 1, limit: 5 })
    expect(sent).toEqual([
      { path: '/api/templates', params: { itemsPerPage: 5, pageIndex: 0 } },
      {
        path: '/api/templateDocuments',
        params: { 'items.templateId': 'wtm_0', itemsPerPage: 1, pageIndex: 0 },
      },
    ])
    const t = TemplateSchema.parse(out[0])
    expect(t.id).toBe('wtm_0')
    expect(t.documentCount).toBe(3)
  })

  it('getTemplate reads GET /api/templates/{templateId}', async () => {
    fakeTenant({
      byId: { '/api/templates/wtm_7': template({ id: 'wtm_7' }) },
      rows: { '/api/templateDocuments': [] },
    })
    const t = TemplateSchema.parse(await adapter.getTemplate(CREDS, 'wtm_7'))
    expect(t.id).toBe('wtm_7')
    expect(t.documentCount).toBe(0)
  })

  it('a template count without totalItems throws rather than guessing', async () => {
    fakeTenant({
      byId: { '/api/templates/wtm_7': template({ id: 'wtm_7' }) },
      omitTotal: true,
    })
    await expect(adapter.getTemplate(CREDS, 'wtm_7')).rejects.toThrow(/totalItems/)
  })

  it('a connection without a tenant URL sends nothing', async () => {
    fakeTenant({ rows: { '/api/workflows': workflows(1) } })
    await expect(
      adapter.listEnvelopes({ accessToken: TOKEN, extra: {} }, { page: 1, limit: 5 }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(sent).toEqual([])
  })
})

describe('LexPersonaAdapter audit trail is refused', () => {
  it('listAuditTrailEntries throws 501 NOT_SUPPORTED and sends no request', async () => {
    fakeTenant({})
    await expect(adapter.listAuditTrailEntries(CREDS, 'wfl_1', {})).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(sent).toEqual([])
  })

  it('getAuditTrailEntry throws 501 NOT_SUPPORTED and sends no request', async () => {
    fakeTenant({})
    await expect(adapter.getAuditTrailEntry(CREDS, 'wfl_1:0')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(sent).toEqual([])
  })
})

describe('LexPersonaAdapter credentials', () => {
  it('collects the API token and the tenant URL', async () => {
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['apiKey', 'baseUrl'])
    await expect(
      adapter.exchangeCredentials({ apiKey: TOKEN, baseUrl: 'https://acme.tenant.example/' }),
    ).resolves.toEqual({ accessToken: TOKEN, extra: { baseUrl: HOST } })
  })

  it('rejects a missing or non-https tenant URL', async () => {
    await expect(adapter.exchangeCredentials({ apiKey: TOKEN })).rejects.toThrow(/baseUrl/)
    await expect(
      adapter.exchangeCredentials({ apiKey: TOKEN, baseUrl: 'http://acme.tenant.example' }),
    ).rejects.toThrow(/https/)
  })
})

const SEARCHES: Array<[string, (n: number, omitTotal?: boolean) => void, Lister]> = [
  [
    'listEnvelopes',
    (n, omitTotal) => fakeTenant({ rows: { '/api/workflows': workflows(n) }, omitTotal }),
    (p) => adapter.listEnvelopes(CREDS, p),
  ],
  [
    'listDocuments',
    (n, omitTotal) => fakeTenant({ rows: { '/api/documents': documents(n) }, omitTotal }),
    (p) => adapter.listDocuments(CREDS, 'wfl_1', p),
  ],
  [
    'listTemplates',
    (n) => fakeTenant({ rows: { '/api/templates': templates(n), '/api/templateDocuments': [] } }),
    (p) => adapter.listTemplates(CREDS, p),
  ],
]

describe.each(SEARCHES)('LexPersonaAdapter.%s paging', (_name, install, list) => {
  async function walk(n: number, limit: number) {
    install(n)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    const pages = Math.ceil(n / limit) || 1
    for (let page = 1; page <= pages; page++) {
      const params = withPageSink({ page, limit })
      seen.push(...(await list(params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    return { seen, more }
  }

  it('walks N = 2L+1 rows at L = 4: every id once, hasMore exact', async () => {
    const { seen, more } = await walk(9, 4)
    expect(seen).toHaveLength(9)
    expect(new Set(seen).size).toBe(9)
    expect(more).toEqual([true, true, false])
  })

  it('a collection ending exactly on a page reports no more', async () => {
    const { more } = await walk(8, 4)
    expect(more).toEqual([true, false])
  })

  it('at the sync limit of 500, never sends itemsPerPage above 50 and serves every row once', async () => {
    const { seen, more } = await walk(1001, 500)
    expect(seen).toHaveLength(1001)
    expect(new Set(seen).size).toBe(1001)
    expect(more).toEqual([true, true, false])
    expect(sent.every((s) => Number(s.params['itemsPerPage']) <= MAX)).toBe(true)
  })
})

describe.each(SEARCHES.filter(([name]) => name !== 'listTemplates'))(
  'LexPersonaAdapter.%s without totalItems',
  (_name, install, list) => {
    it('a short page ends the walk: N = 2L+1 at L = 4', async () => {
      install(9, true)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: 4 })
        seen.push(...(await list(params)).map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toHaveLength(9)
      expect(new Set(seen).size).toBe(9)
      expect(more).toEqual([true, true, false])
    })
  },
)

describe('LexPersonaAdapter.listSigners paging', () => {
  it('pages the recipients of one workflow locally: N = 2L+1 at L = 2', async () => {
    const wf = workflow()
    // 5 recipients: 1 + 2 + 1 from the fixture, plus one more on the last step.
    wf.steps[2]!.recipients.push({
      consentPageId: 'cop_Default',
      email: 'erin@example.com',
      firstName: 'Erin',
      lastName: 'Blanc',
      country: 'FR',
    })
    fakeTenant({ byId: { '/api/workflows/wfl_1': wf } })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 2 })
      seen.push(...(await adapter.listSigners(CREDS, 'wfl_1', params)).map((s) => s.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toHaveLength(5)
    expect(new Set(seen).size).toBe(5)
    expect(more).toEqual([true, true, false])
  })
})

describe('LexPersonaAdapter search edge cases', () => {
  it('numbers documents without orderIndex by their position in the whole result, across pages', async () => {
    const unordered = Array.from(
      { length: 9 },
      (_, i) =>
        document({ id: `doc_${i}`, orderIndex: undefined }) as unknown as Record<string, unknown>,
    )
    fakeTenant({ rows: { '/api/documents': unordered } })
    const orders: number[] = []
    for (const page of [1, 2, 3]) {
      const out = await adapter.listDocuments(CREDS, 'wfl_1', { page, limit: 4 })
      orders.push(...out.map((d) => DocumentSchema.parse(d).order))
    }
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('reports totalItems as the upstream totalCount', async () => {
    fakeTenant({ rows: { '/api/workflows': workflows(9) } })
    const params = withPageSink({ page: 1, limit: 4 })
    await adapter.listEnvelopes(CREDS, params)
    expect(readUpstreamPage(params)?.totalCount).toBe(9)
  })

  it('an empty page ends a >50 walk even when totalItems overstates the collection', async () => {
    fakeTenant({ rows: { '/api/workflows': workflows(55) }, totalOverride: 500 })
    const params = withPageSink({ page: 1, limit: 60 })
    const out = await adapter.listEnvelopes(CREDS, params)
    expect(out).toHaveLength(55)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    // pageIndex 0 (50 rows), 1 (5 rows), 2 (empty): the empty page stops the
    // walk instead of paging on toward the claimed 500.
    expect(sent.map((s) => s.params['pageIndex'])).toEqual([0, 1, 2])
  })

  it('two tenants sharing a token never share a >50 walk', async () => {
    const OTHER = 'https://other.tenant.example'
    const rowsOf = (prefix: string) =>
      Array.from(
        { length: 200 },
        (_, i) => workflow({ id: `${prefix}_${i}` }) as unknown as Record<string, unknown>,
      )
    fakeTenant({
      rows: { '/api/workflows': rowsOf('a') },
      tenants: { [OTHER]: { '/api/workflows': rowsOf('b') } },
    })
    await adapter.listEnvelopes(CREDS, { page: 1, limit: 60 })
    const other = await adapter.listEnvelopes(
      { accessToken: TOKEN, extra: { baseUrl: OTHER } },
      { page: 2, limit: 60 },
    )
    expect(other.map((e) => e.id)).toEqual(Array.from({ length: 60 }, (_, i) => `b_${60 + i}`))
  })

  it('counts template documents at most 4 requests at a time, in template order', async () => {
    fakeTenant({ rows: { '/api/templates': templates(12), '/api/templateDocuments': [] } })
    const out = await adapter.listTemplates(CREDS, { page: 1, limit: 12 })
    expect(out.map((t) => t.id)).toEqual(Array.from({ length: 12 }, (_, i) => `wtm_${i}`))
    expect(sent.filter((s) => s.path === '/api/templateDocuments')).toHaveLength(12)
    expect(maxInFlight).toBeGreaterThan(1)
    expect(maxInFlight).toBeLessThanOrEqual(4)
  })
})

describe('LexPersonaAdapter.getSigner', () => {
  it('throws 501 NOT_SUPPORTED and sends no request', async () => {
    fakeTenant({})
    await expect(adapter.getSigner(CREDS, 'stp_A:alice@example.com')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(sent).toEqual([])
  })
})
