import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { SignableClient } from '../../../../../../src/verticals/docsign/adapters/signable/client'
import { SignableAdapter } from '../../../../../../src/verticals/docsign/adapters/signable'

/**
 * `GET /envelopes` and `GET /templates` page by `offset` ("The index of the
 * first envelope to retrieve") and `limit` ("If more than 50 is requested, 10
 * will be returned instead"), and reply with `total_envelopes` /
 * `total_templates` (https://developers.signable.app/openapi/envelopes/listenvelopes,
 * https://developers.signable.app/openapi/templates/listtemplates).
 *
 * Signers, documents and audit-trail entries are the `envelope_parties`,
 * `envelope_documents` and `envelope_history` arrays of `GET /envelopes/{fingerprint}`,
 * which takes no query parameter at all
 * (https://developers.signable.app/openapi/envelopes/getenvelope): the adapter
 * pages them itself.
 */

const CREDS = { accessToken: 'key' } as Credentials
const ENV = 'env-1'
const L = 2
const N = 2 * L + 1

function envelopeRow(i: number) {
  return {
    envelope_fingerprint: `e${i}`,
    envelope_title: `Envelope ${i}`,
    envelope_status: 'sent',
    envelope_created: '2025-07-07T11:30:27+0000',
    envelope_parties: [],
  }
}

function templateRow(i: number) {
  return { template_id: String(i), template_fingerprint: `t${i}`, template_title: `Template ${i}` }
}

function detail(n: number) {
  return {
    ...envelopeRow(0),
    envelope_fingerprint: ENV,
    envelope_parties: Array.from({ length: n }, (_, i) => ({
      party_id: `p${i}`,
      party_name: `Party ${i}`,
      party_email: `p${i}@example.com`,
    })),
    envelope_documents: Array.from({ length: n }, (_, i) => ({
      document_fingerprint: `d${i}`,
      document_title: `Doc ${i}`,
    })),
    envelope_history: Array.from({ length: n }, (_, i) => ({
      history_action: 'viewed',
      history_created: '2025-07-07T11:30:27+0000',
      history_label: `Event ${i}`,
    })),
  }
}

/**
 * A Signable that honours ONLY the documented `offset` and `limit` (anything
 * over 50 is served as 10, as the docs say). Any other key is ignored.
 */
function mockSignable(n: number) {
  return vi
    .spyOn(SignableClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      const offset = typeof params?.['offset'] === 'number' ? params['offset'] : 0
      const asked = typeof params?.['limit'] === 'number' ? params['limit'] : 10
      const limit = asked > 50 ? 10 : asked
      if (path === '/envelopes') {
        const all = Array.from({ length: n }, (_, i) => envelopeRow(i))
        return {
          http: 200,
          offset,
          limit,
          total_envelopes: String(n),
          envelopes: all.slice(offset, offset + limit),
        } as never
      }
      if (path === '/templates') {
        const all = Array.from({ length: n }, (_, i) => templateRow(i))
        return {
          http: 200,
          offset,
          limit,
          total_templates: String(n),
          templates: all.slice(offset, offset + limit),
        } as never
      }
      if (path === `/envelopes/${ENV}`) {
        if (params !== undefined) throw new Error('the detail call takes no query parameters')
        return detail(n) as never
      }
      throw new Error(`unexpected path ${path}`)
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new SignableAdapter()

type TopLister = (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>
const TOP: Array<[string, TopLister, string, (i: number) => string]> = [
  ['listEnvelopes', (c, p) => adapter.listEnvelopes(c, p), '/envelopes', (i) => `e${i}`],
  ['listTemplates', (c, p) => adapter.listTemplates(c, p), '/templates', (i) => `t${i}`],
]

describe.each(TOP)('SignableAdapter.%s pages by offset', (_name, list, path, idOf) => {
  const ids = Array.from({ length: N }, (_, i) => idOf(i))

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    mockSignable(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries offset = limit', async () => {
    const get = mockSignable(N)
    await list(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledWith(path, expect.objectContaining({ offset: L, limit: L }))
  })

  it('a limit above 50 is clamped to 50, not sent (Signable would serve 10)', async () => {
    const get = mockSignable(120)
    const params = withPageSink({ page: 2, limit: 200 })
    const rows = await list(CREDS, params)
    expect(get).toHaveBeenCalledWith(path, expect.objectContaining({ offset: 50, limit: 50 }))
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 50 }, (_, i) => idOf(50 + i)))
    expect(readUpstreamPage(params)?.pageSize).toBe(50)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('with no limit pages at the documented default of 50', async () => {
    const get = mockSignable(120)
    const params = withPageSink({ page: 2 })
    const rows = await list(CREDS, params)
    expect(get).toHaveBeenCalledWith(path, expect.objectContaining({ offset: 50, limit: 50 }))
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 50 }, (_, i) => idOf(50 + i)))
    expect(readUpstreamPage(params)?.pageSize).toBe(50)
  })

  it('a short page before the documented total does not end the collection', async () => {
    // Total 4, page 2 of size 2 (offset 2), but Signable serves one row: the
    // rows served (3) fall short of the total, so there is more to read.
    const key = path === '/envelopes' ? 'envelopes' : 'templates'
    vi.spyOn(SignableClient.prototype, 'get').mockResolvedValue({
      [`total_${key}`]: '4',
      [key]: [path === '/envelopes' ? envelopeRow(2) : templateRow(2)],
    } as never)
    const params = withPageSink({ page: 2, limit: L })
    await list(CREDS, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(readUpstreamPage(params)?.totalCount).toBe(4)
  })

  it.each([
    ['missing', undefined],
    ['non-numeric', 'many'],
    ['negative', '-1'],
  ])('a %s total reports no count and no hasMore, only the page size', async (_k, total) => {
    const key = path === '/envelopes' ? 'envelopes' : 'templates'
    vi.spyOn(SignableClient.prototype, 'get').mockResolvedValue({
      ...(total === undefined ? {} : { [`total_${key}`]: total }),
      [key]: [path === '/envelopes' ? envelopeRow(0) : templateRow(0)],
    } as never)
    const params = withPageSink({ page: 1, limit: L })
    await list(CREDS, params)
    expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
    expect(readUpstreamPage(params)?.pageSize).toBe(L)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockSignable(N)
    const params = parseListQuery({ page: '2', limit: String(L) }, adapter)
    const rows = await list(CREDS, params)
    const env = listPage(rows, params, 'signable')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.hasMore).toBe(true)
  })
})

type ChildLister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const CHILD: Array<[string, ChildLister, (i: number) => string]> = [
  ['listSigners', (c, id, p) => adapter.listSigners(c, id, p), (i) => `${ENV}:p${i}`],
  ['listDocuments', (c, id, p) => adapter.listDocuments(c, id, p), (i) => `${ENV}:d${i}`],
  [
    'listAuditTrailEntries',
    (c, id, p) => adapter.listAuditTrailEntries(c, id, p),
    (i) => `${ENV}:${i}`,
  ],
]

describe.each(CHILD)('SignableAdapter.%s pages the envelope detail locally', (_n, list, idOf) => {
  const ids = Array.from({ length: N }, (_, i) => idOf(i))

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    mockSignable(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, ENV, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('without a limit returns the whole collection (used by the get* lookups)', async () => {
    mockSignable(N)
    const rows = await list(CREDS, ENV, {})
    expect(rows.map((r) => r.id)).toEqual(ids)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockSignable(N)
    const params = parseListQuery({ page: '2', limit: String(L) }, adapter)
    const rows = await list(CREDS, ENV, params)
    const env = listPage(rows, params, 'signable')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('SignableAdapter get* lookups still see every row', () => {
  it('resolve the last signer, document and audit entry', async () => {
    mockSignable(N)
    expect((await adapter.getSigner(CREDS, `${ENV}:p${N - 1}`)).id).toBe(`${ENV}:p${N - 1}`)
    expect((await adapter.getDocument(CREDS, `${ENV}:d${N - 1}`)).id).toBe(`${ENV}:d${N - 1}`)
    expect((await adapter.getAuditTrailEntry(CREDS, `${ENV}:${N - 1}`)).id).toBe(`${ENV}:${N - 1}`)
  })
})

describe('SignableAdapter declares its page maximum', () => {
  it('is 50, the documented limit ceiling', () => {
    expect(adapter.capabilities.maxPageSize).toBe(50)
    expect(parseListQuery({ limit: '200' }, adapter).limit).toBe(50)
  })
})
