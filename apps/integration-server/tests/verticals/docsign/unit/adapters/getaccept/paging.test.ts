/**
 * Paging for GetAccept's per-document child lists.
 *
 * `GET /documents/{documentId}` ("Get document details by specifying a
 * document id.") takes only the path id plus `with_attachments`,
 * `with_pages` and `with_stats`, and returns the whole document, its
 * `recipients` array included
 * (https://raw.githubusercontent.com/getaccept/openapi/HEAD/openapi.json).
 * There is no paging parameter, so signers and the one document are paged
 * locally. They used to ignore `page`, so page 2 repeated page 1.
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
import { GetAcceptClient } from '../../../../../../src/verticals/docsign/adapters/getaccept/client'
import { GetAcceptAdapter } from '../../../../../../src/verticals/docsign/adapters/getaccept'

const CREDS = { accessToken: 'tok', refreshToken: 'rt' } as Credentials
const adapter = new GetAcceptAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
const ENV = 'doc-1'
const L = 2
const N = 2 * L + 1

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

/** Honours only the documented path id; ignores every query param. */
function mockDocument(recipients: number) {
  return vi.spyOn(GetAcceptClient.prototype, 'get').mockImplementation(async (path: string) => {
    if (path !== `/documents/${ENV}`) throw new Error(`unexpected path ${path}`)
    return {
      id: ENV,
      name: 'NDA',
      status: 'sent',
      recipients: Array.from({ length: recipients }, (_, i) => ({
        id: `r-${i}`,
        email: `r${i}@example.com`,
        first_name: `R${i}`,
        signing_order: i + 1,
      })),
    } as never
  })
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `${ENV}:r-${i}`)

describe('GetAcceptAdapter.listSigners pages GET /documents/{id} locally', () => {
  it('with N = 2L+1 recipients, pages 1..3 return every id once with an exact hasMore', async () => {
    mockDocument(N)
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
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries only the documented path id', async () => {
    const get = mockDocument(N)
    await adapter.listSigners(CREDS, ENV, withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls).toEqual([[`/documents/${ENV}`]])
  })

  it('page 2 is not page 1', async () => {
    mockDocument(N)
    const p1 = await adapter.listSigners(CREDS, ENV, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listSigners(CREDS, ENV, withPageSink({ page: 2, limit: L }))
    expect(p1.map((r) => r.id)).toEqual(ids(N).slice(0, 2))
    expect(p2.map((r) => r.id)).toEqual(ids(N).slice(2, 4))
  })

  it('a limit above the row count returns every recipient and ends', async () => {
    mockDocument(N)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await adapter.listSigners(CREDS, ENV, params)
    expect(rows.map((r) => r.id)).toEqual(ids(N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without a limit returns every recipient', async () => {
    mockDocument(N)
    expect(await adapter.listSigners(CREDS, ENV, {})).toHaveLength(N)
  })

  it('getSigner still finds a recipient past the first page', async () => {
    mockDocument(N)
    const s = await adapter.getSigner(CREDS, `${ENV}:r-4`)
    expect(s.externalId).toBe('r-4')
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockDocument(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listSigners(CREDS, ENV, params)
    const env = listPage(rows, params, 'getaccept')
    expect(env.data.map((r) => r.id)).toEqual(ids(N).slice(2, 4))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('GetAcceptAdapter.listDocuments pages its one document locally', () => {
  it('page 1 holds the one document and page 2 is empty', async () => {
    mockDocument(0)
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter.listDocuments(CREDS, ENV, p1)).map((d) => d.id)).toEqual([
      `${ENV}:${ENV}`,
    ])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listDocuments(CREDS, ENV, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('serves page 2 as empty on the API path through parseListQuery and listPage', async () => {
    mockDocument(0)
    const params = parseListQuery({ page: '2', limit: '1' })
    const rows = await adapter.listDocuments(CREDS, ENV, params)
    const env = listPage(rows, params, 'getaccept')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })
})
