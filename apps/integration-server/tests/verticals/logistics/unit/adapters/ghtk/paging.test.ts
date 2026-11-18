/**
 * GHTK list paging. listWarehouses ignored the caller's page, so page 2
 * repeated page 1.
 *
 * GET /services/shipment/list_pick_add documents no paging parameter: only the
 * `Token` header, and the response is `{ success, message, data: [...] }`.
 * First-party docs: https://api.ghtk.vn/docs/submit-order/api-get-pick-addresses/
 * One response is therefore the whole collection, and the adapter pages it
 * locally.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'

const { getMock, ClientCtor } = vi.hoisted(() => {
  const getMock = vi.fn()
  const ClientCtor = vi.fn().mockImplementation(function GhtkClientMock() {
    return { get: getMock }
  })
  return { getMock, ClientCtor }
})

vi.mock('../../../../../../src/verticals/logistics/adapters/ghtk/client', () => ({
  GhtkClient: ClientCtor,
}))

import { GhtkAdapter } from '../../../../../../src/verticals/logistics/adapters/ghtk'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'

const CREDS = { accessToken: 'TEST_token' } as Credentials
const L = 5
const N = 2 * L + 1

/** A fake GHTK that honours only what the docs define: no query params at all. */
function fakeGhtk(total: number): string[] {
  const ids = Array.from({ length: total }, (_, i) => String(88000 + i))
  getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
    if (path !== 'shipment/list_pick_add') throw new Error(`404: ${path}`)
    const sent = Object.entries(params ?? {}).filter(([, v]) => v !== undefined)
    if (sent.length) throw new Error(`400: undocumented params ${sent.map(([k]) => k).join(',')}`)
    return {
      success: true,
      message: '',
      data: ids.map((id) => ({
        pick_address_id: id,
        address: `addr ${id}`,
        pick_tel: '0987654321',
        pick_name: `Store ${id}`,
      })),
    }
  })
  return ids
}

describe('GHTK listWarehouses paging (unpaginated endpoint, paged locally)', () => {
  beforeEach(() => {
    getMock.mockReset()
    ClientCtor.mockClear()
  })

  it('pages 1..3 of N = 2L+1 return every id once, in order, with exact hasMore', async () => {
    const expected = fakeGhtk(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await new GhtkAdapter().listWarehouses(CREDS, params)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request is the documented bare GET (no paging key exists)', async () => {
    fakeGhtk(N)
    await new GhtkAdapter().listWarehouses(CREDS, withPageSink({ page: 2, limit: L }))
    expect(getMock).toHaveBeenCalledTimes(1)
    const [path, params] = getMock.mock.calls[0] as [string, Record<string, unknown> | undefined]
    expect(path).toBe('shipment/list_pick_add')
    expect(params).toBeUndefined()
  })

  it('a limit above the collection size returns the whole collection with hasMore false', async () => {
    const expected = fakeGhtk(N)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await new GhtkAdapter().listWarehouses(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(expected)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const expected = fakeGhtk(N)
    const adapter = new GhtkAdapter()
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter.listWarehouses(CREDS, params), params, 'ghtk')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })
})
