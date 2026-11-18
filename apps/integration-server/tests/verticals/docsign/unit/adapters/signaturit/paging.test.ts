/**
 * Signaturit list paging and request shape.
 *
 * Every fake below answers at the axios layer and honours ONLY the documented
 * request (https://docs.signaturit.com/api/latest); an undocumented path or
 * query parameter throws.
 *
 *   - GET /v3/signatures.json: "limit — Max number of signatures to retrieve.
 *     The signature limit is 100." / "offset — Results offset. Default value
 *     is 0. Note that the result window size (limit + offset) cannot exceed
 *     10.000", plus the `status` filter. A bare array.
 *   - GET /v3/signatures/{id}.json: "Get a given signature request." Its
 *     `documents` items ("created for every signer and uploaded file") carry
 *     the signer, the file and the `events`.
 *   - GET /v3/templates.json: `limit` ("The template limit is 100") and
 *     `offset`. A bare array.
 *   - Auth: "Authorization: Bearer <access token>"; production base URL
 *     "https://api.signaturit.com/v3".
 */
import axios, { type AxiosRequestConfig } from 'axios'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { SignaturitAdapter } from '../../../../../../src/verticals/docsign/adapters/signaturit'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { AuditTrailEntrySchema } from '../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { TemplateSchema } from '../../../../../../src/verticals/docsign/schema/template'
import { SIGNATURE_OBJECT_EXAMPLE, TEMPLATE_EXAMPLE } from './transform/fixtures'

const CREDS: Credentials = { accessToken: 'tok-1' }
const L = 2
const N = 2 * L + 1
const CALL_BUDGET = 50
const ENV = 'sig-1'

const adapter = new SignaturitAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

interface Sent {
  method: string
  url: string
  params: Record<string, unknown> | undefined
  headers: Record<string, unknown>
  baseURL: string | undefined
}

type Handler = (url: string, params: Record<string, unknown> | undefined) => unknown

function fakeAxios(handler: Handler) {
  const sent: Sent[] = []
  let calls = 0
  vi.spyOn(axios.Axios.prototype, 'request').mockImplementation(async function (
    this: { defaults: AxiosRequestConfig },
    config,
  ) {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    const cfg = config as AxiosRequestConfig
    const url = String(cfg.url)
    const params = cfg.params as Record<string, unknown> | undefined
    sent.push({
      method: String(cfg.method ?? 'get').toLowerCase(),
      url,
      params,
      headers: { ...(this.defaults.headers as unknown as Record<string, unknown>) },
      baseURL: this.defaults.baseURL,
    })
    return { data: handler(url, params), status: 200, headers: {}, config: cfg } as never
  })
  return { sent }
}

function only(params: Record<string, unknown> | undefined, allowed: string[]): void {
  for (const k of Object.keys(params ?? {})) {
    if (!allowed.includes(k)) throw new Error(`undocumented parameter ${k}`)
  }
}

/** limit (1..100) + offset, the documented window, a bare array. */
function offsetPage<T>(all: T[], params: Record<string, unknown> | undefined, max = 100): T[] {
  const limit = params?.['limit'] === undefined ? 100 : Number(params['limit'])
  const offset = params?.['offset'] === undefined ? 0 : Number(params['offset'])
  if (!Number.isInteger(limit) || limit < 1 || limit > max) throw new Error(`bad limit ${limit}`)
  if (!Number.isInteger(offset) || offset < 0) throw new Error(`bad offset ${offset}`)
  return all.slice(offset, offset + limit)
}

const sigIds = (n: number) => Array.from({ length: n }, (_, i) => `sig-${i + 1}`)
const itemIds = (n: number) => Array.from({ length: n }, (_, i) => `item-${i + 1}`)

function signature(id: string, status = 'ready') {
  return {
    ...SIGNATURE_OBJECT_EXAMPLE,
    id,
    documents: SIGNATURE_OBJECT_EXAMPLE.documents.map((d) => ({ ...d, status })),
  }
}

function fakeSignatures(total: number, statuses?: Record<string, string>) {
  const all = sigIds(total).map((id) => signature(id, statuses?.[id]))
  return fakeAxios((url, params) => {
    if (url !== '/signatures.json') throw new Error(`unexpected path ${url}`)
    only(params, ['limit', 'offset', 'status'])
    const status = params?.['status']
    const matching =
      status === undefined ? all : all.filter((s) => s.documents.some((d) => d.status === status))
    return offsetPage(matching, params)
  })
}

/** GET /signatures/{ENV}.json with `items` document items, two events each. */
function fakeOneSignature(items: number) {
  const documents = itemIds(items).map((id, i) => ({
    ...SIGNATURE_OBJECT_EXAMPLE.documents[0]!,
    id,
    name: `Signer ${i + 1}`,
    email: `signer${i + 1}@example.com`,
  }))
  return fakeAxios((url, params) => {
    if (url !== `/signatures/${ENV}.json`) throw new Error(`unexpected path ${url}`)
    only(params, [])
    return { ...SIGNATURE_OBJECT_EXAMPLE, id: ENV, documents }
  })
}

const tplIds = (n: number) => Array.from({ length: n }, (_, i) => `tpl-${i + 1}`)

function fakeTemplates(total: number) {
  const all = tplIds(total).map((id) => ({ ...TEMPLATE_EXAMPLE, id }))
  return fakeAxios((url, params) => {
    if (url !== '/templates.json') throw new Error(`unexpected path ${url}`)
    only(params, ['limit', 'offset'])
    return offsetPage(all, params)
  })
}

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

describe('SignaturitAdapter auth and base URL', () => {
  it('sends the documented bearer token to the production v3 base URL', async () => {
    const { sent } = fakeSignatures(1)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    expect(sent[0]!.baseURL).toBe('https://api.signaturit.com/v3')
    expect(sent[0]!.headers['Authorization']).toBe('Bearer tok-1')
  })
})

describe('SignaturitAdapter.listEnvelopes', () => {
  it('calls the documented GET /v3/signatures.json with the caller limit and offset', async () => {
    const { sent } = fakeSignatures(N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 3, limit: L }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe('/signatures.json')
    expect(sent[0]!.params).toEqual({ limit: L, offset: 2 * L })
  })

  it('walks N = 2L+1 signatures, serving every id once with an exact hasMore', async () => {
    fakeSignatures(N)
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p), 3)
    expect(seen).toEqual(sigIds(N))
    expect(more).toEqual([true, true, false])
  })

  it('parses each row with the canonical Envelope schema', async () => {
    fakeSignatures(1)
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    expect(() => rows.map((r) => EnvelopeSchema.parse(r))).not.toThrow()
  })

  it('clamps the limit to the documented maximum of 100 and reports that size', async () => {
    const { sent } = fakeSignatures(250)
    const params = withPageSink({ page: 2, limit: 150 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(sent[0]!.params).toEqual({ limit: 100, offset: 100 })
    expect(rows).toHaveLength(100)
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 100, hasMore: true })
  })

  it('passes the documented status filter through', async () => {
    const { sent } = fakeSignatures(3, { 'sig-2': 'completed' })
    const rows = await adapter.listEnvelopes(
      CREDS,
      withPageSink({ page: 1, limit: L, status: 'completed' }),
    )
    expect(sent[0]!.params).toEqual({ limit: L, offset: 0, status: 'completed' })
    expect(rows.map((r) => r.id)).toEqual(['sig-2'])
  })

  it('refuses a page past the documented 10,000-row window before sending anything', async () => {
    const { sent } = fakeSignatures(1)
    await expect(
      adapter.listEnvelopes(CREDS, withPageSink({ page: 101, limit: 100 })),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' })
    await expect(
      adapter.listEnvelopes(CREDS, withPageSink({ page: 335, limit: 30 })),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' })
    expect(sent).toHaveLength(0)
  })

  it('serves the last full page of the window with hasMore false', async () => {
    const { sent } = fakeSignatures(10_050)
    const params = withPageSink({ page: 100, limit: 100 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(sent[0]!.params).toEqual({ limit: 100, offset: 9900 })
    expect(rows).toHaveLength(100)
    // No later page can be requested, so none is promised.
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('asks only for the rows left in the window, so rows up to 10,000 stay reachable', async () => {
    const { sent } = fakeSignatures(10_050)
    const params = withPageSink({ page: 334, limit: 30 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    // offset 9990 + limit 10 = 10,000: the documented window, exactly.
    expect(sent[0]!.params).toEqual({ limit: 10, offset: 9990 })
    expect(rows.map((r) => r.id)).toEqual(sigIds(10_000).slice(9990))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('rejects a response that is not the documented bare array', async () => {
    fakeAxios(() => ({ data: [] }))
    await expect(adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /array/,
    )
  })

  it('escapes the signature id in the documented path', async () => {
    const { sent } = fakeAxios(() => ({ ...SIGNATURE_OBJECT_EXAMPLE, id: 'a/b' }))
    await adapter.getEnvelope(CREDS, 'a/b')
    expect(sent[0]!.url).toBe('/signatures/a%2Fb.json')
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    fakeSignatures(N)
    const params = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'signaturit')
    expect(env.data.map((r) => r.id)).toEqual(['sig-3', 'sig-4'])
    expect(env.meta?.hasMore).toBe(true)
  })

  it('getEnvelope reads the documented GET /v3/signatures/{id}.json', async () => {
    const { sent } = fakeOneSignature(1)
    const out = await adapter.getEnvelope(CREDS, ENV)
    expect(sent[0]!.url).toBe(`/signatures/${ENV}.json`)
    expect(EnvelopeSchema.parse(out).id).toBe(ENV)
  })
})

describe('SignaturitAdapter.listSigners / listDocuments', () => {
  it('reads GET /v3/signatures/{id}.json and walks N = 2L+1 signers locally', async () => {
    const { sent } = fakeOneSignature(N)
    const { seen, more } = await walk((p) => adapter.listSigners(CREDS, ENV, p), 3)
    expect(seen).toEqual(itemIds(N).map((i) => `${ENV}:${i}`))
    expect(more).toEqual([true, true, false])
    expect(sent.every((s) => s.url === `/signatures/${ENV}.json`)).toBe(true)
  })

  it('walks N = 2L+1 documents locally', async () => {
    fakeOneSignature(N)
    const { seen, more } = await walk((p) => adapter.listDocuments(CREDS, ENV, p), 3)
    expect(seen).toEqual(itemIds(N).map((i) => `${ENV}:${i}`))
    expect(more).toEqual([true, true, false])
  })

  it('reads back a listed signer and document by the id the list returned', async () => {
    fakeOneSignature(N)
    const [signer] = await adapter.listSigners(CREDS, ENV, withPageSink({ page: 2, limit: L }))
    const [doc] = await adapter.listDocuments(CREDS, ENV, withPageSink({ page: 3, limit: L }))
    expect(SignerSchema.parse(await adapter.getSigner(CREDS, signer!.id))).toEqual(
      SignerSchema.parse(signer),
    )
    expect(DocumentSchema.parse(await adapter.getDocument(CREDS, doc!.id))).toEqual(
      DocumentSchema.parse(doc),
    )
  })
})

describe('SignaturitAdapter item id read-back', () => {
  it('numbers documents in their documented order', async () => {
    fakeOneSignature(N)
    const docs = await adapter.listDocuments(CREDS, ENV, withPageSink({ page: 2, limit: L }))
    expect(docs.map((d) => d.order)).toEqual([2, 3])
    expect((await adapter.getDocument(CREDS, docs[1]!.id)).order).toBe(3)
  })

  it.each([
    ['getSigner', 'no-colon'],
    ['getSigner', `${ENV}:item-1:extra`],
    ['getSigner', `:item-1`],
    ['getSigner', `${ENV}:`],
    ['getDocument', 'no-colon'],
    ['getDocument', `${ENV}:item-1:extra`],
    ['getAuditTrailEntry', `${ENV}:item-1`],
    ['getAuditTrailEntry', `${ENV}:item-1:0:extra`],
    ['getAuditTrailEntry', `${ENV}::0`],
  ] as const)('%s refuses the malformed id %s with 400 before sending', async (method, id) => {
    const { sent } = fakeOneSignature(1)
    await expect(adapter[method](CREDS, id)).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION',
    })
    expect(sent).toHaveLength(0)
  })

  it.each(['getSigner', 'getDocument', 'getAuditTrailEntry'] as const)(
    '%s answers 404 for an id the signature does not hold',
    async (method) => {
      fakeOneSignature(1)
      const id = method === 'getAuditTrailEntry' ? `${ENV}:item-9:0` : `${ENV}:item-9`
      await expect(adapter[method](CREDS, id)).rejects.toMatchObject({ statusCode: 404 })
    },
  )
})

describe('SignaturitAdapter.listAuditTrailEntries', () => {
  it('flattens the documented documents[].events and walks them locally', async () => {
    // Two document items with two events each: four entries.
    const { sent } = fakeOneSignature(2)
    const expected = itemIds(2).flatMap((i) => [`${ENV}:${i}:0`, `${ENV}:${i}:1`])
    const { seen, more } = await walk((p) => adapter.listAuditTrailEntries(CREDS, ENV, p), 3, 1)
    expect(seen).toEqual(expected.slice(0, 3))
    expect(more).toEqual([true, true, true])
    expect(sent.every((s) => s.url === `/signatures/${ENV}.json`)).toBe(true)
  })

  it('walks N = 2L+1 events, every id once, hasMore exact', async () => {
    // One document item carrying N events.
    fakeAxios((url) => {
      if (url !== `/signatures/${ENV}.json`) throw new Error(`unexpected path ${url}`)
      const events = Array.from({ length: N }, (_, i) => ({
        created_at: `2014-08-21T08:55:1${i}+0000`,
        type: 'email_processed',
      }))
      return {
        ...SIGNATURE_OBJECT_EXAMPLE,
        id: ENV,
        documents: [{ ...SIGNATURE_OBJECT_EXAMPLE.documents[0]!, id: 'item-1', events }],
      }
    })
    const { seen, more } = await walk((p) => adapter.listAuditTrailEntries(CREDS, ENV, p), 3)
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `${ENV}:item-1:${i}`))
    expect(more).toEqual([true, true, false])
  })

  it('reads back a listed entry by the id the list returned', async () => {
    fakeOneSignature(2)
    const [entry] = await adapter.listAuditTrailEntries(
      CREDS,
      ENV,
      withPageSink({ page: 4, limit: 1 }),
    )
    expect(entry!.id).toBe(`${ENV}:item-2:1`)
    const back = await adapter.getAuditTrailEntry(CREDS, entry!.id)
    expect(AuditTrailEntrySchema.parse(back)).toEqual(AuditTrailEntrySchema.parse(entry))
  })

  it('never calls the undocumented /audit_trail JSON path', async () => {
    const { sent } = fakeOneSignature(1)
    await adapter.listAuditTrailEntries(CREDS, ENV, withPageSink({ page: 1, limit: L }))
    expect(sent.map((s) => s.url)).toEqual([`/signatures/${ENV}.json`])
  })
})

describe('SignaturitAdapter.listTemplates', () => {
  it('calls the documented GET /v3/templates.json with the caller limit and offset', async () => {
    const { sent } = fakeTemplates(N)
    await adapter.listTemplates(CREDS, withPageSink({ page: 2, limit: L }))
    expect(sent[0]!.url).toBe('/templates.json')
    expect(sent[0]!.params).toEqual({ limit: L, offset: L })
  })

  it('walks N = 2L+1 templates, every id once, hasMore exact', async () => {
    fakeTemplates(N)
    const { seen, more } = await walk((p) => adapter.listTemplates(CREDS, p), 3)
    expect(seen).toEqual(tplIds(N))
    expect(more).toEqual([true, true, false])
  })

  it('clamps the limit to the documented 100 and parses each row', async () => {
    const { sent } = fakeTemplates(120)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await adapter.listTemplates(CREDS, params)
    expect(sent[0]!.params).toEqual({ limit: 100, offset: 0 })
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 100, hasMore: true })
    expect(() => rows.map((r) => TemplateSchema.parse(r))).not.toThrow()
  })

  it('rejects a response that is not the documented bare array', async () => {
    fakeAxios(() => ({ data: [] }))
    await expect(adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /array/,
    )
  })

  it('getTemplate refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const { sent } = fakeTemplates(1)
    await expect(adapter.getTemplate(CREDS, 'tpl-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(sent).toHaveLength(0)
  })
})
