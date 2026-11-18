/**
 * Paging for Dropbox Sign's list methods.
 *
 * `GET /signature_request/list` and `GET /template/list` page by `page` and
 * `page_size`, and `page_size` "Must be between `1` and `100`. Default is
 * `20`."; `list_info.num_pages` is the "Total number of pages available."
 * (https://developers.hellosign.com/api/reference/operation/signatureRequestList/,
 * https://developers.hellosign.com/api/reference/operation/templateList/).
 * The adapter used to send the caller's limit as `page_size` unchecked, so a
 * sync at limit 500 asked for an out-of-range page.
 *
 * Signers and audit-trail entries come from one whole `GET
 * /signature_request/{id}`, so they are paged locally.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { withPageSink, readUpstreamPage, _resetRowPager } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { DropboxSignClient } from '../../../../../../src/verticals/docsign/adapters/dropbox-sign/client'
import { DropboxSignAdapter } from '../../../../../../src/verticals/docsign/adapters/dropbox-sign'

const CREDS = { accessToken: 'tok', refreshToken: 'rt' } as Credentials
const MAX = 100
const adapter = new DropboxSignAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

/**
 * A fake list endpoint holding `n` rows. It honours only the documented
 * `page` and `page_size` (1..100, default 20) and rejects an out-of-range
 * `page_size` the way the real API would.
 */
function mockList(path: string, field: string, idKey: string, n: number) {
  const all = Array.from({ length: n }, (_, i) => ({ [idKey]: `id-${i}`, created_at: 1735689600 }))
  const sent: Array<Record<string, unknown>> = []
  const spy = vi
    .spyOn(DropboxSignClient.prototype, 'get')
    .mockImplementation(async (p: string, params?: Record<string, unknown>) => {
      if (p !== path) throw new Error(`unexpected path ${p}`)
      sent.push({ ...params })
      const size = params?.['page_size'] === undefined ? 20 : Number(params['page_size'])
      if (!Number.isInteger(size) || size < 1 || size > MAX)
        throw new Error(`page_size ${size} out of range`)
      const page = Number(params?.['page'] ?? 1)
      return {
        [field]: all.slice((page - 1) * size, page * size),
        list_info: { page, page_size: size, num_results: n, num_pages: Math.ceil(n / size) },
      } as never
    })
  return { spy, sent }
}

type Lister = (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>
const LISTS: Array<[string, Lister, string, string, string]> = [
  [
    'listEnvelopes',
    (c, p) => adapter.listEnvelopes(c, p),
    '/signature_request/list',
    'signature_requests',
    'signature_request_id',
  ],
  [
    'listTemplates',
    (c, p) => adapter.listTemplates(c, p),
    '/template/list',
    'templates',
    'template_id',
  ],
]

describe.each(LISTS)('DropboxSignAdapter.%s', (_name, list, path, field, idKey) => {
  const ids = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, i) => `id-${from + i}`)

  it('at a caller limit of 100 or less, passes page and page_size through and reports hasMore', async () => {
    const { sent } = mockList(path, field, idKey, 45)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 20 })
      seen.push(...(await list(CREDS, params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(0, 45))
    expect(more).toEqual([true, true, false])
    expect(sent.map((s) => [s['page'], s['page_size']])).toEqual([
      [1, 20],
      [2, 20],
      [3, 20],
    ])
  })

  it('at the sync limit of 500, never sends page_size above 100 and fills every page', async () => {
    const { sent } = mockList(path, field, idKey, 1100)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await list(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(0, 1100))
    expect(more).toEqual([true, true, false])
    expect(sent.every((s) => s['page_size'] === MAX)).toBe(true)
  })

  it('at limit 500, a collection that ends exactly on a caller page reports no more', async () => {
    mockList(path, field, idKey, 500)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await list(CREDS, params)
    expect(rows).toHaveLength(500)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('DropboxSignAdapter per-envelope lists page locally', () => {
  function mockRequest(signers: number) {
    return vi.spyOn(DropboxSignClient.prototype, 'get').mockImplementation(
      async () =>
        ({
          signature_request: {
            signature_request_id: 'sr_1',
            created_at: 1735689600,
            is_complete: false,
            signatures: Array.from({ length: signers }, (_, i) => ({
              signature_id: `sig_${i}`,
              signer_email_address: `s${i}@example.com`,
              order: i,
              signed_at: 1735689700 + i,
            })),
          },
        }) as never,
    )
  }

  it('listSigners serves each signer once across pages', async () => {
    mockRequest(5)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 2 })
      seen.push(...(await adapter.listSigners(CREDS, 'sr_1', params)).map((s) => s.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(new Set(seen).size).toBe(5)
    expect(seen).toHaveLength(5)
    expect(more).toEqual([true, true, false])
  })

  it('listAuditTrailEntries serves each entry once across pages', async () => {
    mockRequest(3) // created + 3 signed = 4 entries
    const seen: string[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: 2 })
      seen.push(...(await adapter.listAuditTrailEntries(CREDS, 'sr_1', params)).map((e) => e.id))
    }
    expect(new Set(seen).size).toBe(4)
    expect(seen).toHaveLength(4)
  })
})
