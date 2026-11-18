/**
 * Annature list paging and request shape.
 *
 * Every fake below answers at the axios layer and honours ONLY the documented
 * request: an undocumented path or query parameter throws.
 *
 *   - "List all envelopes (paged)", GET /v2/envelopes
 *     (https://docs.annature.com.au/api-reference/envelopes/list-all-envelopes-paged.md):
 *     "To fetch the next page of results, pass the `cursor` value from the
 *     previous response. The `has_more` property indicates whether additional
 *     results are available." No page-size parameter is documented, so the
 *     fake sizes its own pages.
 *   - "Retrieve an envelope", GET /v1/envelopes/:id: the `recipients` array.
 *   - "List all documents", GET /v1/documents with the required `envelope_id`,
 *     a bare array.
 *   - "List all templates", GET /v1/templates, a bare array ("limited to a
 *     maximum of 250 results").
 *   - Authentication: `X-Annature-Id` and `X-Annature-Key` headers
 *     (https://docs.annature.com.au/api-reference/authentication.md).
 */
import axios, { type AxiosRequestConfig } from 'axios'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { AnnatureAdapter } from '../../../../../../src/verticals/docsign/adapters/annature'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { TemplateSchema } from '../../../../../../src/verticals/docsign/schema/template'
import { RECIPIENT_EXAMPLE } from './transform/fixtures'

const CREDS: Credentials = { accessToken: 'priv-key-1', extra: { publicKey: 'pub-key-1' } }
const OTHER: Credentials = { accessToken: 'priv-key-2', extra: { publicKey: 'pub-key-2' } }
const L = 2
const N = 2 * L + 1
/** Annature sizes GET /v2/envelopes pages itself; the fake picks 3, which is not L. */
const SERVER_PAGE = 3
const CALL_BUDGET = 50

const adapter = new AnnatureAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())
beforeEach(() => _resetCursorPager())

interface Sent {
  url: string
  params: Record<string, unknown> | undefined
  headers: Record<string, unknown>
  baseURL: string | undefined
}

type Handler = (url: string, params: Record<string, unknown> | undefined) => unknown

/** Replace axios's request with `handler`, recording what each request sent. */
function fakeAxios(handler: Handler) {
  const sent: Sent[] = []
  let calls = 0
  const spy = vi.spyOn(axios.Axios.prototype, 'request').mockImplementation(async function (
    this: { defaults: AxiosRequestConfig },
    config,
  ) {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    const cfg = config as AxiosRequestConfig
    const url = String(cfg.url)
    const params = cfg.params as Record<string, unknown> | undefined
    sent.push({
      url,
      params,
      headers: { ...(this.defaults.headers as unknown as Record<string, unknown>) },
      baseURL: this.defaults.baseURL,
    })
    return { data: handler(url, params), status: 200, headers: {}, config: cfg } as never
  })
  return { sent, spy }
}

function only(params: Record<string, unknown> | undefined, allowed: string[]): void {
  for (const k of Object.keys(params ?? {})) {
    if (!allowed.includes(k)) throw new Error(`undocumented parameter ${k}`)
  }
}

const envIds = (n: number) => Array.from({ length: n }, (_, i) => `env-${i + 1}`)

const draftIds = (n: number) => Array.from({ length: n }, (_, i) => `draft-${i + 1}`)

/**
 * GET /v2/envelopes, honouring only `cursor` and `status`, answering
 * `{ envelopes, cursor, has_more }`. Without `status` it serves every
 * non-draft envelope ("envelopes with a status of `draft` are excluded
 * unless the `status` parameter is explicitly provided"); `status` is an
 * exact-match filter.
 */
function fakeEnvelopes(total: number, pageSize = SERVER_PAGE, drafts = 0) {
  const all = [
    ...envIds(total).map((id) => ({ id, name: id, status: 'sent', recipients: [] })),
    ...draftIds(drafts).map((id) => ({ id, name: id, status: 'draft', recipients: [] })),
  ]
  return fakeAxios((url, params) => {
    if (url !== '/v2/envelopes') throw new Error(`unexpected path ${url}`)
    only(params, ['cursor', 'status'])
    const status = params?.['status'] as string | undefined
    const matching = all.filter((e) =>
      status === undefined ? e.status !== 'draft' : e.status === status,
    )
    const cursor = params?.['cursor']
    let start = 0
    if (cursor !== undefined) {
      const [forStatus, at] = Buffer.from(String(cursor), 'base64').toString().split(':')
      if (forStatus !== String(status)) throw new Error('cursor replayed under another filter')
      start = Number(at)
    }
    const rows = matching.slice(start, start + pageSize)
    const end = start + rows.length
    const more = end < matching.length
    return {
      envelopes: rows,
      cursor: more ? Buffer.from(`${String(status)}:${end}`).toString('base64') : null,
      has_more: more,
    }
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

describe('AnnatureAdapter auth and base URL', () => {
  it('sends the documented X-Annature-Id / X-Annature-Key pair, not a bearer token', async () => {
    const { sent } = fakeEnvelopes(1)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    expect(sent[0]!.baseURL).toBe('https://api.annature.com.au')
    expect(sent[0]!.headers['X-Annature-Id']).toBe('pub-key-1')
    expect(sent[0]!.headers['X-Annature-Key']).toBe('priv-key-1')
    expect(sent[0]!.headers['Authorization']).toBeUndefined()
  })

  it('exchangeCredentials stores the private key as the secret and the public key in extra', async () => {
    await expect(
      adapter.exchangeCredentials({ publicKey: 'pub', privateKey: 'priv' }),
    ).resolves.toEqual({ accessToken: 'priv', extra: { publicKey: 'pub' } })
    await expect(adapter.exchangeCredentials({ privateKey: 'priv' })).rejects.toThrow(/publicKey/)
  })

  it('a connection without a public key fails before sending anything', async () => {
    const { spy } = fakeEnvelopes(1)
    await expect(
      adapter.listEnvelopes({ accessToken: 'priv' }, withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/public key/)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('AnnatureAdapter.listEnvelopes pages GET /v2/envelopes by cursor', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    fakeEnvelopes(N)
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p), 3)
    expect(seen).toEqual(envIds(N))
    expect(more).toEqual([true, true, false])
  })

  it('page 1 sends no parameters; the next upstream page sends only the previous cursor', async () => {
    const { sent } = fakeEnvelopes(N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(sent.map((s) => s.url)).toEqual(['/v2/envelopes', '/v2/envelopes'])
    expect(sent[0]!.params).toBeUndefined()
    expect(sent[1]!.params).toEqual({
      cursor: Buffer.from(`undefined:${SERVER_PAGE}`).toString('base64'),
    })
  })

  it('page 2 with a cold cache walks from page 1 and returns rows L+1..2L', async () => {
    fakeEnvelopes(N)
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(envIds(N).slice(L, 2 * L))
  })

  it('a caller page larger than the upstream page is filled across upstream pages', async () => {
    fakeEnvelopes(10)
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p), 3, 4)
    expect(seen).toEqual(envIds(10))
    expect(more).toEqual([true, true, false])
  })

  it('an exactly full last page reports its end from has_more: false', async () => {
    fakeEnvelopes(2 * L, L)
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p), 2)
    expect(seen).toEqual(envIds(2 * L))
    expect(more).toEqual([true, false])
  })

  it('another connection walks from its own page 1', async () => {
    const { sent } = fakeEnvelopes(N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    const before = sent.length
    const rows = await adapter.listEnvelopes(OTHER, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(envIds(N).slice(L, 2 * L))
    expect(sent[before]!.params).toBeUndefined()
    expect(sent[before]!.headers['X-Annature-Id']).toBe('pub-key-2')
  })

  it('another connection on the same public key walks from its own page 1', async () => {
    const SAME_ACCOUNT: Credentials = {
      accessToken: 'priv-key-3',
      extra: { publicKey: 'pub-key-1' },
    }
    const { sent } = fakeEnvelopes(N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    const before = sent.length
    const rows = await adapter.listEnvelopes(SAME_ACCOUNT, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(envIds(N).slice(L, 2 * L))
    expect(sent[before]!.params).toBeUndefined()
    expect(sent[before]!.headers['X-Annature-Key']).toBe('priv-key-3')
  })

  it('drafts, excluded by default, follow the non-draft walk via status=draft', async () => {
    const { sent } = fakeEnvelopes(N, SERVER_PAGE, N)
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p), 5)
    expect(seen).toEqual([...envIds(N), ...draftIds(N)])
    expect(more).toEqual([true, true, true, true, false])
    expect(new Set(seen).size).toBe(2 * N)
    const draftRequests = sent.filter((s) => s.params?.['status'] === 'draft')
    expect(draftRequests[0]!.params).toEqual({ status: 'draft' })
    expect(draftRequests.slice(1).every((s) => typeof s.params?.['cursor'] === 'string')).toBe(true)
  })

  it('a draft listed through the adapter maps to canonical draft', async () => {
    fakeEnvelopes(0, SERVER_PAGE, 1)
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    expect(rows.map((r) => EnvelopeSchema.parse(r).status)).toEqual(['draft'])
  })

  it('a page whose envelopes field is not an array is an error', async () => {
    fakeAxios(() => [{ id: 'env-1' }])
    await expect(adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /did not return an array/,
    )
  })

  it('has_more without a cursor is an error, not a silent end', async () => {
    fakeAxios(() => ({ envelopes: [], cursor: null, has_more: true }))
    await expect(adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /has_more without a cursor/,
    )
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    fakeEnvelopes(N)
    const params = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'annature')
    expect(env.data.map((r) => r.id)).toEqual(envIds(N).slice(L, 2 * L))
    expect(env.meta.hasMore).toBe(true)
  })

  it('getEnvelope reads GET /v1/envelopes/:id', async () => {
    const { sent } = fakeAxios((url, params) => {
      only(params, [])
      if (url !== '/v1/envelopes/env-9') throw new Error(`unexpected path ${url}`)
      return { id: 'env-9', name: 'x', status: 'completed', recipients: [] }
    })
    const env = EnvelopeSchema.parse(await adapter.getEnvelope(CREDS, 'env-9'))
    expect(env.id).toBe('env-9')
    expect(sent).toHaveLength(1)
  })
})

describe('AnnatureAdapter.listSigners pages the envelope recipients locally', () => {
  const recipients = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ ...RECIPIENT_EXAMPLE, id: `rcp-${i + 1}` }))

  function fakeEnvelope(n: number) {
    return fakeAxios((url, params) => {
      if (url !== '/v1/envelopes/env-1') throw new Error(`unexpected path ${url}`)
      only(params, [])
      return { id: 'env-1', name: 'x', status: 'sent', recipients: recipients(n) }
    })
  }

  it('pages 1..3 return every recipient once with an exact hasMore', async () => {
    const { sent } = fakeEnvelope(N)
    const { seen, more } = await walk((p) => adapter.listSigners(CREDS, 'env-1', p), 3)
    expect(seen).toEqual(recipients(N).map((r) => r.id))
    expect(more).toEqual([true, true, false])
    expect(sent.every((s) => s.url === '/v1/envelopes/env-1' && s.params === undefined)).toBe(true)
  })

  it('every signer parses and carries the envelope id it was listed under', async () => {
    fakeEnvelope(1)
    const [s] = await adapter.listSigners(CREDS, 'env-1', withPageSink({ page: 1, limit: L }))
    expect(SignerSchema.parse(s).envelopeId).toBe('env-1')
  })
})

describe('AnnatureAdapter.listDocuments pages GET /v1/documents locally', () => {
  const docs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `doc-${i + 1}`, name: `d${i + 1}.pdf`, pages: 1 }))

  function fakeDocuments(n: number) {
    return fakeAxios((url, params) => {
      if (url !== '/v1/documents') throw new Error(`unexpected path ${url}`)
      only(params, ['envelope_id', 'endpoint_duration'])
      if (params?.['envelope_id'] !== 'env-1') throw new Error('envelope_id is required')
      return docs(n)
    })
  }

  it('pages 1..3 return every document once with an exact hasMore', async () => {
    fakeDocuments(N)
    const { seen, more } = await walk((p) => adapter.listDocuments(CREDS, 'env-1', p), 3)
    expect(seen).toEqual(docs(N).map((d) => d.id))
    expect(more).toEqual([true, true, false])
  })

  it('sends exactly the required envelope_id', async () => {
    const { sent } = fakeDocuments(1)
    await adapter.listDocuments(CREDS, 'env-1', withPageSink({ page: 1, limit: L }))
    expect(sent[0]!.params).toEqual({ envelope_id: 'env-1' })
  })

  it('a response that is not a bare array is an error', async () => {
    fakeAxios(() => ({ documents: docs(1) }))
    await expect(
      adapter.listDocuments(CREDS, 'env-1', withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/did not return an array/)
  })

  it('order is the position in the whole envelope, not in the caller page', async () => {
    fakeDocuments(N)
    const rows = await adapter.listDocuments(CREDS, 'env-1', withPageSink({ page: 2, limit: L }))
    expect(rows.map((d) => DocumentSchema.parse(d).order)).toEqual([L, L + 1])
  })
})

describe('AnnatureAdapter.listTemplates pages GET /v1/templates locally', () => {
  const templates = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `tpl-${i + 1}`,
      name: `t${i + 1}`,
      documents: [{ id: 'd', name: 'd.pdf' }],
      roles: [{ id: 'r', name: 'Client' }],
    }))

  function fakeTemplates(n: number) {
    return fakeAxios((url, params) => {
      if (url !== '/v1/templates') throw new Error(`unexpected path ${url}`)
      only(params, ['name', 'created_before', 'created_after'])
      // A bare array, per the documented example.
      return templates(n)
    })
  }

  it('pages 1..3 return every template once with an exact hasMore', async () => {
    const { sent } = fakeTemplates(N)
    const { seen, more } = await walk((p) => adapter.listTemplates(CREDS, p), 3)
    expect(seen).toEqual(templates(N).map((t) => t.id))
    expect(more).toEqual([true, true, false])
    expect(sent.every((s) => s.params === undefined)).toBe(true)
  })

  it('a response that is not a bare array is an error', async () => {
    fakeAxios(() => ({ templates: templates(1) }))
    await expect(adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /did not return an array/,
    )
  })

  it('an upstream error propagates instead of reading as zero templates', async () => {
    vi.spyOn(axios.Axios.prototype, 'request').mockRejectedValue(
      Object.assign(new Error('Not Found'), { response: { status: 404 } }),
    )
    await expect(adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      'Not Found',
    )
  })

  it('getTemplate reads GET /v1/templates/:id', async () => {
    const { sent } = fakeAxios((url) => {
      if (url !== '/v1/templates/tpl-1') throw new Error(`unexpected path ${url}`)
      return templates(1)[0]
    })
    expect(TemplateSchema.parse(await adapter.getTemplate(CREDS, 'tpl-1')).id).toBe('tpl-1')
    expect(sent).toHaveLength(1)
  })
})

describe('AnnatureAdapter.listTemplates follows a capped response with created_before', () => {
  /** "The response is limited to a maximum of 250 results." */
  const CAP = 250

  /**
   * `count` templates, newest first; every template in a run of `tie` shares
   * one `created` second, so ties straddle the 250 boundary.
   */
  function corpus(count: number, tie = 1) {
    const base = Date.parse('2024-01-01T00:00:00Z')
    return Array.from({ length: count }, (_, i) => ({
      id: `tpl-${i + 1}`,
      name: `t${i + 1}`,
      created: new Date(base - Math.floor(i / tie) * 1000).toISOString().replace('.000Z', 'Z'),
      documents: [{ id: 'd', name: 'd.pdf' }],
      roles: [{ id: 'r', name: 'Client' }],
    }))
  }

  /**
   * GET /v1/templates: descending by creation, at most 250, honouring only
   * the documented filters. `created_before` is strict ("created **before**").
   */
  function fakeCapped(all: ReturnType<typeof corpus>) {
    return fakeAxios((url, params) => {
      if (url !== '/v1/templates') throw new Error(`unexpected path ${url}`)
      only(params, ['name', 'created_before', 'created_after'])
      const before = params?.['created_before']
      const cutoff = before === undefined ? Infinity : Date.parse(String(before))
      return all.filter((t) => Date.parse(t.created) < cutoff).slice(0, CAP)
    })
  }

  it('returns every template once past the cap, with ties at the boundary, and a true total', async () => {
    const all = corpus(600, 7)
    const { sent } = fakeCapped(all)
    const params = withPageSink({ page: 1, limit: 1000 })
    const rows = await adapter.listTemplates(CREDS, params)
    expect(rows.map((t) => t.id)).toEqual(all.map((t) => t.id))
    expect(readUpstreamPage(params)?.totalCount).toBe(600)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(sent[0]!.params).toBeUndefined()
    expect(
      sent.slice(1).every((s) => Object.keys(s.params ?? {}).join() === 'created_before'),
    ).toBe(true)
  })

  it('a caller page walk across the cap reports hasMore exactly', async () => {
    const all = corpus(CAP + 1)
    fakeCapped(all)
    const { seen, more } = await walk((p) => adapter.listTemplates(CREDS, p), 2, CAP)
    expect(seen).toEqual(all.map((t) => t.id))
    expect(more).toEqual([true, false])
  })

  it('exactly 250 templates end after one confirming request', async () => {
    const { sent } = fakeCapped(corpus(CAP))
    const rows = await adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: 1000 }))
    expect(rows).toHaveLength(CAP)
    expect(sent).toHaveLength(2)
  })

  it('a full response that adds nothing new throws instead of reporting a truncated set', async () => {
    // 300 templates in one second: created_before cannot separate them.
    fakeCapped(corpus(300, 300))
    await expect(adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /already seen/,
    )
  })
})

describe('AnnatureAdapter refuses what the API does not document, before any request', () => {
  it.each([
    ['listAuditTrailEntries', () => adapter.listAuditTrailEntries(CREDS, 'env-1', { page: 1 })],
    ['getAuditTrailEntry', () => adapter.getAuditTrailEntry(CREDS, 'env-1:0')],
    ['getSigner', () => adapter.getSigner(CREDS, 'rcp-1')],
    ['getDocument', () => adapter.getDocument(CREDS, 'doc-1')],
  ])('%s throws 501 NOT_SUPPORTED and sends nothing', async (_name, call) => {
    const { spy } = fakeAxios(() => {
      throw new Error('no request expected')
    })
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(spy).not.toHaveBeenCalled()
  })
})
