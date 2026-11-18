/**
 * Foxit eSign per-envelope lists: request shape and paging.
 *
 * Every fake answers at the axios layer and honours ONLY the documented
 * request: an undocumented path or query parameter throws.
 *
 *   - "Get Envelope Details", GET /folders/myfolder with the required
 *     `folderId` query parameter (Foxit eSign OpenAPI, served by
 *     https://developers.foxitesign.foxit.com/; also
 *     https://docs.developer-api.foxit.com/ "Get Envelope Details"). The
 *     response carries `folder.folderRecipientParties`, `folder.documentsList`
 *     and `Folder History`, each whole: the endpoint takes no paging
 *     parameters, so the caller's page is cut locally.
 *   - Base URI: "US Server ... https://na1.foxitesign.foxit.com/api".
 *   - Auth: "The bearer token is sent in the API request like this:
 *     curl {BASEURI} -H 'Authorization: Bearer {OAUTH_TOKEN}'".
 */
import axios, { type AxiosRequestConfig } from 'axios'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { FoxitESignAdapter } from '../../../../../../src/verticals/docsign/adapters/foxit-esign'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { AuditTrailEntrySchema } from '../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { MYFOLDER_EXAMPLE, MYFOLDER_FOLDER, MYFOLDER_HISTORY } from './transform/fixtures'

const CREDS: Credentials = { accessToken: 'oauth-token-1' }
const L = 2
const N = 2 * L + 1
const CALL_BUDGET = 50

const adapter = new FoxitESignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

interface Sent {
  url: string
  params: Record<string, unknown> | undefined
  headers: Record<string, unknown>
  baseURL: string | undefined
}

function fakeAxios(handler: (url: string, params: Record<string, unknown> | undefined) => unknown) {
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

/** GET /folders/myfolder, honouring only `folderId`. */
function fakeMyFolder(folderId: string, body: unknown) {
  return fakeAxios((url, params) => {
    if (url !== '/folders/myfolder') throw new Error(`unexpected path ${url}`)
    for (const k of Object.keys(params ?? {})) {
      if (k !== 'folderId') throw new Error(`undocumented parameter ${k}`)
    }
    if (String(params?.['folderId']) !== folderId) throw new Error('wrong folderId')
    return body
  })
}

const party = MYFOLDER_FOLDER.folderRecipientParties[0]!
const doc = MYFOLDER_FOLDER.documentsList[0]!
const row = MYFOLDER_HISTORY[0]!

/** A documented-shape folder with N parties, N documents and N history rows. */
function folderOfN(n: number) {
  return {
    result: 'success',
    folder: {
      ...MYFOLDER_FOLDER,
      folderRecipientParties: Array.from({ length: n }, (_, i) => ({
        ...party,
        partyId: i + 1,
        partyDetails: { ...party.partyDetails, partyId: i + 1 },
      })),
      documentsList: Array.from({ length: n }, (_, i) => ({ ...doc, documentId: i + 1 })),
    },
    'Folder History': Array.from({ length: n }, (_, i) => ({
      ...row,
      dateChanged: row.dateChanged + i * 1000,
    })),
  }
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

const ids = (n: number) => Array.from({ length: n }, (_, i) => `86377:${i + 1}`)
const auditIds = (n: number) => Array.from({ length: n }, (_, i) => `86377:${i}`)

describe('FoxitESignAdapter per-envelope lists: request shape', () => {
  it.each([
    ['listSigners', (p: QueryParams) => adapter.listSigners(CREDS, '86377', p)],
    ['listDocuments', (p: QueryParams) => adapter.listDocuments(CREDS, '86377', p)],
    ['listAuditTrailEntries', (p: QueryParams) => adapter.listAuditTrailEntries(CREDS, '86377', p)],
  ])('%s sends GET na1 /folders/myfolder?folderId= with the bearer token', async (_n, list) => {
    const { sent } = fakeMyFolder('86377', MYFOLDER_EXAMPLE)
    await list(withPageSink({ page: 1, limit: L }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.baseURL).toBe('https://na1.foxitesign.foxit.com/api')
    expect(sent[0]!.url).toBe('/folders/myfolder')
    expect(sent[0]!.params).toEqual({ folderId: '86377' })
    expect(sent[0]!.headers['Authorization']).toBe('Bearer oauth-token-1')
  })

  it('a response whose result is not "success" is an error, not an empty list', async () => {
    fakeMyFolder('86377', { result: 'error', message: 'nope' })
    await expect(adapter.listSigners(CREDS, '86377', {})).rejects.toThrow(/success/)
  })

  it('a success response without the documented arrays is an error, not an empty list', async () => {
    fakeMyFolder('86377', { result: 'success', folder: {} })
    await expect(adapter.listDocuments(CREDS, '86377', {})).rejects.toThrow(/documentsList/)
    await expect(adapter.listAuditTrailEntries(CREDS, '86377', {})).rejects.toThrow(
      /Folder History/,
    )
    await expect(adapter.listSigners(CREDS, '86377', {})).rejects.toThrow(/folderRecipientParties/)
  })

  it('listSigners fails on a response without Folder History instead of reporting every status unknown', async () => {
    const { ['Folder History']: _h, ...noHistory } = MYFOLDER_EXAMPLE
    fakeMyFolder('86377', noHistory)
    await expect(adapter.listSigners(CREDS, '86377', {})).rejects.toThrow(/Folder History/)
  })
})

describe('FoxitESignAdapter per-envelope lists: documented example end to end', () => {
  it('listSigners returns both documented parties, schema-valid', async () => {
    fakeMyFolder('86377', MYFOLDER_EXAMPLE)
    const rows = await adapter.listSigners(CREDS, '86377', {})
    expect(rows.map((r) => SignerSchema.parse(r).id)).toEqual(['86377:1', '86377:28'])
    expect(rows[1]!.status).toBe('signed')
  })

  it('listDocuments returns the documented document, schema-valid', async () => {
    fakeMyFolder('86377', MYFOLDER_EXAMPLE)
    const rows = await adapter.listDocuments(CREDS, '86377', {})
    expect(rows.map((r) => DocumentSchema.parse(r).id)).toEqual(['86377:101857'])
  })

  it('listAuditTrailEntries returns the five documented history rows, schema-valid', async () => {
    fakeMyFolder('86377', MYFOLDER_EXAMPLE)
    const rows = await adapter.listAuditTrailEntries(CREDS, '86377', {})
    expect(rows.map((r) => AuditTrailEntrySchema.parse(r).eventType)).toEqual([
      'created',
      'sent',
      'viewed',
      'signed',
      'sent',
    ])
  })

  it('getSigner / getDocument / getAuditTrailEntry read back ids the lists return', async () => {
    fakeMyFolder('86377', MYFOLDER_EXAMPLE)
    expect((await adapter.getSigner(CREDS, '86377:28')).name).toBe('Jane Doe')
    expect((await adapter.getDocument(CREDS, '86377:101857')).name).toBe('Foxit eSign Sample')
    expect((await adapter.getAuditTrailEntry(CREDS, '86377:3')).eventType).toBe('signed')
  })
})

describe('FoxitESignAdapter per-envelope lists page locally over the whole folder', () => {
  it.each([
    ['listSigners', (p: QueryParams) => adapter.listSigners(CREDS, '86377', p), ids(N)],
    ['listDocuments', (p: QueryParams) => adapter.listDocuments(CREDS, '86377', p), ids(N)],
    [
      'listAuditTrailEntries',
      (p: QueryParams) => adapter.listAuditTrailEntries(CREDS, '86377', p),
      auditIds(N),
    ],
  ])('%s pages 1..3 return every id once with an exact hasMore', async (_n, list, expected) => {
    const { sent } = fakeMyFolder('86377', folderOfN(N))
    const { seen, more } = await walk(list, 3)
    expect(seen).toEqual(expected)
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
    // The endpoint has no paging parameters: every page asks only for the folder.
    for (const s of sent) expect(s.params).toEqual({ folderId: '86377' })
  })

  it('listDocuments keeps each document at its position in documentsList across pages', async () => {
    fakeMyFolder('86377', folderOfN(N))
    const orders: number[] = []
    for (let page = 1; page <= 3; page++) {
      const rows = await adapter.listDocuments(CREDS, '86377', withPageSink({ page, limit: L }))
      orders.push(...rows.map((r) => r.order!))
    }
    expect(orders).toEqual(Array.from({ length: N }, (_, i) => i))
  })

  it('a page past the end is empty with hasMore false', async () => {
    fakeMyFolder('86377', folderOfN(N))
    const params = withPageSink({ page: 4, limit: L })
    expect(await adapter.listSigners(CREDS, '86377', params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
