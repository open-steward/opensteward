/**
 * Paging for Leegality's per-envelope list methods.
 *
 * `GET /sign/request?documentId=` is documented as "GET /v3.2/sign/request —
 * Check transaction status"
 * (https://knowledge.leegality.com/document-execution/api/check-transaction-status).
 * `documentId` is its only parameter, and it returns the whole `requests[]`
 * ("Array of invitee (signer/approver) status objects") and `files[]` ("CDN
 * download URLs for the document PDF(s)"), with no paging. listSigners and
 * listDocuments used to return the whole list for every page, so page 2
 * repeated page 1. They now page that whole list locally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { LeegalityClient } from '../../../../../../src/verticals/docsign/adapters/leegality/client'
import { LeegalityAdapter } from '../../../../../../src/verticals/docsign/adapters/leegality'

const CREDS = { accessToken: 'tok' } as Credentials
const adapter = new LeegalityAdapter()

afterEach(() => vi.restoreAllMocks())

/** A fake details read for one document with `n` invitees and `n` files. */
function mockDetails(n: number) {
  return vi
    .spyOn(LeegalityClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/sign/request') throw new Error(`unexpected path ${path}`)
      const documentId = String(params?.['documentId'])
      return {
        status: 1,
        data: {
          documentId,
          name: 'Agreement',
          requests: Array.from({ length: n }, (_, i) => ({
            name: `Invitee ${i}`,
            email: `inv${i}@example.com`,
            signed: false,
            active: true,
          })),
          files: Array.from({ length: n }, (_, i) => `https://cdn.example.test/file-${i}.pdf`),
        },
      } as never
    })
}

type Lister = (c: Credentials, env: string, p: QueryParams) => Promise<Array<{ id: string }>>
const LISTS: Array<[string, Lister]> = [
  ['listSigners', (c, e, p) => adapter.listSigners(c, e, p)],
  ['listDocuments', (c, e, p) => adapter.listDocuments(c, e, p)],
]

describe.each(LISTS)('LeegalityAdapter.%s pages the whole details list locally', (_n, list) => {
  it('with N = 2L+1 rows, pages 1..3 return every row once with an exact hasMore', async () => {
    const L = 2
    const N = 2 * L + 1
    mockDetails(N)
    const whole = await list(CREDS, 'doc-1', {})
    expect(whole).toHaveLength(N)

    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    const local: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, 'doc-1', params)
      expect(rows.length).toBeLessThanOrEqual(L)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      local.push(readUpstreamPage(params)?.pagedLocally)
    }
    expect(seen).toEqual(whole.map((r) => r.id))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
    expect(local).toEqual([true, true, true])
  })

  it('a page past the end is empty and reports no more', async () => {
    mockDetails(3)
    const params = withPageSink({ page: 5, limit: 2 })
    expect(await list(CREDS, 'doc-1', params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('LeegalityAdapter per-envelope lookups still see the whole list', () => {
  it('getSigner and getDocument find a row that sits beyond the first page', async () => {
    mockDetails(5)
    const signers = await adapter.listSigners(CREDS, 'doc-1', {})
    const docs = await adapter.listDocuments(CREDS, 'doc-1', {})
    // getSigner takes "<envelopeId>:<index>" and resolves index 4 over the whole list.
    expect((await adapter.getSigner(CREDS, 'doc-1:4')).id).toBe(signers[4]!.id)
    const d4 = docs[4]!.externalId!
    expect((await adapter.getDocument(CREDS, d4)).externalId).toBe(d4)
  })
})

describe('LeegalityAdapter declares the list endpoint ceiling', () => {
  it('maxPageSize is 40, the documented `max` maximum', () => {
    expect(adapter.capabilities.maxPageSize).toBe(40)
  })
})
