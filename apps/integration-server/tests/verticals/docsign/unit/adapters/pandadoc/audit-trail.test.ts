import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { PandaDocClient } from '../../../../../../src/verticals/docsign/adapters/pandadoc/client'
import { PandaDocAdapter } from '../../../../../../src/verticals/docsign/adapters/pandadoc'
import { AuditTrailEntrySchema } from '../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { AUDIT_TRAIL_EXAMPLE } from './fixtures'

/**
 * `GET /public/v2/documents/{document_id}/audit-trail`, paged by `limit`
 * (minimum 1, maximum 100, default 20) and `offset` (minimum 0), answering
 * `{ count, results }` where `count` is the "Total number of audit trail
 * entries available."
 * https://developers.pandadoc.com/reference/list-document-audit-trail
 */

const CREDS = { accessToken: 'tok' } as Credentials
const DOC = 'BhVzRcxH9Z2LgfPPGXFUBa'
const URL = `https://api.pandadoc.com/public/v2/documents/${DOC}/audit-trail`
const L = 2
const N = 2 * L + 1

const template = AUDIT_TRAIL_EXAMPLE.results[0]!

function entries(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    ...template,
    id: `entry-${i}`,
    date_created: new Date(Date.UTC(2025, 4, 22, 9, 0, i)).toISOString(),
  }))
}

/** Honours only the documented path and `limit`/`offset`; anything else is a bug. */
function mockAuditTrail(n: number) {
  const all = entries(n)
  return vi
    .spyOn(PandaDocClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== URL) throw new Error(`unexpected path ${path}`)
      const keys = Object.keys(params ?? {}).sort()
      if (keys.join(',') !== 'limit,offset') throw new Error(`undocumented params ${keys}`)
      const limit = params!['limit'] as number
      const offset = params!['offset'] as number
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error(`limit ${limit}`)
      if (!Number.isInteger(offset) || offset < 0) throw new Error(`offset ${offset}`)
      return { count: n, results: all.slice(offset, offset + limit) } as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new PandaDocAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

describe('PandaDocAdapter.listAuditTrailEntries', () => {
  const ids = Array.from({ length: N }, (_, i) => `${DOC}:entry-${i}`)

  it('calls the documented v2 audit-trail path with the caller limit and offset', async () => {
    const get = mockAuditTrail(N)
    await adapter.listAuditTrailEntries(CREDS, DOC, withPageSink({ page: 3, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]).toEqual([URL, { limit: L, offset: 2 * L }])
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    mockAuditTrail(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listAuditTrailEntries(CREDS, DOC, params)
      for (const r of rows) AuditTrailEntrySchema.parse(r)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('ends on the documented count when the total is an exact multiple of the limit', async () => {
    mockAuditTrail(2 * L)
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter.listAuditTrailEntries(CREDS, DOC, params)
    expect(rows).toHaveLength(L)
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 2 * L, hasMore: false })
  })

  it('clamps a limit above the documented maximum of 100 and strides by it', async () => {
    const get = mockAuditTrail(250)
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await adapter.listAuditTrailEntries(CREDS, DOC, params)
    expect(get.mock.calls[0]).toEqual([URL, { limit: 100, offset: 100 }])
    expect(rows.map((r) => r.externalId)).toEqual(
      Array.from({ length: 100 }, (_, i) => `entry-${100 + i}`),
    )
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 100, hasMore: true })
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockAuditTrail(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listAuditTrailEntries(CREDS, DOC, params)
    const env = listPage(rows, params, 'pandadoc')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })

  it('parses the documented example response', async () => {
    vi.spyOn(PandaDocClient.prototype, 'get').mockResolvedValue(AUDIT_TRAIL_EXAMPLE as never)
    const params = withPageSink({ page: 1, limit: 20 })
    const rows = await adapter.listAuditTrailEntries(CREDS, DOC, params)
    expect(rows.map((r) => r.eventType)).toEqual(['created', 'sent', 'viewed'])
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 3, hasMore: false })
  })
})

describe('PandaDocAdapter.getAuditTrailEntry', () => {
  it('reads back an id the list returned, walking the trail by the documented maximum', async () => {
    const get = mockAuditTrail(150)
    const [listed] = await adapter.listAuditTrailEntries(
      CREDS,
      DOC,
      withPageSink({ page: 131, limit: 1 }),
    )
    get.mockClear()
    const out = await adapter.getAuditTrailEntry(CREDS, listed!.id)
    expect(out.id).toBe(`${DOC}:entry-130`)
    expect(get.mock.calls).toEqual([
      [URL, { limit: 100, offset: 0 }],
      [URL, { limit: 100, offset: 100 }],
    ])
  })

  it('stops at the end of the trail when the id is absent', async () => {
    const get = mockAuditTrail(N)
    await expect(adapter.getAuditTrailEntry(CREDS, `${DOC}:nope`)).rejects.toThrow(/not found/)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('rejects an absent id with a 404 status', async () => {
    mockAuditTrail(N)
    await expect(adapter.getAuditTrailEntry(CREDS, `${DOC}:nope`)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('stops on a short page when the response carries no count', async () => {
    const get = vi
      .spyOn(PandaDocClient.prototype, 'get')
      .mockImplementation(async (_path: string, params?: Record<string, unknown>) => {
        const offset = params!['offset'] as number
        return { results: entries(50).slice(offset, offset + 100) } as never
      })
    await expect(adapter.getAuditTrailEntry(CREDS, `${DOC}:nope`)).rejects.toThrow(/not found/)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('stops on the documented count when a full page reaches it', async () => {
    const get = mockAuditTrail(100)
    await expect(adapter.getAuditTrailEntry(CREDS, `${DOC}:nope`)).rejects.toThrow(/not found/)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('stops when an upstream without count ignores offset and repeats a full page', async () => {
    let calls = 0
    const get = vi.spyOn(PandaDocClient.prototype, 'get').mockImplementation(async () => {
      if (++calls > 5) throw new Error('walked past a repeated page')
      return { results: entries(100) } as never
    })
    await expect(adapter.getAuditTrailEntry(CREDS, `${DOC}:nope`)).rejects.toThrow(/not found/)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('percent-encodes the document id into the path', async () => {
    const get = vi
      .spyOn(PandaDocClient.prototype, 'get')
      .mockResolvedValue({ count: 1, results: entries(1) } as never)
    await adapter.getAuditTrailEntry(CREDS, 'doc/1?x:entry-0')
    expect(get.mock.calls[0]![0]).toBe(
      'https://api.pandadoc.com/public/v2/documents/doc%2F1%3Fx/audit-trail',
    )
  })

  it('refuses an id without an envelope before sending anything', async () => {
    const get = mockAuditTrail(N)
    await expect(adapter.getAuditTrailEntry(CREDS, 'entry-1')).rejects.toThrow(/expects shape/)
    expect(get).not.toHaveBeenCalled()
  })
})
