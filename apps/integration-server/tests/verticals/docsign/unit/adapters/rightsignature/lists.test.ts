/**
 * RightSignature signers, documents and audit trail.
 *
 * All three are nested in one response, documented at
 * https://api.rightsignature.com/documentation/resources/v1/documents (show):
 *   "api_url":"/public/v1/documents/:id","http_method":"GET",
 *   "short_description":"Return data for a specific Document"
 * whose only parameter is `id` ("Document ID"). The fake below answers that
 * path alone, rejects any query parameter, and the adapter pages locally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { RightSignatureClient } from '../../../../../../src/verticals/docsign/adapters/rightsignature/client'
import { RightSignatureAdapter } from '../../../../../../src/verticals/docsign/adapters/rightsignature'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { AuditTrailEntrySchema } from '../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { ARCHIVED_AUDITS, SHOW_DOCUMENT } from './fixtures'

const CREDS = { accessToken: 'tok' } as Credentials
const DOC_ID = SHOW_DOCUMENT.document.id
const L = 2
const N = 2 * L + 1

afterEach(() => vi.restoreAllMocks())

const adapter = new RightSignatureAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

/** A document carrying N recipients and N audits, built from the documented elements. */
function bigDocument() {
  const [r0] = SHOW_DOCUMENT.document.recipients
  const [a0] = ARCHIVED_AUDITS
  return {
    document: {
      ...SHOW_DOCUMENT.document,
      recipients: Array.from({ length: N }, (_, i) => ({ ...r0!, id: `rcp_${i}` })),
      audits: Array.from({ length: N }, (_, i) => ({ ...a0!, id: 100 + i })),
    },
  }
}

function fakeShow(body: unknown = bigDocument()) {
  return vi
    .spyOn(RightSignatureClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/public/v1/documents/${DOC_ID}`) throw new Error(`undocumented path ${path}`)
      if (params !== undefined) throw new Error('documents show takes no query parameters')
      return body as never
    })
}

describe('RightSignatureAdapter request shape', () => {
  it.each([
    ['listSigners', () => adapter.listSigners(CREDS, DOC_ID, {})],
    ['listDocuments', () => adapter.listDocuments(CREDS, DOC_ID, {})],
    ['listAuditTrailEntries', () => adapter.listAuditTrailEntries(CREDS, DOC_ID, {})],
  ])('%s GETs /public/v1/documents/:id once, with no query', async (_name, call) => {
    const get = fakeShow()
    await call()
    expect(get.mock.calls).toEqual([[`/public/v1/documents/${DOC_ID}`]])
  })

  it('percent-encodes the document id into the path', async () => {
    const get = vi
      .spyOn(RightSignatureClient.prototype, 'get')
      .mockResolvedValue(SHOW_DOCUMENT as never)
    await adapter.listSigners(CREDS, 'a/b?c', {})
    expect(get.mock.calls).toEqual([['/public/v1/documents/a%2Fb%3Fc']])
  })

  it.each([
    ['getSigner', (id: string) => adapter.getSigner(CREDS, id)],
    ['getDocument', (id: string) => adapter.getDocument(CREDS, id)],
    ['getAuditTrailEntry', (id: string) => adapter.getAuditTrailEntry(CREDS, id)],
  ])('%s rejects a compound id with more than two parts, sending nothing', async (_n, call) => {
    const get = fakeShow(SHOW_DOCUMENT)
    await expect(call(`${DOC_ID}:${DOC_ID}:extra`)).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION',
    })
    expect(get).not.toHaveBeenCalled()
  })

  it('a response without `document` is a 404', async () => {
    fakeShow({})
    await expect(adapter.listSigners(CREDS, DOC_ID, {})).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })
})

describe('RightSignatureAdapter.listSigners reads document.recipients[]', () => {
  it('returns the documented recipients, schema-valid', async () => {
    fakeShow(SHOW_DOCUMENT)
    const rows = await adapter.listSigners(CREDS, DOC_ID, {})
    expect(rows.map((r) => SignerSchema.parse(r).externalId)).toEqual([
      'c76fad94-749b-495b-b088-c184282072e4',
      '248883ae-a840-479f-8c2e-04de584019f9',
    ])
  })

  it('pages 1..3 return every id once with an exact hasMore', async () => {
    fakeShow()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await adapter.listSigners(CREDS, DOC_ID, params)).map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `rcp_${i}`))
    expect(more).toEqual([true, true, false])
  })

  it('getSigner reads back an id listSigners returned', async () => {
    fakeShow(SHOW_DOCUMENT)
    const [first] = await adapter.listSigners(CREDS, DOC_ID, {})
    const got = await adapter.getSigner(CREDS, first!.id)
    expect(got.externalId).toBe(first!.externalId)
  })

  it('getSigner 404s on an unknown recipient and rejects a bare id', async () => {
    fakeShow(SHOW_DOCUMENT)
    await expect(adapter.getSigner(CREDS, `${DOC_ID}:nope`)).rejects.toMatchObject({
      statusCode: 404,
    })
    await expect(adapter.getSigner(CREDS, DOC_ID)).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('RightSignatureAdapter.listDocuments projects the one file', () => {
  it('page 1 is the file with hasMore false; page 2 is empty', async () => {
    fakeShow(SHOW_DOCUMENT)
    const p1 = withPageSink({ page: 1, limit: L })
    const rows = await adapter.listDocuments(CREDS, DOC_ID, p1)
    expect(rows.map((r) => DocumentSchema.parse(r).name)).toEqual(['application.pdf'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = withPageSink({ page: 2, limit: L })
    expect(await adapter.listDocuments(CREDS, DOC_ID, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('getDocument reads back the id listDocuments returned', async () => {
    fakeShow(SHOW_DOCUMENT)
    const [doc] = await adapter.listDocuments(CREDS, DOC_ID, {})
    expect((await adapter.getDocument(CREDS, doc!.id)).externalId).toBe(DOC_ID)
    await expect(adapter.getDocument(CREDS, `${DOC_ID}:other`)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('RightSignatureAdapter.listAuditTrailEntries reads document.audits[]', () => {
  it('returns the documented audits, schema-valid', async () => {
    fakeShow({ document: { ...SHOW_DOCUMENT.document, audits: ARCHIVED_AUDITS } })
    const rows = await adapter.listAuditTrailEntries(CREDS, DOC_ID, {})
    expect(rows.map((r) => AuditTrailEntrySchema.parse(r).externalId)).toEqual([
      '34',
      '31',
      '33',
      '32',
    ])
  })

  it('pages 1..3 return every id once with an exact hasMore', async () => {
    fakeShow()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listAuditTrailEntries(CREDS, DOC_ID, params)
      seen.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(100 + i)))
    expect(more).toEqual([true, true, false])
  })

  it('getAuditTrailEntry reads back an id the list returned', async () => {
    fakeShow({ document: { ...SHOW_DOCUMENT.document, audits: ARCHIVED_AUDITS } })
    const rows = await adapter.listAuditTrailEntries(CREDS, DOC_ID, {})
    const got = await adapter.getAuditTrailEntry(CREDS, rows[2]!.id)
    expect(got.description).toBe('Document signed by Ad (test@test.com) with drawn signature.')
    await expect(adapter.getAuditTrailEntry(CREDS, `${DOC_ID}:999`)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
