/**
 * Paging for Secured Signing's child lists.
 *
 * `GET /Document/Status/{DocumentReference}` takes only the path reference
 * and an optional `DocumentLog` flag, and returns the whole Document with its
 * `Signers` list (first-party .NET SDK,
 * https://github.com/SecuredSigning/.NET-Client-SDK/blob/master/src/SecuredSigningClientSdk/Requests/DocumentRequest.cs:
 * `[Route("/Document/Status/{DocumentReference}", Verbs = "GET", ...)]
 * public class StatusRequest : IReturn<Document>` with members
 * `DocumentReference` and `DocumentLog` only). There is no page or size
 * parameter, so signers and the one document are paged locally.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { SecuredSigningClient } from '../../../../../../src/verticals/docsign/adapters/secured-signing/client'
import { SecuredSigningAdapter } from '../../../../../../src/verticals/docsign/adapters/secured-signing'

const CREDS = { accessToken: 'tok', refreshToken: 'rt' } as Credentials
const adapter = new SecuredSigningAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
const ENV = 'doc-ref-1'

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

/**
 * A fake `GET /Document/Status/{DocumentReference}` holding `signers`
 * signers. It honours ONLY the documented path reference and `DocumentLog`
 * flag; every other query key is ignored.
 */
function mockStatus(signers: number) {
  return vi
    .spyOn(SecuredSigningClient.prototype, 'get')
    .mockImplementation(async (path: string) => {
      if (path !== `/Document/Status/${ENV}`) throw new Error(`unexpected path ${path}`)
      return {
        Name: 'Contract.pdf',
        Reference: ENV,
        Status: 'InProgress',
        Signers: Array.from({ length: signers }, (_, i) => ({
          SignerReference: `s-${i}`,
          FirstName: `F${i}`,
          LastName: `L${i}`,
          Email: `s${i}@example.com`,
        })),
      } as never
    })
}

describe('SecuredSigningAdapter.listSigners pages GET /Document/Status locally', () => {
  const L = 2
  const N = 2 * L + 1
  const ids = Array.from({ length: N }, (_, i) => `${ENV}:s-${i}`)

  it('with N = 2L+1 signers, pages 1..3 return every id once with an exact hasMore', async () => {
    const get = mockStatus(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, ENV, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
    // Only documented keys go upstream: no page, no limit.
    for (const c of get.mock.calls) {
      expect(c[0]).toBe(`/Document/Status/${ENV}`)
      expect(Object.keys((c[1] ?? {}) as object)).toEqual(['DocumentLog'])
    }
  })

  it('page 2 is not page 1', async () => {
    mockStatus(N)
    const p1 = await adapter.listSigners(CREDS, ENV, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listSigners(CREDS, ENV, withPageSink({ page: 2, limit: L }))
    expect(p1.map((r) => r.id)).toEqual(ids.slice(0, 2))
    expect(p2.map((r) => r.id)).toEqual(ids.slice(2, 4))
  })

  it('a limit larger than the collection returns every signer and ends', async () => {
    mockStatus(N)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await adapter.listSigners(CREDS, ENV, params)
    expect(rows.map((r) => r.id)).toEqual(ids)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without a limit returns every signer', async () => {
    mockStatus(N)
    expect(await adapter.listSigners(CREDS, ENV, {})).toHaveLength(N)
  })

  it('getSigner still resolves a signer past the first page', async () => {
    mockStatus(N)
    const s = await adapter.getSigner(CREDS, `${ENV}:s-4`)
    expect(s.id).toBe(`${ENV}:s-4`)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockStatus(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listSigners(CREDS, ENV, params)
    const env = listPage(rows, params, 'secured-signing')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(2, 4))
    expect(env.meta.page).toBe(2)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('SecuredSigningAdapter.listDocuments pages its one document locally', () => {
  it('page 1 holds the one document and page 2 is empty, both ending', async () => {
    mockStatus(0)
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter.listDocuments(CREDS, ENV, p1)).map((d) => d.id)).toEqual([ENV])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    expect(readUpstreamPage(p1)?.pagedLocally).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listDocuments(CREDS, ENV, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path as empty', async () => {
    mockStatus(0)
    const params = parseListQuery({ page: '2', limit: '1' })
    const rows = await adapter.listDocuments(CREDS, ENV, params)
    const env = listPage(rows, params, 'secured-signing')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })
})
