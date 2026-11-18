import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { YotiSignClient } from '../../../../../../src/verticals/docsign/adapters/yoti-sign/client'
import { YotiSignAdapter } from '../../../../../../src/verticals/docsign/adapters/yoti-sign'

/**
 * Signers come from `GET /v2/envelopes/<envelopeId>`, which documents no
 * query parameters and returns the envelope with its whole
 * `details.recipients` array
 * (https://developers.yoti.com/eSignatures/get-envelope). There is no
 * upstream page to ask for, so the adapter must page the collection itself,
 * or page 2 repeats page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const ENV = 'env-1'
const L = 2
const N = 2 * L + 1

function fakeEnvelope(n: number) {
  const recipients = Array.from({ length: n }, (_, i) => ({
    id: `r-${i}`,
    name: `Signer ${i}`,
    email: `s${i}@example.com`,
    sign_status: 'UNSIGNED',
  }))
  return { envelope_id: ENV, status: 'ACTIVE', details: { recipients } }
}

/** Honours only the documented path; any query parameter is a bug here. */
function mockGetEnvelope(n: number) {
  return vi
    .spyOn(YotiSignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/envelopes/${ENV}`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('get-envelope takes no paging params')
      return fakeEnvelope(n) as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new YotiSignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })
const ids = (n: number) => Array.from({ length: n }, (_, i) => `${ENV}:r-${i}`)

describe('YotiSignAdapter.listSigners pages the envelope recipients locally', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const get = mockGetEnvelope(N)
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
    // The endpoint takes no paging parameter; every page asks for the envelope.
    for (const call of get.mock.calls) expect(call).toEqual([`/envelopes/${ENV}`])
  })

  it('page 2 is not page 1', async () => {
    mockGetEnvelope(N)
    const p1 = await adapter.listSigners(CREDS, ENV, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listSigners(CREDS, ENV, withPageSink({ page: 2, limit: L }))
    expect(p2.map((r) => r.id)).toEqual(ids(N).slice(L, 2 * L))
    expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
  })

  it('a limit above the collection size serves everything once, with no next page', async () => {
    mockGetEnvelope(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    const rows = await adapter.listSigners(CREDS, ENV, params)
    expect(rows.map((r) => r.id)).toEqual(ids(N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without a limit returns the whole collection (used by getSigner)', async () => {
    mockGetEnvelope(N)
    const rows = await adapter.listSigners(CREDS, ENV, {})
    expect(rows.map((r) => r.id)).toEqual(ids(N))
    const s = await adapter.getSigner(CREDS, `${ENV}:r-${N - 1}`)
    expect(s.externalId).toBe(`r-${N - 1}`)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockGetEnvelope(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listSigners(CREDS, ENV, params)
    const env = listPage(rows, params, 'yoti-sign')
    expect(env.data.map((r) => r.id)).toEqual(ids(N).slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})
