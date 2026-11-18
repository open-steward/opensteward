/**
 * DigiSigner list and read methods.
 *
 * Source: https://www.digisigner.com/esignature-api/esignature-api-documentation/
 * The API documents exactly these reads:
 *   GET https://api.digisigner.com/v1/documents/{document_id}          (file content)
 *   GET https://api.digisigner.com/v1/signature_requests/{signature_request_id}
 *   GET https://api.digisigner.com/v1/documents/{document_id}/fields
 *   GET .../documents/{document_id}/fields/{field_api_id}/attachment
 * and authenticates with "HTTP Basic Auth over HTTPS. A user's API key should
 * be provided as auth credentials: curl -u YOUR_API_KEY : ...".
 *
 * There is no list endpoint, no paging parameter, no audit endpoint, and no
 * template endpoint (templates are configured in the dashboard, the tutorial at
 * https://www.digisigner.com/esignature-api/signature-request-templates/ reads
 * the template id from "your browser address bar").
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { DigiSignerClient } from '../../../../../../src/verticals/docsign/adapters/digisigner/client'
import { DigiSignerAdapter } from '../../../../../../src/verticals/docsign/adapters/digisigner'
import type { RawDigiSignerSignatureRequest } from '../../../../../../src/verticals/docsign/adapters/digisigner/transform/envelope'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { documentedSignatureRequest, DOC_REQ_ID } from './fixture'

const CREDS = { accessToken: 'api-key-123' } as Credentials
const adapter = new DigiSignerAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

const docId = (i: number) => `doc-${i}`
const email = (i: number) => `signer${i}@example.com`

/** A signature request shaped like the documented sample, with n documents and n signers. */
function request(
  opts: { documents?: number; signers?: number } = {},
): RawDigiSignerSignatureRequest {
  const nDocs = opts.documents ?? 1
  const nSigners = opts.signers ?? 1
  const base = documentedSignatureRequest()
  // Signers are spread one per document, then the rest on the last document.
  const documents = Array.from({ length: nDocs }, (_, d) => ({
    document_id: docId(d),
    signers: [] as Array<{
      email: string
      is_signature_completed: boolean
      sign_document_url: string
    }>,
  }))
  for (let i = 0; i < nSigners; i++) {
    documents[Math.min(i, nDocs - 1)]!.signers.push({
      email: email(i),
      is_signature_completed: false,
      sign_document_url:
        'https://www.digisigner.com/online/showDocument?documentId=x&invitationId=y',
    })
  }
  return { ...base, documents }
}

/** Fake of the one documented JSON read. Rejects any query parameter (none is documented). */
function mockApi(body: RawDigiSignerSignatureRequest) {
  const calls: string[] = []
  const get = vi
    .spyOn(DigiSignerClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (params !== undefined) throw new Error(`${path} documents no query params`)
      calls.push(path)
      if (path === `/signature_requests/${encodeURIComponent(DOC_REQ_ID)}`) return body as never
      throw new Error(`undocumented path ${path}`)
    })
  return { get, calls }
}

const L = 2
const N = 2 * L + 1

describe('DigiSignerClient', () => {
  it('uses the documented base URL and HTTP Basic auth with the API key as the username', () => {
    const create = vi.spyOn(axios, 'create')
    new DigiSignerClient(CREDS)
    const cfg = create.mock.calls[0]![0]!
    expect(cfg.baseURL).toBe('https://api.digisigner.com/v1')
    expect(cfg.auth).toEqual({ username: 'api-key-123', password: '' })
    expect((cfg.headers as Record<string, unknown>)['Authorization']).toBeUndefined()
  })

  it('refuses to build without an API key', () => {
    expect(() => new DigiSignerClient({} as Credentials)).toThrow(/API key/)
  })
})

describe('DigiSignerAdapter.getEnvelope reads GET /v1/signature_requests/{id}', () => {
  it('reads the documented sample into a canonical envelope', async () => {
    const { calls } = mockApi(documentedSignatureRequest())
    const e = EnvelopeSchema.parse(await adapter.getEnvelope(CREDS, DOC_REQ_ID))
    expect(e.id).toBe(DOC_REQ_ID)
    expect(calls).toEqual([`/signature_requests/${DOC_REQ_ID}`])
  })

  it('percent-encodes the id into the documented path segment', async () => {
    const get = vi
      .spyOn(DigiSignerClient.prototype, 'get')
      .mockResolvedValue({ ...documentedSignatureRequest(), signature_request_id: 'a/b' } as never)
    await adapter.getEnvelope(CREDS, 'a/b')
    expect(get).toHaveBeenCalledWith('/signature_requests/a%2Fb')
  })
})

describe('DigiSignerAdapter.listSigners pages the signature request signers locally', () => {
  it('walks N = 2L+1 signers across documents: every id once, exact hasMore', async () => {
    const { calls } = mockApi(request({ documents: 3, signers: N }))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, DOC_REQ_ID, params)
      rows.forEach((r) => SignerSchema.parse(r))
      seen.push(...rows.map((r) => r.email!))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => email(i)))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
    expect(calls.every((c) => c === `/signature_requests/${DOC_REQ_ID}`)).toBe(true)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockApi(request({ documents: 1, signers: N }))
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter.listSigners(CREDS, DOC_REQ_ID, params), params, 'digisigner')
    expect(env.data.map((r) => r.email)).toEqual([email(2), email(3)])
    expect(env.meta.hasMore).toBe(true)
  })

  it('an unsigned signer on a send_emails=false request is created, through the adapter', async () => {
    mockApi({ ...request({ documents: 1, signers: 2 }), send_emails: false })
    const rows = await adapter.listSigners(CREDS, DOC_REQ_ID, withPageSink({ page: 1, limit: 5 }))
    expect(rows.map((r) => r.status)).toEqual(['created', 'created'])
  })

  it('send_emails omitted takes the documented default (true): sent', async () => {
    const { send_emails: _omit, ...rest } = request({ documents: 1, signers: 2 })
    mockApi(rest)
    const rows = await adapter.listSigners(CREDS, DOC_REQ_ID, withPageSink({ page: 1, limit: 5 }))
    expect(rows.map((r) => r.status)).toEqual(['sent', 'sent'])
  })

  it('getSigner reads back an id whose email contains a colon', async () => {
    const body = request({ documents: 1, signers: 1 })
    body.documents![0]!.signers![0]!.email = '"a:b"@example.com'
    mockApi(body)
    const id = `${DOC_REQ_ID}:doc-0:"a:b"@example.com`
    expect((await adapter.getSigner(CREDS, id)).id).toBe(id)
  })

  it('getSigner reads back a listed id', async () => {
    mockApi(request({ documents: 2, signers: 3 }))
    const [, second] = await adapter.listSigners(
      CREDS,
      DOC_REQ_ID,
      withPageSink({ page: 1, limit: 5 }),
    )
    const back = await adapter.getSigner(CREDS, second!.id)
    expect(back).toEqual(second)
    await expect(adapter.getSigner(CREDS, 'nope')).rejects.toThrow(/signatureRequestId/)
    await expect(adapter.getSigner(CREDS, `${DOC_REQ_ID}:doc-9:x@example.com`)).rejects.toThrow(
      /not found/,
    )
  })
})

describe('DigiSignerAdapter.listDocuments pages the signature request documents locally', () => {
  it('walks N = 2L+1 documents: every id once, exact hasMore', async () => {
    const { calls } = mockApi(request({ documents: N, signers: N }))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listDocuments(CREDS, DOC_REQ_ID, params)
      rows.forEach((r) => DocumentSchema.parse(r))
      seen.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => docId(i)))
    expect(more).toEqual([true, true, false])
    expect(calls.every((c) => c === `/signature_requests/${DOC_REQ_ID}`)).toBe(true)
  })

  it('keeps each document position as its order', async () => {
    mockApi(request({ documents: N, signers: N }))
    const rows = await adapter.listDocuments(CREDS, DOC_REQ_ID, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.order)).toEqual([2, 3])
  })

  it('getDocument reads back a listed id', async () => {
    mockApi(request({ documents: 3, signers: 3 }))
    const [, second] = await adapter.listDocuments(
      CREDS,
      DOC_REQ_ID,
      withPageSink({ page: 1, limit: 5 }),
    )
    expect(await adapter.getDocument(CREDS, second!.id)).toEqual(second)
    await expect(adapter.getDocument(CREDS, 'doc-1')).rejects.toThrow(/signatureRequestId/)
  })
})

describe('refused methods throw 501 NOT_SUPPORTED and send nothing', () => {
  const cases: Array<[string, () => Promise<unknown>, RegExp]> = [
    [
      'listEnvelopes',
      () => adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: 10 })),
      /cannot list envelopes/,
    ],
    [
      'listAuditTrailEntries',
      () => adapter.listAuditTrailEntries(CREDS, DOC_REQ_ID, withPageSink({ page: 1, limit: 10 })),
      /cannot list audit trail entries/,
    ],
    [
      'getAuditTrailEntry',
      () => adapter.getAuditTrailEntry(CREDS, `${DOC_REQ_ID}:0`),
      /audit trail/,
    ],
    [
      'listTemplates',
      () => adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: 10 })),
      /cannot list templates/,
    ],
    [
      'getTemplate',
      () => adapter.getTemplate(CREDS, 'e79901d2-73aa-42c0-909b-162cce23757c'),
      /templates/,
    ],
  ]
  for (const [name, call, msg] of cases) {
    it(name, async () => {
      const get = vi.spyOn(DigiSignerClient.prototype, 'get')
      const post = vi.spyOn(DigiSignerClient.prototype, 'post')
      const create = vi.spyOn(axios, 'create')
      await expect(call()).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(msg),
      })
      expect(get).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    })
  }
})
