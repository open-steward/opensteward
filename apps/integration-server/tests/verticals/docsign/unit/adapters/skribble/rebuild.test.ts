/**
 * Skribble documents and templates, rebuilt onto the documented API
 * (https://api-doc.skribble.com/).
 *
 * Documents: the "SignatureRequest (Response)" table documents a single
 * `document_id` ("ID of the `Document` object ... Use this for detailled
 * requests to this `Document`"), and "Get the document metadata" is
 * `GET /v2/documents/{{DOC_ID}}`. There is no `documents[]` array on a
 * SignatureRequest, which is what the adapter used to read.
 *
 * Templates: the reference documents no template resource at all, so
 * `listTemplates` / `getTemplate` refuse before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { SkribbleClient } from '../../../../../../src/verticals/docsign/adapters/skribble/client'
import { SkribbleAdapter } from '../../../../../../src/verticals/docsign/adapters/skribble'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { DOCUMENT_EXAMPLE, SIGNATURE_REQUEST_EXAMPLE } from './transform/fixtures'

const CREDS = { accessToken: 'jwt' } as Credentials
const adapter = new SkribbleAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
const ENV = SIGNATURE_REQUEST_EXAMPLE.id
const DOC = SIGNATURE_REQUEST_EXAMPLE.document_id

afterEach(() => vi.restoreAllMocks())

/**
 * A fake that serves ONLY the documented paths, `GET /signature-requests/{id}`
 * and `GET /documents/{id}`, and rejects any query parameter (neither is
 * documented to take one).
 */
const SIGNED_DOC = 'signed-0000-4a6a-a958-000000000001'

function mockApi(sr: Record<string, unknown> = SIGNATURE_REQUEST_EXAMPLE) {
  const calls: Array<{ path: string; params?: Record<string, unknown> }> = []
  const docs: Record<string, unknown> = {
    [DOC]: { ...DOCUMENT_EXAMPLE, id: DOC },
    [SIGNED_DOC]: { ...DOCUMENT_EXAMPLE, id: SIGNED_DOC, page_count: 2 },
  }
  const handler = async (path: string, params?: Record<string, unknown>) => {
    calls.push({ path, params })
    if (params && Object.keys(params).length > 0) {
      throw new Error(`undocumented params on ${path}: ${JSON.stringify(params)}`)
    }
    if (path === `/signature-requests/${ENV}`) return sr as never
    const m = /^\/documents\/([^/]+)$/.exec(path)
    if (m && docs[m[1]!]) return docs[m[1]!] as never
    throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
  }
  vi.spyOn(SkribbleClient.prototype, 'get').mockImplementation(handler)
  vi.spyOn(SkribbleClient.prototype, 'tryGet').mockImplementation(handler)
  return calls
}

/** Every client verb, for asserting that nothing was sent. */
function spyAllVerbs() {
  const fail = async () => {
    throw new Error('no request may be sent')
  }
  return [
    vi.spyOn(SkribbleClient.prototype, 'get').mockImplementation(fail),
    vi.spyOn(SkribbleClient.prototype, 'tryGet').mockImplementation(fail),
    vi.spyOn(SkribbleClient.prototype, 'post').mockImplementation(fail),
    vi.spyOn(SkribbleClient.prototype, 'put').mockImplementation(fail),
  ]
}

describe('SkribbleAdapter.listDocuments reads the documented document_id', () => {
  it('fetches the request, then GET /documents/{document_id}, and returns one Document', async () => {
    const calls = mockApi()
    const rows = await adapter.listDocuments(CREDS, ENV, withPageSink({ page: 1, limit: 10 }))
    expect(calls.map((c) => c.path)).toEqual([`/signature-requests/${ENV}`, `/documents/${DOC}`])
    expect(rows).toHaveLength(1)
    const doc = DocumentSchema.parse(rows[0])
    expect(doc.id).toBe(`${ENV}:document`)
    expect(doc.externalId).toBe(DOC)
    expect(doc.envelopeId).toBe(ENV)
    expect(doc.name).toBe('First example contract')
    expect(doc.sizeBytes).toBe(29094)
    expect(doc.pageCount).toBe(1)
  })

  it('a request without document_id lists nothing and fetches no document', async () => {
    const { document_id: _omit, ...noDoc } = SIGNATURE_REQUEST_EXAMPLE
    const calls = mockApi(noDoc)
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await adapter.listDocuments(CREDS, ENV, params)).toEqual([])
    expect(calls.map((c) => c.path)).toEqual([`/signature-requests/${ENV}`])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('ignores an undocumented documents[] array', async () => {
    const calls = mockApi({
      ...SIGNATURE_REQUEST_EXAMPLE,
      documents: [{ document_id: 'x-1' }, { document_id: 'x-2' }],
    })
    const rows = await adapter.listDocuments(CREDS, ENV, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.externalId)).toEqual([DOC])
    expect(calls.map((c) => c.path)).not.toContain('/documents/x-1')
  })

  // A documented SignatureRequest carries exactly one document_id, so the
  // collection has N = 1 and the smallest walk is L = 1: page 1 holds it with
  // hasMore false, page 2 is empty.
  it('paging walk: every id once, hasMore exact', async () => {
    mockApi()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: 1 })
      const rows = await adapter.listDocuments(CREDS, ENV, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(1)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual([`${ENV}:document`])
    expect(more).toEqual([false, false])
  })
})

describe('SkribbleAdapter.getDocument reads back the ids listDocuments returns', () => {
  it('round-trips the listed id', async () => {
    mockApi()
    const [listed] = await adapter.listDocuments(CREDS, ENV, {})
    const got = DocumentSchema.parse(await adapter.getDocument(CREDS, listed!.id))
    expect(got).toEqual(listed)
  })

  // "The document ID you receive after uploading will never be the same ID
  // after signing, or any other change made to the document." (Documents
  // folder, https://api-doc.skribble.com/). An id listed before signing must
  // still read back once the request points at the signed document.
  it('an id listed before signing still reads back after the document_id changes', async () => {
    const sr: Record<string, unknown> = { ...SIGNATURE_REQUEST_EXAMPLE }
    const calls = mockApi(sr)
    const [listed] = await adapter.listDocuments(CREDS, ENV, {})
    expect(listed!.externalId).toBe(DOC)
    sr.document_id = SIGNED_DOC
    const got = DocumentSchema.parse(await adapter.getDocument(CREDS, listed!.id))
    expect(got.id).toBe(listed!.id)
    expect(got.externalId).toBe(SIGNED_DOC)
    expect(got.pageCount).toBe(2)
    expect(calls.map((c) => c.path).slice(-1)).toEqual([`/documents/${SIGNED_DOC}`])
  })

  it('reports a request with no document_id instead of inventing one', async () => {
    const { document_id: _omit, ...noDoc } = SIGNATURE_REQUEST_EXAMPLE
    mockApi(noDoc)
    await expect(adapter.getDocument(CREDS, `${ENV}:document`)).rejects.toThrow(/no document_id/)
  })

  it.each([
    ['a bare id', DOC],
    ['a Skribble document id in the slot', `${ENV}:${DOC}`],
    ['an empty envelope id', ':document'],
  ])('rejects %s before sending anything', async (_label, id) => {
    const spies = spyAllVerbs()
    await expect(adapter.getDocument(CREDS, id)).rejects.toThrow(/<envelopeId>:document/)
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })
})

describe('SkribbleAdapter.listDocuments encodes path ids', () => {
  it('percent-encodes the envelope id and the document_id', async () => {
    const paths: string[] = []
    vi.spyOn(SkribbleClient.prototype, 'get').mockImplementation(async (path: string) => {
      paths.push(path)
      if (path.startsWith('/signature-requests/')) {
        return { ...SIGNATURE_REQUEST_EXAMPLE, document_id: 'd/1 x' } as never
      }
      return { ...DOCUMENT_EXAMPLE, id: 'd/1 x' } as never
    })
    await adapter.listDocuments(CREDS, 'e/1 x', {})
    expect(paths).toEqual(['/signature-requests/e%2F1%20x', '/documents/d%2F1%20x'])
  })
})

describe('Skribble documents no template resource', () => {
  it.each([
    ['listTemplates', () => adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: 10 }))],
    ['getTemplate', () => adapter.getTemplate(CREDS, 'tpl-1')],
  ] as const)('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    const spies = spyAllVerbs()
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })
})
