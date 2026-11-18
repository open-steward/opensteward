/**
 * GetAccept audit trail reads `GET /documents/{documentId}/log`.
 *
 * The spec (https://raw.githubusercontent.com/getaccept/openapi/HEAD/openapi.json)
 * documents it as "Get a detailed log of events for a specific document."
 * with only the `documentId` path parameter and a 200 body of
 * `{ items: { $ref: LogEntry }, type: array }`. There is no paging
 * parameter, so the adapter pages the whole array locally. The old path,
 * `/documents/{documentId}/activities`, is not in the spec.
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
import { AuditTrailEntrySchema } from '../../../../../../src/verticals/docsign/schema/audit-trail-entry'

const CREDS = { accessToken: 'tok', refreshToken: 'rt' } as Credentials
const adapter = new GetAcceptAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
const ENV = 'doc-1'
const L = 2
const N = 2 * L + 1

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

/** Honours only the documented path; answers with a bare LogEntry array. */
function mockLog(n: number) {
  return vi
    .spyOn(GetAcceptClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/documents/${ENV}/log`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('GET /documents/{id}/log takes no query params')
      return Array.from({ length: n }, (_, i) => ({
        created_at: `2026-02-01T14:2${i}:00Z`,
        document_id: ENV,
        email: `r${i}@example.com`,
        event_name: `event ${i}`,
        first_name: `R${i}`,
        last_name: 'Doe',
        geo_ip: `203.0.113.${i}`,
      })) as never
    })
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `${ENV}:${i}`)

describe('GetAcceptAdapter.listAuditTrailEntries', () => {
  it('requests GET /documents/{documentId}/log with no query params', async () => {
    const get = mockLog(1)
    await adapter.listAuditTrailEntries(CREDS, ENV, withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls).toEqual([[`/documents/${ENV}/log`]])
  })

  it('never calls the undocumented /activities path', async () => {
    const get = mockLog(1)
    await adapter.listAuditTrailEntries(CREDS, ENV, {})
    expect(get.mock.calls.flat()).not.toContain(`/documents/${ENV}/activities`)
  })

  it('returns rows that parse as AuditTrailEntry', async () => {
    mockLog(N)
    const rows = await adapter.listAuditTrailEntries(CREDS, ENV, {})
    expect(rows).toHaveLength(N)
    for (const r of rows) AuditTrailEntrySchema.parse(r)
    expect(rows[4]!.actorIp).toBe('203.0.113.4')
  })

  it('with N = 2L+1 rows, pages 1..3 return every id once with an exact hasMore', async () => {
    mockLog(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listAuditTrailEntries(CREDS, ENV, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockLog(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listAuditTrailEntries(CREDS, ENV, params)
    const env = listPage(rows, params, 'getaccept')
    expect(env.data.map((r) => r.id)).toEqual(ids(N).slice(2, 4))
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(N)
  })

  it('rejects a non-array body instead of returning an empty, complete page', async () => {
    vi.spyOn(GetAcceptClient.prototype, 'get').mockResolvedValue({} as never)
    const params = withPageSink({ page: 1, limit: L })
    await expect(adapter.listAuditTrailEntries(CREDS, ENV, params)).rejects.toThrow(
      /did not return an array/,
    )
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('getAuditTrailEntry reads a row past the first page by its positional id', async () => {
    mockLog(N)
    const e = await adapter.getAuditTrailEntry(CREDS, `${ENV}:4`)
    expect(e.id).toBe(`${ENV}:4`)
    expect(e.actorEmail).toBe('r4@example.com')
  })
})
