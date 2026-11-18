import { describe, it, expect, vi, afterEach } from 'vitest'
import axios, { type AxiosRequestConfig, type AxiosResponse, type CreateAxiosDefaults } from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { ComsigntrustAdapter } from '../../../../../../src/verticals/docsign/adapters/comsigntrust'
import {
  collection,
  documentCount,
  COLLECTION_ID,
  DOC_ID_1,
  DOC_ID_2,
  SIGNER_ID_2,
} from './fixtures/wesign'

/**
 * A fake WeSign host that answers ONLY the operations and parameters the v3
 * OpenAPI documents (https://wse.comsigntrust.com/api/swagger/v3/swagger.json):
 *   GET /api/v3/DocumentCollections?offset&limit     → { documentCollections }
 *       (+ x-total-count, which WeSign's own client reads)
 *   GET /api/v3/DocumentCollections/info/{id}        → DocumentCollectionResposneDTO
 *   GET /api/v3/DocumentCollections/{id}/documents/{documentId}/pages → DocumentCountResponseDTO
 * Anything else is a 404, as the old /signature-requests paths were.
 */

const CREDS = { accessToken: 'jwt-token' } as Credentials
const adapter = new ComsigntrustAdapter()
const LIST_PARAMS = new Set([
  'key',
  'sent',
  'viewed',
  'signed',
  'declined',
  'sendingFailed',
  'canceled',
  'userId',
  'from',
  'to',
  'offset',
  'limit',
  'searchParameter',
  'sortBy',
  'sortOrder',
])

interface Seen {
  url: string
  params: Record<string, unknown>
  auth: unknown
}

function fakeHost(total: number) {
  const seen: Seen[] = []
  const realCreate = axios.create.bind(axios)
  vi.spyOn(axios, 'create').mockImplementation((cfg?: CreateAxiosDefaults) =>
    realCreate({
      ...cfg,
      adapter: async (config: AxiosRequestConfig): Promise<AxiosResponse> => {
        const url = `${config.baseURL}${config.url}`
        const params = (config.params ?? {}) as Record<string, unknown>
        const headers = config.headers as Record<string, unknown>
        seen.push({ url, params, auth: headers['Authorization'] })
        const ok = (data: unknown, extra: Record<string, string> = {}): AxiosResponse => ({
          data,
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json', ...extra },
          config: config as never,
        })
        const base = 'https://wse.comsigntrust.com/api/v3'
        if (url === `${base}/DocumentCollections`) {
          for (const k of Object.keys(params)) {
            if (!LIST_PARAMS.has(k)) throw new Error(`undocumented list parameter ${k}`)
          }
          const offset = Number(params['offset'] ?? 0)
          const limit = Number(params['limit'] ?? 20)
          const end = Math.min(offset + limit, total)
          const rows = Array.from({ length: Math.max(0, end - offset) }, (_, i) =>
            collection({ documentCollectionId: `col-${offset + i}` }),
          )
          return ok({ documentCollections: rows }, { 'x-total-count': String(total) })
        }
        if (url === `${base}/DocumentCollections/info/${COLLECTION_ID}`) return ok(collection())
        const m = new RegExp(
          `^${base}/DocumentCollections/${COLLECTION_ID}/documents/([^/]+)/pages$`,
        ).exec(url)
        if (m) return ok(documentCount({ documentId: m[1], documentName: `${m[1]}.pdf` }))
        throw Object.assign(new Error(`404 ${url}`), { response: { status: 404 } })
      },
    }),
  )
  return seen
}

afterEach(() => vi.restoreAllMocks())

describe('ComsigntrustAdapter request shape', () => {
  it('listEnvelopes calls GET /api/v3/DocumentCollections with a Bearer JWT, offset and limit', async () => {
    const seen = fakeHost(3)
    const rows = await adapter.listEnvelopes(CREDS, { page: 1, limit: 10 } as QueryParams)
    expect(rows.map((r) => r.id)).toEqual(['col-0', 'col-1', 'col-2'])
    expect(seen).toEqual([
      {
        url: 'https://wse.comsigntrust.com/api/v3/DocumentCollections',
        params: { offset: 0, limit: 10 },
        auth: 'Bearer jwt-token',
      },
    ])
  })

  it('listEnvelopes sends the default limit of 20 when the caller names none', async () => {
    const seen = fakeHost(0)
    await adapter.listEnvelopes(CREDS, {} as QueryParams)
    expect(seen[0]?.params).toEqual({ offset: 0, limit: 20 })
  })

  it('getEnvelope reads GET /DocumentCollections/info/{id}', async () => {
    const seen = fakeHost(0)
    const env = await adapter.getEnvelope(CREDS, COLLECTION_ID)
    expect(env.id).toBe(COLLECTION_ID)
    expect(seen.map((s) => s.url)).toEqual([
      `https://wse.comsigntrust.com/api/v3/DocumentCollections/info/${COLLECTION_ID}`,
    ])
  })

  it('listSigners reads the collection info signers[], and getSigner reads back each id', async () => {
    const seen = fakeHost(0)
    const signers = await adapter.listSigners(CREDS, COLLECTION_ID, { limit: 10 } as QueryParams)
    expect(signers).toHaveLength(2)
    for (const s of signers) {
      expect((await adapter.getSigner(CREDS, s.id)).externalId).toBe(s.externalId)
    }
    expect(new Set(seen.map((s) => s.url))).toEqual(
      new Set([`https://wse.comsigntrust.com/api/v3/DocumentCollections/info/${COLLECTION_ID}`]),
    )
  })

  it('listDocuments resolves documentsIds through the pages-count endpoint, and getDocument reads each back', async () => {
    const seen = fakeHost(0)
    const docs = await adapter.listDocuments(CREDS, COLLECTION_ID, { limit: 10 } as QueryParams)
    expect(docs.map((d) => [d.externalId, d.name, d.order])).toEqual([
      [DOC_ID_1, `${DOC_ID_1}.pdf`, 0],
      [DOC_ID_2, `${DOC_ID_2}.pdf`, 1],
    ])
    expect(seen.map((s) => s.url)).toEqual([
      `https://wse.comsigntrust.com/api/v3/DocumentCollections/info/${COLLECTION_ID}`,
      `https://wse.comsigntrust.com/api/v3/DocumentCollections/${COLLECTION_ID}/documents/${DOC_ID_1}/pages`,
      `https://wse.comsigntrust.com/api/v3/DocumentCollections/${COLLECTION_ID}/documents/${DOC_ID_2}/pages`,
    ])
    const back = await adapter.getDocument(CREDS, docs[1]!.id)
    expect(back).toEqual(docs[1])
  })

  it('listDocuments fetches page counts only for the caller page', async () => {
    const seen = fakeHost(0)
    const params = withPageSink({ page: 2, limit: 1 })
    const docs = await adapter.listDocuments(CREDS, COLLECTION_ID, params)
    expect(docs.map((d) => d.externalId)).toEqual([DOC_ID_2])
    expect(seen.map((s) => s.url).filter((u) => u.endsWith('/pages'))).toHaveLength(1)
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 2, hasMore: false })
  })

  it('getDocument on an id missing from documentsIds throws without a pages lookup', async () => {
    const seen = fakeHost(0)
    await expect(adapter.getDocument(CREDS, `${COLLECTION_ID}:not-in-collection`)).rejects.toThrow(
      /not found/,
    )
    expect(seen.map((s) => s.url)).toEqual([
      `https://wse.comsigntrust.com/api/v3/DocumentCollections/info/${COLLECTION_ID}`,
    ])
  })

  it('getSigner on an id missing from signers[] throws not found', async () => {
    fakeHost(0)
    await expect(adapter.getSigner(CREDS, `${COLLECTION_ID}:not-a-signer`)).rejects.toThrow(
      /Signer not-a-signer not found/,
    )
  })

  it('listDocuments keeps at most 4 pages-count lookups in flight and preserves order', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `doc-${String(i).padStart(2, '0')}`)
    let inFlight = 0
    let peak = 0
    const realCreate = axios.create.bind(axios)
    vi.spyOn(axios, 'create').mockImplementation((cfg?: CreateAxiosDefaults) =>
      realCreate({
        ...cfg,
        adapter: async (config: AxiosRequestConfig): Promise<AxiosResponse> => {
          const ok = (data: unknown): AxiosResponse => ({
            data,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: config as never,
          })
          if (config.url === `/DocumentCollections/info/${COLLECTION_ID}`) {
            return ok(collection({ documentsIds: ids }))
          }
          const m = /\/documents\/([^/]+)\/pages$/.exec(config.url ?? '')
          if (!m) throw new Error(`404 ${config.url}`)
          inFlight++
          peak = Math.max(peak, inFlight)
          await new Promise((r) => setTimeout(r, 5))
          inFlight--
          return ok(documentCount({ documentId: m[1], documentName: `${m[1]}.pdf` }))
        },
      }),
    )
    const docs = await adapter.listDocuments(CREDS, COLLECTION_ID, { limit: 12 } as QueryParams)
    expect(docs.map((d) => [d.externalId, d.order])).toEqual(ids.map((id, i) => [id, i]))
    expect(peak).toBe(4)
  })

  it('getSigner rejects an id that is not <collectionId>:<signerId>', async () => {
    const seen = fakeHost(0)
    await expect(adapter.getSigner(CREDS, SIGNER_ID_2)).rejects.toThrow(/shape/)
    expect(seen).toHaveLength(0)
  })
})

describe('ComsigntrustAdapter audit trail — refused', () => {
  it('listAuditTrailEntries throws 501 NOT_SUPPORTED and sends no request', async () => {
    const seen = fakeHost(0)
    await expect(
      adapter.listAuditTrailEntries(CREDS, COLLECTION_ID, { limit: 10 } as QueryParams),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(seen).toHaveLength(0)
  })

  it('getAuditTrailEntry throws 501 NOT_SUPPORTED and sends no request', async () => {
    const seen = fakeHost(0)
    await expect(adapter.getAuditTrailEntry(CREDS, `${COLLECTION_ID}:0`)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(seen).toHaveLength(0)
  })
})
