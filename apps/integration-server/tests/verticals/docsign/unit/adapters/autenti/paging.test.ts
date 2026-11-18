/**
 * Paging for Autenti's list methods.
 *
 * `GET /document-processes` pages by `offset` and `limit` (Pagination article,
 * https://stoplight.io/api/v1/projects/cHJqOjQxMTI4/nodes/30f41d2b8b50d):
 * "`offset`| 0 | 0 | the number of documents to be skipped at the beginning of
 * the list", "The maximum page size is 128 documents. The request to return a
 * lager page size will not fail, but the page size will be reduced to
 * maximum." The default EVERYTHING filter caps offset at 256; DRAFT and
 * DOCUMENT_PROCESS do not, and together they are EVERYTHING. There is no
 * total and no next link.
 *
 * `/parties`, `/files` and `/actions` take only the path id. They are read
 * as a stream (`Accept: application/stream+json`), which "is unbounded", so
 * the whole list arrives and is paged locally.
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
import { AutentiClient } from '../../../../../../src/verticals/docsign/adapters/autenti/client'
import { AutentiAdapter } from '../../../../../../src/verticals/docsign/adapters/autenti'
import { documentProcessInProgress, eventExamples, filesResponse } from './fixtures'

const CREDS = { accessToken: 'tok', refreshToken: 'rt' } as Credentials
const adapter = new AutentiAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
const UPSTREAM_MAX = 128

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

function processRow(id: string, status: string) {
  return { ...documentProcessInProgress(), id, status }
}

/**
 * A fake `GET /document-processes` honouring ONLY the documented `status`
 * (default EVERYTHING), `offset` (default 0, rows skipped) and `limit`
 * (default 64, silently reduced to 128) parameters. EVERYTHING refuses an
 * offset past 256, the documented cap.
 */
function mockProcesses(drafts: number, sent: number) {
  const draftRows = Array.from({ length: drafts }, (_, i) =>
    processRow(`DOCUMENT_PROCESS:d${i}`, 'DRAFT'),
  )
  const sentRows = Array.from({ length: sent }, (_, i) =>
    processRow(`DOCUMENT_PROCESS:s${i}`, 'COMPLETED'),
  )
  return vi
    .spyOn(AutentiClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/document-processes') throw new Error(`unexpected path ${path}`)
      const status = (params?.['status'] as string | undefined) ?? 'EVERYTHING'
      const offset = Number(params?.['offset'] ?? 0)
      const limit = Math.min(Number(params?.['limit'] ?? 64), UPSTREAM_MAX)
      const rows =
        status === 'DRAFT'
          ? draftRows
          : status === 'DOCUMENT_PROCESS'
            ? sentRows
            : status === 'EVERYTHING'
              ? [...draftRows, ...sentRows]
              : []
      if (status === 'EVERYTHING' && offset > 256) throw new Error('offset over the EVERYTHING cap')
      return rows.slice(offset, offset + limit) as never
    })
}

const ids = (drafts: number, sent: number) => [
  ...Array.from({ length: drafts }, (_, i) => `DOCUMENT_PROCESS:d${i}`),
  ...Array.from({ length: sent }, (_, i) => `DOCUMENT_PROCESS:s${i}`),
]

describe('AutentiAdapter.listEnvelopes pages GET /document-processes by offset and limit', () => {
  const L = 2
  const N = 2 * L + 1

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    mockProcesses(1, N - 1)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(1, N - 1))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('sends only the documented status, offset and limit, walking DRAFT then DOCUMENT_PROCESS', async () => {
    const get = mockProcesses(3, 2)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 3, limit: L }))
    expect(get.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['/document-processes', { status: 'DRAFT', offset: 0, limit: L }],
      ['/document-processes', { status: 'DRAFT', offset: 2, limit: L }],
      ['/document-processes', { status: 'DOCUMENT_PROCESS', offset: 0, limit: L }],
      ['/document-processes', { status: 'DOCUMENT_PROCESS', offset: 2, limit: L }],
    ])
  })

  it('reaches rows past the EVERYTHING offset cap of 256', async () => {
    mockProcesses(200, 200)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 100 })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(ids(200, 200))
  })

  it('a caller limit over 128 is asked for at 128 and still served in full', async () => {
    const get = mockProcesses(0, 300)
    const params = withPageSink({ page: 1, limit: 300 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(0, 300))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    for (const c of get.mock.calls) expect(c[1]?.['limit']).toBe(UPSTREAM_MAX)
  })

  it('a total that is an exact multiple of the limit ends on the last full page', async () => {
    mockProcesses(2, 2)
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['DOCUMENT_PROCESS:s0', 'DOCUMENT_PROCESS:s1'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockProcesses(2, 3)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'autenti')
    expect(env.data.map((r) => r.id)).toEqual(['DOCUMENT_PROCESS:s0', 'DOCUMENT_PROCESS:s1'])
    expect(env.meta.hasMore).toBe(true)
  })

  it('asks for the documented default of 64 when the caller gives no limit', async () => {
    const get = mockProcesses(0, 70)
    const params = withPageSink({ page: 1 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows).toHaveLength(64)
    expect(get.mock.calls[0]![1]).toEqual({ status: 'DRAFT', offset: 0, limit: 64 })
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('never resumes one connection from positions another connection recorded', async () => {
    const get = mockProcesses(0, N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    get.mockClear()
    const other = { accessToken: 'tok2', refreshToken: 'rt2' } as Credentials
    await adapter.listEnvelopes(other, withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls[0]?.[1]).toEqual({ status: 'DRAFT', offset: 0, limit: L })
  })

  it('never resumes a walk at one upstream page size from positions another size recorded', async () => {
    const get = mockProcesses(0, 9)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: 2 }))
    get.mockClear()
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(ids(0, 9).slice(3, 6))
    expect(get.mock.calls[0]?.[1]).toEqual({ status: 'DRAFT', offset: 0, limit: 3 })
  })

  it('declares the documented page maximum of 128', () => {
    expect(adapter.capabilities.maxPageSize).toBe(UPSTREAM_MAX)
  })

  it('an upstream body that is not an array is an error, not an empty list', async () => {
    vi.spyOn(AutentiClient.prototype, 'get').mockResolvedValue({ documents: [] } as never)
    await expect(adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /did not return a JSON array/,
    )
  })
})

describe('AutentiAdapter.getEnvelope reads GET /document-processes/{id}', () => {
  it('sends the namespaced id literally', async () => {
    const get = vi
      .spyOn(AutentiClient.prototype, 'get')
      .mockResolvedValue(documentProcessInProgress() as never)
    const env = await adapter.getEnvelope(
      CREDS,
      'DOCUMENT_PROCESS:ac842283-afd4-4e26-9873-2bf35bd89b42',
    )
    expect(get.mock.calls[0]![0]).toBe(
      '/document-processes/DOCUMENT_PROCESS:ac842283-afd4-4e26-9873-2bf35bd89b42',
    )
    expect(get.mock.calls[0]![1]).toBeUndefined()
    expect(env.id).toBe('DOCUMENT_PROCESS:ac842283-afd4-4e26-9873-2bf35bd89b42')
  })
})

const ENV = 'DOCUMENT_PROCESS:ac842283-afd4-4e26-9873-2bf35bd89b42'

/**
 * A fake that streams one whole collection at exactly `path`. The paginated
 * `get` is refused: it would stop at 64 rows by default.
 */
function mockWhole(path: string, body: unknown[]) {
  vi.spyOn(AutentiClient.prototype, 'get').mockRejectedValue(
    new Error('sub-collections must be streamed, not read as one paginated page'),
  )
  return vi.spyOn(AutentiClient.prototype, 'getStream').mockImplementation(async (p: string) => {
    if (p !== path) throw new Error(`unexpected path ${p}`)
    return body as never
  })
}

async function walk<T extends { id: string }>(
  call: (params: ReturnType<typeof withPageSink>) => Promise<T[]>,
  L: number,
) {
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (let page = 1; page <= 3; page++) {
    const params = withPageSink({ page, limit: L })
    seen.push(...(await call(params)).map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

describe('AutentiAdapter.listSigners reads GET /document-processes/{id}/parties', () => {
  it('pages the non-sender parties locally: every id once, exact hasMore', async () => {
    // Five participants plus the SENDER: N = 2L + 1 with L = 2.
    const base = documentProcessInProgress().parties
    const parties = [
      ...[0, 1, 2, 3, 4].map((i) => ({
        ...base[2]!,
        party: { ...base[2]!.party, id: `PARTY-PUBLIC_SIGNING_PROCESS_ID:p${i}` },
      })),
      base[3]!,
    ]
    const get = mockWhole(`/document-processes/${ENV}/parties`, parties)
    const { seen, more } = await walk((p) => adapter.listSigners(CREDS, ENV, p), 2)
    expect(seen).toEqual([0, 1, 2, 3, 4].map((i) => `PARTY-PUBLIC_SIGNING_PROCESS_ID:p${i}`))
    expect(more).toEqual([true, true, false])
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('leaves the SENDER party out', async () => {
    mockWhole(`/document-processes/${ENV}/parties`, documentProcessInProgress().parties)
    const rows = await adapter.listSigners(CREDS, ENV, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.role)).toEqual(['approver', 'signer', 'signer'])
  })
})

describe('AutentiAdapter.listDocuments reads GET /document-processes/{id}/files', () => {
  it('pages the files locally: every id once, exact hasMore', async () => {
    const base = filesResponse()[0]!
    const files = [0, 1, 2, 3, 4].map((i) => ({ ...base, id: `FILE-SOURCE_FILE:f${i}` }))
    mockWhole(`/document-processes/${ENV}/files`, files)
    const { seen, more } = await walk((p) => adapter.listDocuments(CREDS, ENV, p), 2)
    expect(seen).toEqual([0, 1, 2, 3, 4].map((i) => `FILE-SOURCE_FILE:f${i}`))
    expect(more).toEqual([true, true, false])
  })

  it('keeps each file its position in the whole list', async () => {
    mockWhole(`/document-processes/${ENV}/files`, filesResponse())
    const rows = await adapter.listDocuments(CREDS, ENV, withPageSink({ page: 2, limit: 2 }))
    expect(rows.map((r) => r.order)).toEqual([2])
  })
})

describe('AutentiAdapter.listAuditTrailEntries reads GET /document-processes/{id}/actions', () => {
  it('pages the events locally: every id once, exact hasMore', async () => {
    const base = eventExamples()[0]!
    const events = [0, 1, 2, 3, 4].map((i) => ({ ...base, id: `EVENT-AUTENTI:e${i}` }))
    mockWhole(`/document-processes/${ENV}/actions`, events)
    const { seen, more } = await walk((p) => adapter.listAuditTrailEntries(CREDS, ENV, p), 2)
    expect(seen).toEqual([0, 1, 2, 3, 4].map((i) => `EVENT-AUTENTI:e${i}`))
    expect(more).toEqual([true, true, false])
  })

  it('serves more events than the paginated default of 64 in full', async () => {
    const base = eventExamples()[0]!
    const events = Array.from({ length: 150 }, (_, i) => ({ ...base, id: `EVENT-AUTENTI:e${i}` }))
    mockWhole(`/document-processes/${ENV}/actions`, events)
    const params = withPageSink({ page: 2, limit: 100 })
    const rows = await adapter.listAuditTrailEntries(CREDS, ENV, params)
    expect(rows.map((r) => r.id)).toEqual(events.slice(100).map((e) => e.id))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('propagates an upstream failure instead of returning an empty trail', async () => {
    vi.spyOn(AutentiClient.prototype, 'getStream').mockRejectedValue(
      Object.assign(new Error('Request failed with status code 401'), {
        response: { status: 401 },
      }),
    )
    await expect(
      adapter.listAuditTrailEntries(CREDS, ENV, withPageSink({ page: 1, limit: 2 })),
    ).rejects.toThrow(/401/)
  })
})
