/**
 * SignNow listAuditTrailEntries / getAuditTrailEntry.
 *
 * `GET /document/{document_id}/historyfull` takes only the path parameter
 * ("Path parameters Name Type Description Required document_id string
 * required") and has no paging parameter. Its documented 200 body is either
 * `{ "document_history": [...], "email_history_events": [...] }` ("Example 1")
 * a bare array of history rows (the `signer_authentication_*` examples), or a
 * lone history row ("Example: without email history events"):
 * https://docs.signnow.com/docs/document/operations/get-document-historyfull
 *
 * The adapter used to read an undocumented `history` key, so every real
 * response produced []. An object that is none of these now throws.
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
import { SignNowClient } from '../../../../../../src/verticals/docsign/adapters/signnow/client'
import { SignNowAdapter } from '../../../../../../src/verticals/docsign/adapters/signnow'

const CREDS = { accessToken: 'sn_token' } as Credentials
const DOC = 'doc_1'
const adapter = new SignNowAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'http://x' })

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

function row(i: number) {
  return {
    client_app_name: 'Sample Application',
    client_timestamp: 1622029581 + i,
    created: 1622029581 + i,
    document_id: DOC,
    element_id: null,
    email: `s${i}@email.com`,
    event: 'document_invite_sent',
    field_id: null,
    ip_address: '1X.XX.XX.XX',
    json_attributes: null,
    origin: 'original',
    unique_id: `u_${i}`,
    user_id: `user_${i}`,
  }
}

/**
 * A fake historyfull endpoint holding `n` rows. It honours ONLY the documented
 * path id and refuses any query parameter.
 */
function mockHistory(n: number, shape: 'object' | 'array' = 'object') {
  return vi
    .spyOn(SignNowClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/document/${DOC}/historyfull`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('historyfull documents no query parameters')
      const rows = Array.from({ length: n }, (_, i) => row(i))
      return (
        shape === 'array'
          ? rows
          : {
              document_history: rows,
              email_history_events: [
                {
                  created: 1622029581,
                  event_type: 'document_created',
                  json_attributes: '{"some":"data"}',
                  message: 'Some message',
                  subject: 'Some subject',
                },
              ],
            }
      ) as never
    })
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `${DOC}:u_${i}`)

describe('SignNowAdapter.listAuditTrailEntries reads GET /document/{id}/historyfull', () => {
  it('reads the documented document_history key (Example 1 shape)', async () => {
    const get = mockHistory(3)
    const rows = await adapter.listAuditTrailEntries(CREDS, DOC, {})
    expect(rows.map((r) => r.id)).toEqual(ids(3))
    expect(rows[0]!.eventType).toBe('sent')
    expect(get.mock.calls).toEqual([[`/document/${DOC}/historyfull`]])
  })

  it('reads the documented bare-array response shape', async () => {
    mockHistory(3, 'array')
    const rows = await adapter.listAuditTrailEntries(CREDS, DOC, {})
    expect(rows.map((r) => r.id)).toEqual(ids(3))
  })

  it('reads the documented single-row body ("Example: without email history events")', async () => {
    // Verbatim from the docs page: a lone history row, no wrapper, no array.
    vi.spyOn(SignNowClient.prototype, 'get').mockResolvedValue({
      client_app_name: 'Sample Application',
      client_timestamp: 1622029581,
      created: 1622029581,
      document_id: 'ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      element_id: 'ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      email: 'johndoe@email.com',
      event: 'created_document',
      field_id: 'ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      ip_address: '1X.XX.XX.XX',
      json_attributes: '{"some":"data"}',
      origin: 'original',
      unique_id: 'ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      user_id: 'ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    } as never)
    const rows = await adapter.listAuditTrailEntries(CREDS, DOC, {})
    expect(rows.map((r) => r.id)).toEqual([`${DOC}:ddXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`])
    expect(rows[0]!.eventType).toBe('created')
    expect(rows[0]!.actorEmail).toBe('johndoe@email.com')
  })

  it('throws on an object with neither document_history nor a history row (e.g. the old `history` key)', async () => {
    vi.spyOn(SignNowClient.prototype, 'get').mockResolvedValue({ history: [row(0)] } as never)
    await expect(adapter.listAuditTrailEntries(CREDS, DOC, {})).rejects.toThrow(/document_history/)
  })

  it('throws on a body that is neither an object nor an array', async () => {
    vi.spyOn(SignNowClient.prototype, 'get').mockResolvedValue('<html>' as never)
    await expect(adapter.listAuditTrailEntries(CREDS, DOC, {})).rejects.toThrow(/neither/)
  })
})

describe('SignNowAdapter.listAuditTrailEntries pages locally', () => {
  const L = 2
  const N = 2 * L + 1

  it('with N = 2L+1 rows, pages 1..3 return every id once with an exact hasMore', async () => {
    const get = mockHistory(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listAuditTrailEntries(CREDS, DOC, params)
      expect(rows.length).toBeLessThanOrEqual(L)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids(N))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
    for (const c of get.mock.calls) expect(c).toEqual([`/document/${DOC}/historyfull`])
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockHistory(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter.listAuditTrailEntries(CREDS, DOC, params), params, 'signnow')
    expect(env.data.map((r) => r.id)).toEqual(ids(N).slice(2, 4))
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(N)
  })
})

describe('SignNowAdapter.getAuditTrailEntry reads back a listed id', () => {
  it('finds the row by its documented unique_id', async () => {
    mockHistory(3)
    const listed = await adapter.listAuditTrailEntries(CREDS, DOC, {})
    const got = await adapter.getAuditTrailEntry(CREDS, listed[2]!.id)
    expect(got.id).toBe(`${DOC}:u_2`)
    expect(got.actorEmail).toBe('s2@email.com')
  })

  it('404s an id whose unique_id is not in the history', async () => {
    mockHistory(3)
    await expect(adapter.getAuditTrailEntry(CREDS, `${DOC}:nope`)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('rejects a malformed id before sending anything', async () => {
    const get = mockHistory(3)
    await expect(adapter.getAuditTrailEntry(CREDS, 'no-separator')).rejects.toThrow(
      /<envelopeId>:<unique_id>/,
    )
    await expect(adapter.getAuditTrailEntry(CREDS, 'no-separator')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_ID',
    })
    expect(get).not.toHaveBeenCalled()
  })
})
