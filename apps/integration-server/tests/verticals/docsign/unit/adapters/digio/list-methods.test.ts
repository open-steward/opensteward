/**
 * Digio reads one document through "Get Document Details", and documents no JSON audit trail:
 *
 *   https://documentation.digio.in/swagger/get_getDocumentObject.json
 *     "/v2/client/document/{docId}":{"get":{"summary":"Get Document Details",...
 *      "parameters":[{"name":"docId","in":"path",...}]
 *     ExternalDocDetails."signing_parties": {"type":"array","description":"Array of signing parties"}
 *   https://documentation.digio.in/swagger/get_getDocumentAuditLogV2.json
 *     "/v2/client/document/{doc_id}/v2/audit_log":{"get":{"summary":"Download audit trail",...
 *      "200":{"description":"Successfully downloaded the audit trail","content":{"*\/*":
 *      {"schema":{"type":"file","description":"Pdf File","format":"byte"}
 *
 * The fake answers ONLY that documented path with no query parameters; the old
 * /v3/client/document/{id} and /document/{id}/audit-trail paths are rejected.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { DigioClient } from '../../../../../../src/verticals/docsign/adapters/digio/client'
import { DigioAdapter } from '../../../../../../src/verticals/docsign/adapters/digio'
import { API_ORIGIN } from '../../../../../../src/verticals/docsign/adapters/digio/constants'
import { transformEnvelope } from '../../../../../../src/verticals/docsign/adapters/digio/transform/envelope'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { documentDetails } from './fixtures'

const CREDS = { accessToken: Buffer.from('cid:secret').toString('base64') } as Credentials
const adapter = new DigioAdapter({ clientId: '', clientSecret: '', redirectUri: '' })
const DOC = 'DID2409241200000000AB'

afterEach(() => {
  vi.restoreAllMocks()
})

function fakeDigio(doc: ReturnType<typeof documentDetails>) {
  return vi
    .spyOn(DigioClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/v2/client/document/${doc.id}`) throw new Error(`undocumented path ${path}`)
      if (params !== undefined && Object.keys(params).length > 0)
        throw new Error(`undocumented params ${JSON.stringify(params)}`)
      return doc as never
    })
}

function parties(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `Signer ${i}`,
    status: 'requested',
    type: 'signatory',
    identifier: `s${i}@example.com`,
  }))
}

describe('Digio client', () => {
  it('sends requests to the documented backend origin, not a /v3/client base', () => {
    const create = vi.spyOn(axios, 'create')
    new DigioClient(CREDS)
    expect(create.mock.calls[0]![0]!.baseURL).toBe(API_ORIGIN)
    expect(API_ORIGIN).toBe('https://ext.digio.in:444')
  })
})

describe('DigioAdapter.listSigners reads signing_parties of Get Document Details', () => {
  const L = 2
  const N = 2 * L + 1

  it('calls only the documented path', async () => {
    const get = fakeDigio(documentDetails(DOC))
    const rows = await adapter.listSigners(CREDS, DOC, {})
    expect(rows.map((r) => r.externalId)).toEqual(['asha@example.com', '9876543210'])
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe(`/v2/client/document/${DOC}`)
  })

  it('pages 1..3 serve every signer once with exact hasMore', async () => {
    fakeDigio(documentDetails(DOC, parties(N)))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, DOC, params)
      expect(rows.length).toBeLessThanOrEqual(L)
      seen.push(...rows.map((r) => r.id))
      const up = readUpstreamPage(params)
      more.push(up?.hasMore)
      expect(up?.totalCount).toBe(N)
      expect(up?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `${DOC}:s${i}@example.com`))
    expect(more).toEqual([true, true, false])
  })

  it('getSigner reads back an id listSigners returned', async () => {
    fakeDigio(documentDetails(DOC))
    const [, second] = await adapter.listSigners(CREDS, DOC, {})
    const got = await adapter.getSigner(CREDS, second!.id)
    expect(got).toEqual(second)
  })

  it('getSigner answers 404 for an identifier not on the document', async () => {
    fakeDigio(documentDetails(DOC))
    await expect(adapter.getSigner(CREDS, `${DOC}:nobody@example.com`)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('refuses a reply that repeats an identifier rather than emit duplicate ids', async () => {
    fakeDigio(documentDetails(DOC, [...parties(2), parties(1)[0]!]))
    await expect(adapter.listSigners(CREDS, DOC, {})).rejects.toThrow(/repeats signing party/)
  })

  it('getSigner rejects an id that names no document', async () => {
    const get = fakeDigio(documentDetails(DOC))
    await expect(adapter.getSigner(CREDS, 'asha@example.com')).rejects.toThrow(
      /<docId>:<identifier>/,
    )
    expect(get).not.toHaveBeenCalled()
  })
})

describe('DigioAdapter.listDocuments is the one document of Get Document Details', () => {
  it('page 1 holds the document, page 2 is empty, hasMore is exact', async () => {
    const get = fakeDigio(documentDetails(DOC))
    const p1 = withPageSink({ page: 1, limit: 1 })
    const rows1 = await adapter.listDocuments(CREDS, DOC, p1)
    expect(rows1.map((r) => r.id)).toEqual([DOC])
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: false, totalCount: 1 })
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listDocuments(CREDS, DOC, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
    for (const [path] of get.mock.calls) expect(path).toBe(`/v2/client/document/${DOC}`)
  })

  it('getDocument reads the same record listDocuments returned', async () => {
    fakeDigio(documentDetails(DOC))
    const [listed] = await adapter.listDocuments(CREDS, DOC, {})
    expect(await adapter.getDocument(CREDS, listed!.id)).toEqual(listed)
  })
})

describe('DigioAdapter audit trail is refused', () => {
  const refusals: Array<[string, () => Promise<unknown>]> = [
    [
      'listAuditTrailEntries',
      () => adapter.listAuditTrailEntries(CREDS, DOC, { page: 1, limit: 10 }),
    ],
    ['getAuditTrailEntry', () => adapter.getAuditTrailEntry(CREDS, `${DOC}:0`)],
  ]

  it.each(refusals)('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    const get = vi.spyOn(DigioClient.prototype, 'get')
    const err = await call().then(
      () => undefined,
      (e: unknown) => e as Error & { statusCode?: number; code?: string },
    )
    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toMatch(/Digio cannot list audit trail entries/)
    expect(err?.statusCode).toBe(501)
    expect(err?.code).toBe('NOT_SUPPORTED')
    expect(get).not.toHaveBeenCalled()
  })
})

describe('Digio envelope and signer ids share one id space', () => {
  it("an envelope's signerIds are the ids listSigners returns", async () => {
    const doc = documentDetails(DOC)
    fakeDigio(doc)
    const signers = await adapter.listSigners(CREDS, DOC, {})
    const envelope = EnvelopeSchema.parse(transformEnvelope(doc))
    expect(envelope.signerIds).toEqual(signers.map((s) => SignerSchema.parse(s).id))
  })
})
