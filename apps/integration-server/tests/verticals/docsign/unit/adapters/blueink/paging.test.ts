import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { BlueinkClient } from '../../../../../../src/verticals/docsign/adapters/blueink/client'
import { BlueinkAdapter } from '../../../../../../src/verticals/docsign/adapters/blueink'

/**
 * Signers and documents both come from `GET /bundles/{bundleSlug}/`, whose
 * only parameters are the slug and `include`: the Bundle carries its whole
 * `packets` and `documents` arrays
 * (https://developer.blueink.com/openapi.json). There is no upstream page to
 * ask for, so the adapter must page the collection itself, or page 2 repeats
 * page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const BUNDLE = 'bndl-1'
const L = 2
const N = 2 * L + 1

function fakeBundle(n: number) {
  const packets = Array.from({ length: n }, (_, i) => ({
    key: `pkt-${i}`,
    name: `Signer ${i}`,
    email: `s${i}@example.com`,
    order: i,
  }))
  const documents = Array.from({ length: n }, (_, i) => ({
    key: `doc-${i}`,
    file_url: `https://example.com/doc-${i}.pdf`,
  }))
  return { id: BUNDLE, status: 'se', packets, documents, tags: [] }
}

/** Honours only the documented path; any query parameter is a bug here. */
function mockGetBundle(n: number) {
  return vi
    .spyOn(BlueinkClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/bundles/${BUNDLE}/`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('retrieve-bundle takes no paging params')
      return fakeBundle(n) as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new BlueinkAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const METHODS: Array<[string, Lister, string[]]> = [
  [
    'listSigners',
    (c, id, p) => adapter.listSigners(c, id, p),
    Array.from({ length: N }, (_, i) => `pkt-${i}`),
  ],
  [
    'listDocuments',
    (c, id, p) => adapter.listDocuments(c, id, p),
    Array.from({ length: N }, (_, i) => `${BUNDLE}:${i}`),
  ],
]

describe.each(METHODS)('BlueinkAdapter.%s pages the whole bundle locally', (name, list, ids) => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const get = mockGetBundle(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, BUNDLE, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
    // The endpoint takes no paging parameter; every page asks for the bundle.
    for (const call of get.mock.calls) expect(call).toEqual([`/bundles/${BUNDLE}/`])
  })

  it('page 2 is not page 1', async () => {
    mockGetBundle(N)
    const p1 = await list(CREDS, BUNDLE, withPageSink({ page: 1, limit: L }))
    const p2 = await list(CREDS, BUNDLE, withPageSink({ page: 2, limit: L }))
    expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
  })

  it('a limit above the collection size serves everything once, with no next page', async () => {
    mockGetBundle(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    const rows = await list(CREDS, BUNDLE, params)
    expect(rows.map((r) => r.id)).toEqual(ids)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without a limit returns the whole collection (used by the get* lookups)', async () => {
    mockGetBundle(N)
    const rows = await list(CREDS, BUNDLE, {})
    expect(rows.map((r) => r.id)).toEqual(ids)
  })

  it('pages a bundle larger than any plausible cap: the last page ends it', async () => {
    // Guards against the collection being cut before pageLocally sees it.
    const BIG = 1001
    const bigIds =
      name === 'listSigners'
        ? Array.from({ length: BIG }, (_, i) => `pkt-${i}`)
        : Array.from({ length: BIG }, (_, i) => `${BUNDLE}:${i}`)
    mockGetBundle(BIG)
    const size = 250
    const last = Math.ceil(BIG / size)
    const params = withPageSink({ page: last, limit: size })
    const rows = await list(CREDS, BUNDLE, params)
    expect(rows.map((r) => r.id)).toEqual(bigIds.slice((last - 1) * size))
    expect(readUpstreamPage(params)?.totalCount).toBe(BIG)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(await list(CREDS, BUNDLE, {})).toHaveLength(BIG)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockGetBundle(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await list(CREDS, BUNDLE, params)
    const env = listPage(rows, params, 'blueink')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('BlueinkAdapter get* lookups still see the whole bundle', () => {
  it('getSigner finds the last packet and getDocument the last document', async () => {
    mockGetBundle(N)
    const s = await adapter.getSigner(CREDS, `${BUNDLE}:pkt-${N - 1}`)
    expect(s.externalId).toBe(`pkt-${N - 1}`)
    const d = await adapter.getDocument(CREDS, `${BUNDLE}:${N - 1}`)
    expect(d.id).toBe(`${BUNDLE}:${N - 1}`)
  })
})
