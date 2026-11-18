import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { PdffillerClient } from '../../../../../../src/verticals/docsign/adapters/pdffiller/client'
import { PdffillerAdapter } from '../../../../../../src/verticals/docsign/adapters/pdffiller'

/**
 * Signers come from `GET /signature_requests/{id}`, whose reply embeds the
 * request's whole `recipients[]` array (pdfFiller's own PHP client casts
 * `'recipients' => ['list_of', SignatureRequestRecipient::class]` on that
 * model: https://github.com/pdffiller/pdffiller-php-api-client/blob/master/src/SignatureRequest.php).
 * There is no upstream page to ask for, so the adapter must page the
 * collection itself, or page 2 repeats page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const ENV_ID = 'sr-1'
const L = 2
const N = 2 * L + 1
const IDS = Array.from({ length: N }, (_, i) => `${ENV_ID}:${100 + i}`)

function fakeRequest(n: number) {
  const recipients = Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    email: `r${i}@example.com`,
    name: `Recipient ${i}`,
    order: i + 1,
    status: 'SENT',
  }))
  return { signature_request_id: ENV_ID, recipients }
}

/** Honours only the documented path parameter; ignores every query param. */
function mockGetRequest(n: number) {
  return vi.spyOn(PdffillerClient.prototype, 'get').mockImplementation(async (path: string) => {
    if (path !== `/signature_requests/${ENV_ID}`) throw new Error(`unexpected path ${path}`)
    return fakeRequest(n) as never
  })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new PdffillerAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'http://x' })

describe('PdffillerAdapter.listSigners pages the embedded recipients locally', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const get = mockGetRequest(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, ENV_ID, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(IDS)
    expect(more).toEqual([true, true, false])
    // The endpoint takes no paging parameter; every page asks for the request.
    for (const call of get.mock.calls) expect(call).toEqual([`/signature_requests/${ENV_ID}`])
  })

  it('page 2 is not page 1', async () => {
    mockGetRequest(N)
    const p1 = await adapter.listSigners(CREDS, ENV_ID, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listSigners(CREDS, ENV_ID, withPageSink({ page: 2, limit: L }))
    expect(p2.map((r) => r.id)).toEqual(IDS.slice(L, 2 * L))
    expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
  })

  it('a limit above the collection size returns it all with hasMore false', async () => {
    mockGetRequest(N)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await adapter.listSigners(CREDS, ENV_ID, params)
    expect(rows.map((r) => r.id)).toEqual(IDS)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without a limit returns the whole collection (used by getSigner)', async () => {
    mockGetRequest(N)
    const rows = await adapter.listSigners(CREDS, ENV_ID, {})
    expect(rows.map((r) => r.id)).toEqual(IDS)
    const last = await adapter.getSigner(CREDS, IDS[N - 1]!)
    expect(last.id).toBe(IDS[N - 1])
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockGetRequest(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listSigners(CREDS, ENV_ID, params)
    const env = listPage(rows, params, 'pdffiller')
    expect(env.data.map((r) => r.id)).toEqual(IDS.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})
