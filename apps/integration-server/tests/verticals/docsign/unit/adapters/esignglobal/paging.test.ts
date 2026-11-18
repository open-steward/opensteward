/**
 * Paging for eSignGlobal's envelope child lists.
 *
 * `GET /esignglobal/v1/envelope/envelopeDetail` takes a single request
 * parameter, `envelopeId`, and returns the whole envelope — `signerInfos`,
 * `CCInfos`, `signFiles` and `attachments` included — with no paging
 * parameter at all (https://www.esign.ai/en-US/developer-center/api/pgwry228y585ip83zux1m7ky:
 * "Request Parameters | Parameter Name | Type | Required | Description |
 * envelopeId | string | true | Envelope ID"). The adapter ignored `page`, so
 * page 2 repeated page 1; signers and documents are now paged locally over
 * the whole envelope.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { EsignglobalClient } from '../../../../../../src/verticals/docsign/adapters/esignglobal/client'
import { EsignglobalAdapter } from '../../../../../../src/verticals/docsign/adapters/esignglobal'

const CREDS = { accessToken: 'tok' } as Credentials
const ENV = 'flow-1'
const L = 2
const N = 2 * L + 1
const adapter = new EsignglobalAdapter()

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

/**
 * A fake `GET /envelope/envelopeDetail`. It honours ONLY the documented
 * `envelopeId` parameter and always returns the whole envelope: 3 signers +
 * 2 CC recipients, and 3 sign files + 2 attachments (N = 5 each).
 */
function mockEnvelope() {
  return vi
    .spyOn(EsignglobalClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/envelope/envelopeDetail') throw new Error(`unexpected path ${path}`)
      if (params?.['envelopeId'] !== ENV) throw new Error('unknown envelope')
      return {
        envelopeId: ENV,
        envelopeStatus: 1,
        subject: 'S',
        signerInfos: [1, 2, 3].map((o) => ({
          userName: `S${o}`,
          userEmail: `s${o}@example.com`,
          signOrder: o,
        })),
        CCInfos: [1, 2].map((o) => ({ userName: `C${o}`, userEmail: `c${o}@example.com` })),
        signFiles: [1, 2, 3].map((o) => ({ fileKey: `sf-${o}` })),
        attachments: [1, 2].map((o) => ({ fileKey: `at-${o}` })),
      } as never
    })
}

type Lister = (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>
const CHILD: Array<[string, Lister]> = [
  ['listSigners', (c, p) => adapter.listSigners(c, ENV, p)],
  ['listDocuments', (c, p) => adapter.listDocuments(c, ENV, p)],
]

describe.each(CHILD)('EsignglobalAdapter.%s pages envelopeDetail locally', (_name, list) => {
  it('with N = 2L+1 rows, pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const get = mockEnvelope()
    const all = (await list(CREDS, {})).map((r) => r.id)
    expect(all).toHaveLength(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(all)
    expect(more).toEqual([true, true, false])
    // Only the documented key goes upstream: no page, no size.
    for (const c of get.mock.calls) expect(c[1]).toEqual({ envelopeId: ENV })
  })

  it('page 2 is not page 1', async () => {
    mockEnvelope()
    const all = (await list(CREDS, {})).map((r) => r.id)
    const p1 = await list(CREDS, withPageSink({ page: 1, limit: L }))
    const p2 = await list(CREDS, withPageSink({ page: 2, limit: L }))
    expect(p1.map((r) => r.id)).toEqual(all.slice(0, L))
    expect(p2.map((r) => r.id)).toEqual(all.slice(L, 2 * L))
  })

  it('a limit above the row count returns every row and ends', async () => {
    mockEnvelope()
    const params = withPageSink({ page: 1, limit: 500 })
    expect(await list(CREDS, params)).toHaveLength(N)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockEnvelope()
    const all = (await list(CREDS, {})).map((r) => r.id)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await list(CREDS, params)
    const env = listPage(rows, params, 'esignglobal')
    expect(env.data.map((r) => r.id)).toEqual(all.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })

  it('without a limit returns every row', async () => {
    mockEnvelope()
    expect(await list(CREDS, {})).toHaveLength(N)
  })
})

describe('EsignglobalAdapter get-by-id still sees the whole envelope', () => {
  it('getSigner finds a CC recipient that is past page 1', async () => {
    mockEnvelope()
    const all = await adapter.listSigners(CREDS, ENV, {})
    const last = all[all.length - 1]!
    expect((await adapter.getSigner(CREDS, last.externalId!)).id).toBe(last.id)
  })

  it('getDocument finds an attachment that is past page 1', async () => {
    mockEnvelope()
    const all = await adapter.listDocuments(CREDS, ENV, {})
    const last = all[all.length - 1]!
    expect((await adapter.getDocument(CREDS, last.externalId!)).id).toBe(last.id)
  })
})
