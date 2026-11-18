/**
 * Yousign signers, documents, audit trails and templates.
 *
 * - List Signature Request's Signers
 *   (https://developers.youtrust.com/reference/get-signature_requests-signaturerequestid-signers-1.md)
 *   takes only the `signatureRequestId` path parameter and answers a bare
 *   array: `{"items":{"$ref":"#/components/schemas/Signer"},"type":"array"}`.
 * - List Signature Request's Documents
 *   (https://developers.youtrust.com/reference/get-signature_requests-signaturerequestid-documents-1.md)
 *   takes the path parameter plus an optional `nature` filter, and answers a
 *   bare array of `Document`.
 *   Neither takes a page or limit, so both are paged locally.
 * - There is no JSON audit-trail list per Signature Request, only a PDF
 *   download and a per-signer "Get Signer Audit Trail" that is "Only possible
 *   when Signer status is `signed`"
 *   (https://developers.youtrust.com/reference/audit-trail.md).
 * - List Templates is `GET /templates`
 *   (https://developers.youtrust.com/reference/get-templates-1.md), whose
 *   `Template` documents only id, name, description, status, created_at and
 *   workspace_id, while the Template guide says a template "is at least
 *   composed of: Documents" (https://developers.youtrust.com/docs/template.md).
 *   The canonical Template's required `documentCount` has no documented source.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { YousignClient } from '../../../../../../src/verticals/docsign/adapters/yousign/client'
import { YousignAdapter } from '../../../../../../src/verticals/docsign/adapters/yousign'

const CREDS = { accessToken: 'ys_token' } as Credentials
const SR = '9a93d3b5-fb3b-4abf-9e70-26315b33506c'
const L = 2
const N = 2 * L + 1

afterEach(() => vi.restoreAllMocks())

const adapter = new YousignAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

const signerIds = (n: number) => Array.from({ length: n }, (_, i) => `sn-${i + 1}`)
const docIds = (n: number) => Array.from({ length: n }, (_, i) => `doc-${i + 1}`)

function signer(id: string) {
  return {
    id,
    info: {
      first_name: 'Johnny',
      last_name: 'Wallyday',
      email: 'johnny.wallyday@example.com',
      phone_number: null,
      locale: 'en',
    },
    status: 'notified',
    signed_at: null,
  }
}

function document(id: string) {
  return {
    id,
    filename: `${id}.pdf`,
    nature: 'signable_document',
    content_type: 'application/pdf',
    total_pages: 1,
  }
}

/**
 * A fake that honours only the documented shape: the path, no query params
 * at all (the optional `nature` filter is not used), and a bare JSON array.
 */
function fakeBareArray(path: string, rows: unknown[]) {
  return vi
    .spyOn(YousignClient.prototype, 'get')
    .mockImplementation(async (p: string, params?: Record<string, unknown>) => {
      if (p !== path) throw new Error(`unexpected path ${p}`)
      if (params !== undefined) throw new Error(`undocumented params ${JSON.stringify(params)}`)
      return rows as never
    })
}

describe('YousignAdapter.listSigners reads the bare Signer array', () => {
  const PATH = `/signature_requests/${SR}/signers`

  it('sends GET /signature_requests/{id}/signers with no query params', async () => {
    const get = fakeBareArray(PATH, signerIds(1).map(signer))
    const rows = await adapter.listSigners(CREDS, SR, withPageSink({ page: 1, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]).toEqual([PATH])
    expect(rows.map((r) => r.id)).toEqual(['sn-1'])
    expect(rows[0]!.envelopeId).toBe(SR)
    expect(rows[0]!.email).toBe('johnny.wallyday@example.com')
  })

  it('pages 1..3 return every id once, with an exact hasMore', async () => {
    fakeBareArray(PATH, signerIds(N).map(signer))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await adapter.listSigners(CREDS, SR, params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(signerIds(N))
    expect(more).toEqual([true, true, false])
  })
})

describe('a reply that is not the documented bare array is an error, not []', () => {
  it.each([
    ['listSigners', `/signature_requests/${SR}/signers`],
    ['listDocuments', `/signature_requests/${SR}/documents`],
  ] as const)('%s throws on a { data } envelope', async (method, path) => {
    fakeBareArray(path, { data: [signer('sn-1')] } as never)
    await expect(adapter[method](CREDS, SR, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /did not answer the documented JSON array/,
    )
  })
})

describe('YousignAdapter.listDocuments reads the bare Document array', () => {
  const PATH = `/signature_requests/${SR}/documents`

  it('sends GET /signature_requests/{id}/documents with no query params', async () => {
    const get = fakeBareArray(PATH, docIds(1).map(document))
    const rows = await adapter.listDocuments(CREDS, SR, withPageSink({ page: 1, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]).toEqual([PATH])
    expect(rows.map((r) => r.id)).toEqual(['doc-1'])
    expect(rows[0]!.name).toBe('doc-1.pdf')
  })

  it('pages 1..3 return every id once, with an exact hasMore and an absolute order', async () => {
    fakeBareArray(PATH, docIds(N).map(document))
    const seen: string[] = []
    const orders: number[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listDocuments(CREDS, SR, params)
      seen.push(...rows.map((r) => r.id))
      orders.push(...rows.map((r) => r.order))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(docIds(N))
    expect(orders).toEqual([0, 1, 2, 3, 4])
    expect(more).toEqual([true, true, false])
  })
})

describe('Yousign refuses what it cannot serve, before sending anything', () => {
  function spyAll() {
    const sent = async () => {
      throw new Error('a request was sent')
    }
    return [
      vi.spyOn(YousignClient.prototype, 'get').mockImplementation(sent),
      vi.spyOn(YousignClient.prototype, 'post').mockImplementation(sent),
    ] as const
  }

  async function expectRefusal(call: () => Promise<unknown>, message: RegExp) {
    const [get, post] = spyAll()
    const p = call()
    await expect(p).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    await expect(p).rejects.toThrow(message)
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  }

  it('listAuditTrailEntries throws 501 NOT_SUPPORTED', async () => {
    await expectRefusal(
      () => adapter.listAuditTrailEntries(CREDS, SR, withPageSink({ page: 1, limit: L })),
      /Yousign cannot list audit trail entries/,
    )
  })

  it('getAuditTrailEntry throws 501 NOT_SUPPORTED', async () => {
    await expectRefusal(
      () => adapter.getAuditTrailEntry(CREDS, `${SR}:0`),
      /Yousign cannot read an audit trail entry/,
    )
  })

  it('listTemplates throws 501 NOT_SUPPORTED', async () => {
    await expectRefusal(
      () => adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L })),
      /Yousign cannot list templates/,
    )
  })

  it('getSigner throws 501 NOT_SUPPORTED: Get a Signer needs the signature request id', async () => {
    await expectRefusal(
      () => adapter.getSigner(CREDS, '44e4b0f8-55c9-48a9-803f-d89957525270'),
      /Yousign cannot read a signer by id alone/,
    )
  })

  it('getDocument throws 501 NOT_SUPPORTED: Get a Document needs the signature request id', async () => {
    await expectRefusal(
      () => adapter.getDocument(CREDS, '7f8a5b3c-1d2e-4f60-8a9b-0c1d2e3f4a5b'),
      /Yousign cannot read a document by id alone/,
    )
  })

  it('getTemplate throws 501 NOT_SUPPORTED', async () => {
    await expectRefusal(
      () => adapter.getTemplate(CREDS, '89120884-d29a-4b1a-ac7b-a9e73a872795'),
      /Yousign cannot read a template/,
    )
  })
})
