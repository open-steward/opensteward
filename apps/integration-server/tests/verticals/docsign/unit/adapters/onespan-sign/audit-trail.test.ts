import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { OneSpanSignClient } from '../../../../../../src/verticals/docsign/adapters/onespan-sign/client'
import { OneSpanSignAdapter } from '../../../../../../src/verticals/docsign/adapters/onespan-sign'
import { AuditTrailEntrySchema } from '../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { AUDIT_RESPONSE_EXAMPLE } from './transform/fixtures'

/**
 * `GET /api/packages/{packageId}/audit` returns `{ "package-id", "audit-events": [...] }`
 * and documents no paging parameter
 * (https://docs.onespan.com/docs/retrieving-an-audit-trail), so the adapter
 * pages the whole trail itself. Its `date-time` carries no zone, so the
 * connection has to name one.
 */

const CREDS = { accessToken: 'tok', extra: { timeZone: 'UTC' } } as Credentials
const PKG = 'pkg-1'
const L = 2
const N = 2 * L + 1

const template = AUDIT_RESPONSE_EXAMPLE['audit-events'][1]!

/** n documented-shape events, each with a distinct second so rows are distinguishable. */
function fakeAudit(n: number) {
  return {
    'package-id': PKG,
    'audit-events': Array.from({ length: n }, (_, i) => ({
      ...template,
      'date-time': `2016-04-20 14:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
    })),
  }
}

/** Honours only the documented path; any query parameter is a bug here. */
function mockAudit(n: number) {
  return vi
    .spyOn(OneSpanSignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/packages/${PKG}/audit`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('GET /packages/{packageId}/audit takes no params')
      return fakeAudit(n) as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new OneSpanSignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })
const ids = (n: number) => Array.from({ length: n }, (_, i) => `${PKG}:${i}`)

describe('OneSpanSignAdapter.listAuditTrailEntries', () => {
  it('calls the documented GET /packages/{packageId}/audit and parses audit-events', async () => {
    const get = vi
      .spyOn(OneSpanSignClient.prototype, 'get')
      .mockResolvedValue(AUDIT_RESPONSE_EXAMPLE as never)
    const rows = await adapter.listAuditTrailEntries(CREDS, PKG, {})
    expect(get.mock.calls).toEqual([[`/packages/${PKG}/audit`]])
    expect(rows).toHaveLength(7)
    for (const r of rows) AuditTrailEntrySchema.parse(r)
    expect(rows.map((r) => r.description)).toEqual(
      AUDIT_RESPONSE_EXAMPLE['audit-events'].map((e) => e.type),
    )
    expect(rows[0]!.occurredAt).toBe('2016-04-20T14:14:51.000Z')
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const get = mockAudit(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listAuditTrailEntries(CREDS, PKG, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids(N))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
    for (const call of get.mock.calls) expect(call).toEqual([`/packages/${PKG}/audit`])
  })

  it('page 2 keeps absolute ids and is not page 1', async () => {
    mockAudit(N)
    const p2 = await adapter.listAuditTrailEntries(CREDS, PKG, withPageSink({ page: 2, limit: L }))
    expect(p2.map((r) => r.id)).toEqual(ids(N).slice(L, 2 * L))
    expect(p2.map((r) => r.occurredAt)).toEqual([
      '2016-04-20T14:00:02.000Z',
      '2016-04-20T14:00:03.000Z',
    ])
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockAudit(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listAuditTrailEntries(CREDS, PKG, params)
    const env = listPage(rows, params, 'onespan-sign')
    expect(env.data.map((r) => r.id)).toEqual(ids(N).slice(L, 2 * L))
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })

  it('a limit above the trail size serves everything once, with no next page', async () => {
    mockAudit(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    const rows = await adapter.listAuditTrailEntries(CREDS, PKG, params)
    expect(rows.map((r) => r.id)).toEqual(ids(N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('refuses before sending anything when the connection names no time zone', async () => {
    const get = mockAudit(N)
    const err = await adapter
      .listAuditTrailEntries({ accessToken: 'tok' } as Credentials, PKG, {})
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(String((err as Error).message)).toMatch(/time zone/)
    expect(get).not.toHaveBeenCalled()
  })

  it('refuses before sending anything when the configured time zone is not a real zone', async () => {
    const get = mockAudit(N)
    const err = await adapter
      .listAuditTrailEntries(
        { accessToken: 'tok', extra: { timeZone: 'Mars/Olympus' } } as Credentials,
        PKG,
        {},
      )
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 400, code: 'VALIDATION' })
    expect(get).not.toHaveBeenCalled()
  })

  it('throws when the response carries no audit-events array', async () => {
    vi.spyOn(OneSpanSignClient.prototype, 'get').mockResolvedValue({ 'package-id': PKG } as never)
    await expect(adapter.listAuditTrailEntries(CREDS, PKG, {})).rejects.toThrow(/audit-events/)
  })
})

describe('OneSpanSignAdapter.getAuditTrailEntry', () => {
  it('reads back the last id a list returned', async () => {
    mockAudit(N)
    const row = await adapter.getAuditTrailEntry(CREDS, `${PKG}:${N - 1}`)
    expect(row.id).toBe(`${PKG}:${N - 1}`)
    expect(row.occurredAt).toBe('2016-04-20T14:00:04.000Z')
  })
})
