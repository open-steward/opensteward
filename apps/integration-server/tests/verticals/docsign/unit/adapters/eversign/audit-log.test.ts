import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { EversignClient } from '../../../../../../src/verticals/docsign/adapters/eversign/client'
import { EversignAdapter } from '../../../../../../src/verticals/docsign/adapters/eversign'
import { AuditTrailEntrySchema } from '../../../../../../src/verticals/docsign/schema/audit-trail-entry'

/**
 * The Audit Log is `GET /document/{document_hash}/audit_log`, documented at
 * https://eversign.com/api/documentation/methods ("A request to the following
 * URL should result with a list of events for a document:
 * https://api.eversign.com/document/{document_hash}/audit_log"). It takes no
 * parameter besides the auth pair and "will return the entire history of the
 * document's actions as an array of objects", so the adapter pages it locally.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const HASH = 'docHash1'
const PATH = `/document/${HASH}/audit_log`
const L = 2
const N = 2 * L + 1

function entry(i: number) {
  return {
    entry_id: 1000 + i,
    event_type: 'document_viewed',
    event_assoc_signer: '1',
    event_assoc_signer_name: 'John Doe',
    event_assoc_signer_email: 'john.doe@example.com',
    time_stamp: String(1642604310 + i),
    document_checksum: '1f1beb5b97c283ff1f7c3d9500aed8de',
    combined_checksum: '6730698649a3e4e300948bc57f7a94f4',
    client_ip: '127.0.0.1',
    signer_ip: '',
    merged_document_file_checksum: '',
  }
}
const idsOf = (n: number) => Array.from({ length: n }, (_, i) => `${HASH}:${1000 + i}`)

/** Honours only the documented call: the audit_log path, no extra parameters. */
function mockAuditLog(n: number) {
  return vi
    .spyOn(EversignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== PATH) throw new Error(`unexpected path ${path}`)
      if (params !== undefined && Object.keys(params).length > 0) {
        throw new Error(`Audit Log takes no parameters: ${JSON.stringify(params)}`)
      }
      return Array.from({ length: n }, (_, i) => entry(i)) as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new EversignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

describe('EversignAdapter.listAuditTrailEntries', () => {
  it('calls the documented audit_log path, not the non-existent /log', async () => {
    const get = mockAuditLog(1)
    const rows = await adapter.listAuditTrailEntries(CREDS, HASH, {})
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]?.[0]).toBe(PATH)
    expect(AuditTrailEntrySchema.parse(rows[0]).id).toBe(`${HASH}:1000`)
  })

  it('url-encodes the document hash into the path', async () => {
    const get = vi.spyOn(EversignClient.prototype, 'get').mockResolvedValue([] as never)
    await adapter.listAuditTrailEntries(CREDS, 'a/b c', {})
    expect(get.mock.calls[0]?.[0]).toBe('/document/a%2Fb%20c/audit_log')
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const get = mockAuditLog(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listAuditTrailEntries(CREDS, HASH, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(idsOf(N))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
    for (const call of get.mock.calls) expect(call[0]).toBe(PATH)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockAuditLog(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listAuditTrailEntries(CREDS, HASH, params)
    const env = listPage(rows, params, 'eversign')
    expect(env.data.map((r) => r.id)).toEqual(idsOf(N).slice(L, 2 * L))
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })

  it('throws the documented error envelope instead of returning an empty list', async () => {
    vi.spyOn(EversignClient.prototype, 'get').mockResolvedValue({
      success: false,
      error: { code: 103, type: 'invalid_api_function', info: 'This API Function does not exist.' },
    } as never)
    await expect(adapter.listAuditTrailEntries(CREDS, HASH, {})).rejects.toThrow(
      /This API Function does not exist/,
    )
  })

  it('getAuditTrailEntry reads back the id a list returned', async () => {
    mockAuditLog(N)
    const last = idsOf(N)[N - 1]!
    const got = await adapter.getAuditTrailEntry(CREDS, last)
    expect(got.id).toBe(last)
    await expect(adapter.getAuditTrailEntry(CREDS, `${HASH}:999999`)).rejects.toThrow(/not found/)
  })

  it('getAuditTrailEntry splits on the last colon, keeping a colon inside the hash', async () => {
    const get = vi
      .spyOn(EversignClient.prototype, 'get')
      .mockResolvedValue([{ ...entry(0), entry_id: 42 }] as never)
    const got = await adapter.getAuditTrailEntry(CREDS, 'a:b:42')
    expect(get.mock.calls[0]?.[0]).toBe('/document/a%3Ab/audit_log')
    expect(got.id).toBe('a:b:42')
    expect(got.envelopeId).toBe('a:b')
  })
})
