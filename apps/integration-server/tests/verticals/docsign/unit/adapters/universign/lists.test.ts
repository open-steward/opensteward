/**
 * Universign list methods against a fake of the documented API v1
 * (https://apps.universign.com/docs/api/):
 *
 * - GET /v1/transactions: `size` "Maximum is 100, default is 50",
 *   `starting_after` "Expected value is a transaction ID", response
 *   `{ has_more, content }`.
 * - GET /v1/transactions/{transaction_id}: the whole transaction object.
 * - GET /v1/templates: `size` "Default is 50", `starting_after` a template
 *   ID, response `{ has_more, content }`.
 * - GET /v1/templates/{template_id}.
 *
 * The fake answers only those paths on the production base URL, rejects any
 * other query parameter, and enforces the documented `size` maximum.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { UniversignClient } from '../../../../../../src/verticals/docsign/adapters/universign/client'
import { UniversignAdapter } from '../../../../../../src/verticals/docsign/adapters/universign'
import { basicAuthHeader } from '../../../../../../src/verticals/docsign/adapters/universign/auth'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { TemplateSchema } from '../../../../../../src/verticals/docsign/schema/template'
import { GET_TEMPLATE, START_TRANSACTION } from './fixtures'

const CREDS = { accessToken: 'key_123' } as Credentials
const adapter = new UniversignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })
const PROD = 'https://api.universign.com'

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

const txId = (i: number) => `tx_${i}`
const tplId = (i: number) => `tpl_${i}`

function pageOf<T extends { id: string }>(rows: T[], params: Record<string, unknown> | undefined) {
  for (const k of Object.keys(params ?? {})) {
    if (k !== 'size' && k !== 'starting_after') throw new Error(`undocumented param ${k}`)
  }
  const size = Number(params?.['size'] ?? 50)
  const after = params?.['starting_after']
  const start = after === undefined ? 0 : rows.findIndex((r) => r.id === after) + 1
  if (after !== undefined && start === 0) throw new Error(`unknown starting_after ${String(after)}`)
  const content = rows.slice(start, start + size)
  return { has_more: start + size < rows.length, content }
}

function mockApi(
  opts: {
    transactions?: number
    templates?: number
    participants?: number
    documents?: number
  } = {},
) {
  const nTx = opts.transactions ?? 0
  const txRows = Array.from({ length: nTx }, (_, i) => ({
    object: 'transaction',
    id: txId(i),
    state: 'draft',
  }))
  const tplRows = Array.from({ length: opts.templates ?? 0 }, (_, i) => ({
    ...GET_TEMPLATE,
    id: tplId(i),
    template_name: `Template ${i}`,
  }))
  const participants = Array.from({ length: opts.participants ?? 0 }, (_, i) => ({
    email: `p${i}@example.com`,
    state: 'open',
  }))
  const documents = Array.from({ length: opts.documents ?? 0 }, (_, i) => ({
    id: `doc_${i}`,
    name: `Doc ${i}.pdf`,
    fields: [],
  }))
  const calls: Array<{ path: string; params?: Record<string, unknown> }> = []
  const get = vi.spyOn(UniversignClient.prototype, 'get').mockImplementation(async function (
    this: UniversignClient,
    path: string,
    params?: Record<string, unknown>,
  ) {
    if (this.baseURL !== PROD) throw new Error(`wrong base ${this.baseURL}`)
    calls.push({ path, params })
    if (path === '/v1/transactions') {
      const size = Number(params?.['size'])
      if (!(size >= 1 && size <= 100)) throw new Error(`size ${size} outside 1..100`)
      return pageOf(txRows, params) as never
    }
    if (path === '/v1/templates') return pageOf(tplRows, params) as never
    let m = /^\/v1\/transactions\/([^/]+)$/.exec(path)
    if (m) {
      if (params !== undefined) throw new Error(`${path} documents no query params`)
      const id = decodeURIComponent(m[1]!)
      return { ...START_TRANSACTION, id, state: 'started', participants, documents } as never
    }
    m = /^\/v1\/templates\/([^/]+)$/.exec(path)
    if (m) {
      if (params !== undefined) throw new Error(`${path} documents no query params`)
      return { ...GET_TEMPLATE, id: decodeURIComponent(m[1]!) } as never
    }
    throw new Error(`undocumented path ${path}`)
  })
  return { get, calls }
}

const L = 2
const N = 2 * L + 1

async function walk<T extends { externalId: string }>(
  list: (params: ReturnType<typeof withPageSink>) => Promise<T[]>,
) {
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit: L })
    const rows = await list(params)
    seen.push(...rows.map((r) => r.externalId))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

/**
 * A real UniversignClient whose axios transport is swapped for a recorder, so
 * the request axios would put on the wire (base URL, path, query,
 * Authorization) is checked, not just the helpers that feed it.
 */
function wiredClient(responses: Array<{ status: number; data: unknown }>) {
  const client = new UniversignClient(CREDS)
  const http = (client as unknown as { http: AxiosInstance }).http
  const sent: InternalAxiosRequestConfig[] = []
  http.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    sent.push(config)
    const r = responses.shift() ?? { status: 200, data: {} }
    const response = { data: r.data, status: r.status, statusText: '', headers: {}, config }
    if (r.status >= 400) {
      throw new AxiosError('fail', String(r.status), config, undefined, response as never)
    }
    return response
  }
  return { client, sent }
}

describe('UniversignClient HTTP wiring', () => {
  it('sends to https://api.universign.com with Basic "<apiKey>:"', async () => {
    const { client, sent } = wiredClient([{ status: 200, data: { has_more: false, content: [] } }])
    await client.get('/v1/transactions', { size: 5 })
    expect(sent).toHaveLength(1)
    const c = sent[0]!
    expect(c.baseURL).toBe(PROD)
    expect(c.url).toBe('/v1/transactions')
    expect(c.params).toEqual({ size: 5 })
    expect(c.headers.get('Authorization')).toBe(
      `Basic ${Buffer.from('key_123:').toString('base64')}`,
    )
  })

  it('retries a 429 ("Too many requests") and returns the next answer', async () => {
    vi.useFakeTimers()
    try {
      const { client, sent } = wiredClient([
        { status: 429, data: {} },
        { status: 200, data: { ok: true } },
      ])
      const p = client.get('/v1/templates')
      await vi.advanceTimersByTimeAsync(1000)
      await expect(p).resolves.toEqual({ ok: true })
      expect(sent).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('UniversignAdapter auth', () => {
  it('sends the API key as the Basic username with an empty password', () => {
    expect(basicAuthHeader(CREDS)).toBe(`Basic ${Buffer.from('key_123:').toString('base64')}`)
  })

  it('collects only the API key', async () => {
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['apiKey'])
    await expect(adapter.exchangeCredentials({ apiKey: ' key_123 ' })).resolves.toEqual({
      accessToken: 'key_123',
    })
  })
})

describe('UniversignAdapter.listEnvelopes pages GET /v1/transactions', () => {
  it('walks N = 2L+1 transactions: every id once, exact hasMore', async () => {
    mockApi({ transactions: N })
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p))
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => txId(i)))
    expect(more).toEqual([true, true, false])
  })

  it('sends the caller size and starts each page after the last id of the one before', async () => {
    const { calls } = mockApi({ transactions: N })
    await walk((p) => adapter.listEnvelopes(CREDS, p))
    const lists = calls.filter((c) => c.path === '/v1/transactions').map((c) => c.params)
    expect(lists).toEqual([
      { size: L },
      { size: L, starting_after: txId(1) },
      { size: L, starting_after: txId(3) },
    ])
  })

  it('reads each served row back through GET /v1/transactions/{id}', async () => {
    const { calls } = mockApi({ transactions: N, participants: 2, documents: 1 })
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(calls.filter((c) => c.path.startsWith('/v1/transactions/')).map((c) => c.path)).toEqual([
      '/v1/transactions/tx_2',
      '/v1/transactions/tx_3',
    ])
    for (const r of rows) EnvelopeSchema.parse(r)
    expect(rows[0]!.signerIds).toEqual(['tx_2:p0@example.com', 'tx_2:p1@example.com'])
    expect(rows[0]!.documentIds).toEqual(['tx_2:doc_0'])
  })

  it('clamps size to the documented maximum of 100 and reports it', async () => {
    const { calls } = mockApi({ transactions: 150 })
    const params = withPageSink({ page: 1, limit: 250 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows).toHaveLength(100)
    expect(calls[0]!.params).toEqual({ size: 100 })
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 100 })
  })

  it('sends the documented default size of 50 when the caller gives no limit', async () => {
    const { calls } = mockApi({ transactions: 1 })
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1 }))
    expect(calls[0]!.params).toEqual({ size: 50 })
  })

  it('sends a whole-number size for a fractional limit', async () => {
    const { calls } = mockApi({ transactions: 5 })
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: 2.7 }))
    expect(calls[0]!.params).toEqual({ size: 2 })
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockApi({ transactions: N })
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter.listEnvelopes(CREDS, params), params, 'universign')
    expect(env.data.map((r) => r.externalId)).toEqual([txId(2), txId(3)])
    expect(env.meta.hasMore).toBe(true)
  })

  it('getEnvelope reads a listed id back', async () => {
    const { calls } = mockApi({ transactions: 1 })
    const e = await adapter.getEnvelope(CREDS, txId(0))
    expect(e.externalId).toBe(txId(0))
    expect(calls.map((c) => c.path)).toEqual(['/v1/transactions/tx_0'])
  })
})

describe('UniversignAdapter reads a transaction by the id it asked for', () => {
  it('rejects a transaction whose id is not the one requested', async () => {
    vi.spyOn(UniversignClient.prototype, 'get').mockResolvedValue({ ...START_TRANSACTION } as never)
    await expect(adapter.getEnvelope(CREDS, 'tx_other')).rejects.toThrow(
      /returned transaction tx_YLyDVeWbgW0z/,
    )
    await expect(adapter.listSigners(CREDS, 'tx_other', {})).rejects.toThrow(/returned transaction/)
  })
})

describe('UniversignAdapter.listSigners reads participants[ ] of GET /v1/transactions/{id}', () => {
  it('pages N = 2L+1 participants locally: every id once, exact hasMore', async () => {
    const { calls } = mockApi({ participants: N })
    const { seen, more } = await walk((p) => adapter.listSigners(CREDS, 'tx_9', p))
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `p${i}@example.com`))
    expect(more).toEqual([true, true, false])
    expect(new Set(calls.map((c) => c.path))).toEqual(new Set(['/v1/transactions/tx_9']))
  })

  it('returns schema-valid signers, readable back through getSigner', async () => {
    mockApi({ participants: 2 })
    const [s] = await adapter.listSigners(CREDS, 'tx_9', withPageSink({ page: 1, limit: 5 }))
    SignerSchema.parse(s)
    expect(s!.id).toBe('tx_9:p0@example.com')
    const back = await adapter.getSigner(CREDS, s!.id)
    expect(back.externalId).toBe('p0@example.com')
    await expect(adapter.getSigner(CREDS, 'tx_9:nobody@example.com')).rejects.toMatchObject({
      statusCode: 404,
    })
    await expect(adapter.getSigner(CREDS, 'p0@example.com')).rejects.toMatchObject({
      statusCode: 400,
    })
  })
})

describe('UniversignAdapter.listDocuments reads documents[ ] of GET /v1/transactions/{id}', () => {
  it('pages N = 2L+1 documents locally: every id once, exact hasMore', async () => {
    mockApi({ documents: N })
    const { seen, more } = await walk((p) => adapter.listDocuments(CREDS, 'tx_9', p))
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `doc_${i}`))
    expect(more).toEqual([true, true, false])
  })

  it('order is the position in the transaction; getDocument reads a listed id back', async () => {
    mockApi({ documents: N })
    const rows = await adapter.listDocuments(CREDS, 'tx_9', withPageSink({ page: 2, limit: L }))
    for (const r of rows) DocumentSchema.parse(r)
    expect(rows.map((r) => r.order)).toEqual([2, 3])
    const d = await adapter.getDocument(CREDS, rows[0]!.id)
    expect(d.name).toBe('Doc 2.pdf')
    expect(d.order).toBe(2)
    await expect(adapter.getDocument(CREDS, 'tx_9:doc_x')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('UniversignAdapter audit trail is refused', () => {
  it('listAuditTrailEntries throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get } = mockApi()
    const post = vi.spyOn(UniversignClient.prototype, 'post')
    await expect(adapter.listAuditTrailEntries(CREDS, 'tx_9', {})).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('getAuditTrailEntry throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get } = mockApi()
    await expect(adapter.getAuditTrailEntry(CREDS, 'tx_9:0')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('UniversignAdapter.listTemplates pages GET /v1/templates', () => {
  it('walks N = 2L+1 templates: every id once, exact hasMore', async () => {
    mockApi({ templates: N })
    const { seen, more } = await walk((p) => adapter.listTemplates(CREDS, p))
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => tplId(i)))
    expect(more).toEqual([true, true, false])
  })

  it('sends the caller size and pages on starting_after', async () => {
    const { calls } = mockApi({ templates: N })
    await walk((p) => adapter.listTemplates(CREDS, p))
    expect(calls.map((c) => c.params)).toEqual([
      { size: L },
      { size: L, starting_after: tplId(1) },
      { size: L, starting_after: tplId(3) },
    ])
  })

  it('sends the documented template default size of 50 when the caller gives no limit', async () => {
    const { calls } = mockApi({ templates: 1 })
    await adapter.listTemplates(CREDS, withPageSink({ page: 1 }))
    expect(calls[0]!.params).toEqual({ size: 50 })
  })

  it('returns schema-valid templates, readable back through getTemplate', async () => {
    const { calls } = mockApi({ templates: 1 })
    const [t] = await adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: 5 }))
    TemplateSchema.parse(t)
    const back = await adapter.getTemplate(CREDS, t!.id)
    expect(back.id).toBe(tplId(0))
    expect(calls[calls.length - 1]!.path).toBe('/v1/templates/tpl_0')
  })
})
