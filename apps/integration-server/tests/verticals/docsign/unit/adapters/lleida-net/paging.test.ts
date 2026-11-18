import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { LleidaNetClient } from '../../../../../../src/verticals/docsign/adapters/lleida-net/client'
import { LleidaNetAdapter } from '../../../../../../src/verticals/docsign/adapters/lleida-net'

/**
 * `get_signature_list` takes a date window (`start_date`/`end_date`, at most
 * 31 days) and filters (signature_id, signatory_id, contract_id, email, phone,
 * config_id, signature_status, signature_type) but no page, limit or offset
 * field: it returns every signature in the window
 * (https://api.lleida.net/dtd/clickandsign/v1/en/). The adapter must page the
 * window itself, or page 2 repeats page 1.
 */

const CREDS = { accessToken: 'key', extra: { user: 'acct' } } as unknown as Credentials
const L = 2
const N = 2 * L + 1

const DOCUMENTED = new Set([
  'start_date',
  'end_date',
  'signature_id',
  'signatory_id',
  'contract_id',
  'email',
  'phone',
  'config_id',
  'signature_status',
  'signature_type',
])

function fakeSignatures(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    signature_id: String(1000 + i),
    signature_status: 'ready',
    signature_start_date: 1_700_000_000 + i,
    signature_status_date: 1_700_000_000 + i,
    signatories: [],
  }))
}

/** Honours only the documented GET_SIGNATURE_LIST request fields. */
function mockSignatureList(n: number) {
  return vi
    .spyOn(LleidaNetClient.prototype, 'call')
    .mockImplementation(async (action: string, body?: Record<string, unknown>) => {
      if (action !== 'get_signature_list') throw new Error(`unexpected action ${action}`)
      for (const key of Object.keys(body ?? {})) {
        if (!DOCUMENTED.has(key)) throw new Error(`undocumented field ${key}`)
      }
      return { code: 200, status: 'Success', signature: fakeSignatures(n) } as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new LleidaNetAdapter({ clientId: '', clientSecret: '', redirectUri: '' })
const ids = Array.from({ length: N }, (_, i) => String(1000 + i))

describe('LleidaNetAdapter.listEnvelopes pages the signature window locally', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const call = mockSignatureList(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
    expect(call).toHaveBeenCalledTimes(3)
  })

  it('page 2 asks for the same documented window and is not page 1', async () => {
    const call = mockSignatureList(N)
    const p1 = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(p2.map((r) => r.externalId)).toEqual(ids.slice(L, 2 * L))
    expect(p2.map((r) => r.externalId)).not.toEqual(p1.map((r) => r.externalId))
    const body = call.mock.calls[1]?.[1] ?? {}
    expect(Object.keys(body).sort()).toEqual(['end_date', 'start_date'])
  })

  it('a limit above the window size serves everything once, with no next page', async () => {
    mockSignatureList(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows.map((r) => r.externalId)).toEqual(ids)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without a limit returns the whole window', async () => {
    mockSignatureList(N)
    const rows = await adapter.listEnvelopes(CREDS, {})
    expect(rows.map((r) => r.externalId)).toEqual(ids)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockSignatureList(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'lleida-net')
    expect(env.data.map((r) => r.externalId)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})
