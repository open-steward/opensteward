import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { SignaturelyClient } from '../../../../../../src/verticals/docsign/adapters/signaturely/client'
import { SignaturelyAdapter } from '../../../../../../src/verticals/docsign/adapters/signaturely'
import { AuditTrailEntrySchema } from '../../../../../../src/verticals/docsign/schema/audit-trail-entry'

/**
 * https://docs.signaturely.com/ "Get document activity":
 *   GET https://api.signaturely.com/api/v1/documents/:id/activities
 * takes only the `id` path parameter and answers a bare array of
 * `{ id, type, sourceIP, signers, documentId, createdAt }`. There is no
 * upstream page to ask for, so the adapter pages the whole list itself.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const DOC = 'cb9d98ec-d1b9-4d7f-9c5a-78eb505a03fc'
const L = 2
const N = 2 * L + 1

// Shape copied from the documented example response.
const activities = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `act-${i}`,
    type: i === 0 ? 'create' : 'view',
    sourceIP: '::1',
    signers: i === 0 ? null : [{ name: 'Maksim Lebedev', email: 'maksim@domain.ltd' }],
    documentId: DOC,
    createdAt: `2022-03-30T11:40:${String(20 + i).padStart(2, '0')}.087Z`,
  }))

/** Honours only what the docs define: the path id, and no query parameters. */
function mockApi(n: number, body: unknown = activities(n)) {
  return vi
    .spyOn(SignaturelyClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/documents/${DOC}/activities`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('get-document-activity takes no query params')
      return body as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new SignaturelyAdapter()
const ids = Array.from({ length: N }, (_, i) => `${DOC}:${i}`)

describe('SignaturelyAdapter.listAuditTrailEntries', () => {
  it('requests the documented path with no query parameters', async () => {
    const get = mockApi(N)
    await adapter.listAuditTrailEntries(CREDS, DOC, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]).toEqual([`/documents/${DOC}/activities`])
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    mockApi(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listAuditTrailEntries(CREDS, DOC, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids)
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockApi(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listAuditTrailEntries(CREDS, DOC, params)
    const env = listPage(rows, params, 'signaturely')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })

  it('every row parses against the canonical schema', async () => {
    mockApi(N)
    const rows = await adapter.listAuditTrailEntries(CREDS, DOC, {})
    expect(rows).toHaveLength(N)
    for (const r of rows) AuditTrailEntrySchema.parse(r)
    expect(rows[0]!.externalId).toBe('act-0')
  })

  it('getAuditTrailEntry reads back the last id a list returned', async () => {
    mockApi(N)
    const last = await adapter.getAuditTrailEntry(CREDS, `${DOC}:${N - 1}`)
    expect(last.externalId).toBe(`act-${N - 1}`)
  })

  it('percent-encodes the document id in the activities path', async () => {
    const get = vi
      .spyOn(SignaturelyClient.prototype, 'get')
      .mockImplementation(async () => activities(1) as never)
    await adapter.listAuditTrailEntries(CREDS, 'a/b?c', {})
    expect(get.mock.calls[0]).toEqual(['/documents/a%2Fb%3Fc/activities'])
  })

  it('refuses a response that is not the documented bare array', async () => {
    mockApi(N, { data: activities(N) })
    await expect(
      adapter.listAuditTrailEntries(CREDS, DOC, withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/not the documented array/)
  })
})
