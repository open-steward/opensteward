/**
 * SignatureAPI audit trail = `GET /envelopes/{envelopeId}/events`
 * (operationId ListEnvelopeEvents, https://spec.signatureapi.com/openapi.yaml):
 *   "Returns a list of events for a specific envelope. Events are sorted by
 *    timestamp, with the most recent appearing first."
 *   "The response is paginated. Use the `links.next` and `links.previous` URLs
 *    to navigate between pages."
 * Parameters: `type` and `limit` ("minimum: 1, maximum: 20, default: 20").
 * `links.next`: "Returns `null` when you are on the last page."
 *
 * The spec documents no `GET /events/{eventId}`, so a single entry cannot be
 * read back by id.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { Credentials, PageMaxBearing } from '@opensteward/shared'
import { SignatureapiClient } from '../../../../../../src/verticals/docsign/adapters/signatureapi/client'
import { SignatureapiAdapter } from '../../../../../../src/verticals/docsign/adapters/signatureapi'
import { AuditTrailEntrySchema } from '../../../../../../src/verticals/docsign/schema/audit-trail-entry'

const CREDS = { accessToken: 'key_test_abc' } as Credentials
const OTHER = { accessToken: 'key_test_other' } as Credentials
const L = 2
const N = 2 * L + 1
const MAX = 20
const CALL_BUDGET = 50
const BASE = 'https://api.signatureapi.com/v1'
const ENV = 'env_1'

afterEach(() => vi.restoreAllMocks())
beforeEach(() => _resetCursorPager())

const adapter = new SignatureapiAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

/**
 * A fake ListEnvelopeEvents honouring ONLY the documented `limit` (1..20,
 * default 20) on the first request and the opaque `links.next` URL after.
 */
function fakeEvents(total: number, envelopeId = ENV) {
  const all = Array.from({ length: total }, (_, i) => ({
    id: `evt_${String(total - i).padStart(3, '0')}`,
    type: 'recipient.viewed',
    timestamp: `2025-07-15T14:${String(59 - i).padStart(2, '0')}:00Z`,
    data: {
      envelope_id: envelopeId,
      object_type: 'recipient',
      object_id: `re_${i}`,
      envelope_metadata: {},
      recipient_type: 'signer',
      recipient_key: 'tenant',
    },
  }))
  let calls = 0
  const page = (start: number, limit: number) => {
    const rows = all.slice(start, start + limit)
    const end = start + rows.length
    return {
      links: {
        next:
          end < all.length
            ? `${BASE}/envelopes/${envelopeId}/events?cursor=seq_${end}&limit=${limit}`
            : null,
        previous: null,
      },
      data: rows,
    }
  }
  const get = vi
    .spyOn(SignatureapiClient.prototype, 'get')
    .mockImplementation(async (p: string, params?: Record<string, unknown>) => {
      if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
      if (p !== `/envelopes/${envelopeId}/events`) throw new Error(`unexpected path ${p}`)
      for (const k of Object.keys(params ?? {})) {
        if (k !== 'limit' && k !== 'type') throw new Error(`${k} is not a documented query key`)
      }
      const limit = Number(params?.['limit'] ?? MAX)
      if (limit < 1 || limit > MAX) throw new Error(`limit ${limit} outside the documented 1..20`)
      return page(0, limit) as never
    })
  const abs = vi
    .spyOn(SignatureapiClient.prototype, 'getAbsolute')
    .mockImplementation(async (url: string) => {
      if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
      const u = new URL(url)
      if (u.pathname !== `/v1/envelopes/${envelopeId}/events`)
        throw new Error(`unexpected url ${url}`)
      const start = Number(String(u.searchParams.get('cursor')).replace('seq_', ''))
      const limit = Number(u.searchParams.get('limit') ?? MAX)
      return page(start, limit) as never
    })
  return { get, abs, ids: all.map((r) => r.id) }
}

describe('SignatureapiAdapter.listAuditTrailEntries reads ListEnvelopeEvents', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const { ids } = fakeEvents(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listAuditTrailEntries(CREDS, ENV, params)
      for (const r of rows) AuditTrailEntrySchema.parse(r)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('asks for the envelope-scoped path with only the documented limit, then follows links.next', async () => {
    const { get, abs } = fakeEvents(N)
    await adapter.listAuditTrailEntries(CREDS, ENV, withPageSink({ page: 1, limit: L }))
    await adapter.listAuditTrailEntries(CREDS, ENV, withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls).toEqual([[`/envelopes/${ENV}/events`, { limit: L }]])
    expect(abs.mock.calls.map((c) => c[0])).toEqual([
      `${BASE}/envelopes/${ENV}/events?cursor=seq_${L}&limit=${L}`,
    ])
  })

  it('never reads the account-wide /events feed', async () => {
    const { get } = fakeEvents(N)
    await adapter.listAuditTrailEntries(CREDS, ENV, withPageSink({ page: 1, limit: L }))
    expect(get.mock.calls.every((c) => c[0] !== '/events')).toBe(true)
  })

  it('stamps each entry with the envelope it was listed under', async () => {
    fakeEvents(N)
    const rows = await adapter.listAuditTrailEntries(
      CREDS,
      ENV,
      withPageSink({ page: 1, limit: L }),
    )
    expect(rows.map((r) => r.envelopeId)).toEqual([ENV, ENV])
  })

  it('a limit above the documented maximum (20) is clamped; with none, asks for 20', async () => {
    const { get } = fakeEvents(50)
    const big = withPageSink({ page: 1, limit: 500 })
    expect(await adapter.listAuditTrailEntries(CREDS, ENV, big)).toHaveLength(MAX)
    expect(readUpstreamPage(big)).toMatchObject({ hasMore: true, pageSize: MAX })
    _resetCursorPager()
    await adapter.listAuditTrailEntries(CREDS, ENV, withPageSink({ page: 1 }))
    expect(get.mock.calls.map((c) => c[1])).toEqual([{ limit: MAX }, { limit: MAX }])
  })

  it('a limit below the documented minimum (1) is raised to 1', async () => {
    const { get } = fakeEvents(N)
    await adapter.listAuditTrailEntries(CREDS, ENV, withPageSink({ page: 1, limit: 0 }))
    expect(get.mock.calls[0]![1]).toEqual({ limit: 1 })
  })

  it('a cursor walked for one envelope is not reused for another', async () => {
    fakeEvents(N, ENV)
    await adapter.listAuditTrailEntries(CREDS, ENV, withPageSink({ page: 1, limit: L }))
    vi.restoreAllMocks()
    const other = fakeEvents(N, 'env_2')
    const rows = await adapter.listAuditTrailEntries(
      CREDS,
      'env_2',
      withPageSink({ page: 2, limit: L }),
    )
    expect(rows.map((r) => r.id)).toEqual(other.ids.slice(L, 2 * L))
    expect(other.get).toHaveBeenCalledTimes(1)
  })

  it('reports the caller limit as the page size when it is below the maximum', async () => {
    fakeEvents(N)
    const params = withPageSink({ page: 1, limit: L })
    await adapter.listAuditTrailEntries(CREDS, ENV, params)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: L })
  })

  it('a cursor walked at one limit is not reused at another (links.next bakes the limit in)', async () => {
    const { ids, get } = fakeEvents(20)
    await adapter.listAuditTrailEntries(CREDS, ENV, withPageSink({ page: 1, limit: 3 }))
    const rows = await adapter.listAuditTrailEntries(
      CREDS,
      ENV,
      withPageSink({ page: 2, limit: 5 }),
    )
    expect(rows.map((r) => r.id)).toEqual(ids.slice(5, 10))
    expect(get.mock.calls.map((c) => c[1])).toEqual([{ limit: 3 }, { limit: 5 }])
  })

  it('another connection does not reuse a cursor walked under the first', async () => {
    const { get, abs } = fakeEvents(N)
    await adapter.listAuditTrailEntries(CREDS, ENV, withPageSink({ page: 1, limit: L }))
    await adapter.listAuditTrailEntries(OTHER, ENV, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(2)
    expect(abs).toHaveBeenCalledTimes(1)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    const { ids } = fakeEvents(N)
    const params = withPageSink(
      parseListQuery({ page: '2', limit: String(L) }, adapter as PageMaxBearing),
    )
    const rows = await adapter.listAuditTrailEntries(CREDS, ENV, params)
    const env = listPage(rows, params, 'signatureapi')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('SignatureapiAdapter.getAuditTrailEntry', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const get = vi.spyOn(SignatureapiClient.prototype, 'get')
    const abs = vi.spyOn(SignatureapiClient.prototype, 'getAbsolute')
    await expect(adapter.getAuditTrailEntry(CREDS, 'evt_1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
    expect(abs).not.toHaveBeenCalled()
  })
})
