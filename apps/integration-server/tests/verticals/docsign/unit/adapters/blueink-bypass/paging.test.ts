import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  MAX_PAGE_LIMIT,
} from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { SphereonClient } from '../../../../../../src/verticals/docsign/adapters/blueink-bypass/client'
import { BlueinkBypassAdapter } from '../../../../../../src/verticals/docsign/adapters/blueink-bypass'

/**
 * `GET /configs` ("List configurations") documents no query parameters and
 * answers with a bare JSON array of every configuration
 * (https://docs.vdx.sphereon.com/api/eidas/signatures). There is no upstream
 * page to ask for, so the adapter must page the collection itself, or page 2
 * repeats page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const L = 2
const N = 2 * L + 1

function fakeConfigs(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    configId: `cfg-${i}`,
    name: `Config ${i}`,
    config: { signatureLevel: 'ADVANCED', digestAlgorithm: 'SHA256' },
  }))
}

/** Honours only the documented path; takes no query parameter at all. */
function mockListConfigs(n: number) {
  return vi
    .spyOn(SphereonClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/configs') throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('GET /configs documents no query parameters')
      return fakeConfigs(n) as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new BlueinkBypassAdapter({ clientId: '', clientSecret: '', redirectUri: '' })
const ids = Array.from({ length: N }, (_, i) => `cfg-${i}`)

describe('BlueinkBypassAdapter.listTemplates pages the whole collection locally', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const get = mockListConfigs(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listTemplates(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
    // The endpoint takes no paging parameter; the page-2 request is the bare list call.
    for (const call of get.mock.calls) expect(call).toEqual(['/configs'])
  })

  it('page 2 is not page 1', async () => {
    mockListConfigs(N)
    const p1 = await adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listTemplates(CREDS, withPageSink({ page: 2, limit: L }))
    expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
  })

  it('without a limit returns the whole collection', async () => {
    mockListConfigs(N)
    const rows = await adapter.listTemplates(CREDS, {})
    expect(rows.map((r) => r.id)).toEqual(ids)
  })

  it('serves the router-clamped limit (5000 -> 500) from the whole collection', async () => {
    const total = MAX_PAGE_LIMIT + 3
    mockListConfigs(total)
    const params = parseListQuery({ page: '1', limit: String(MAX_PAGE_LIMIT * 10) })
    expect(params.limit).toBe(MAX_PAGE_LIMIT)
    const rows = await adapter.listTemplates(CREDS, params)
    expect(rows).toHaveLength(MAX_PAGE_LIMIT)
    expect(listPage(rows, params, 'blueink-bypass').meta.hasMore).toBe(true)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockListConfigs(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listTemplates(CREDS, params)
    const env = listPage(rows, params, 'blueink-bypass')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})
