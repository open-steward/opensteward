import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { LibreSignClient } from '../../../../../../src/verticals/docsign/adapters/libresign/client'
import { LibresignAdapter } from '../../../../../../src/verticals/docsign/adapters/libresign'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'

/**
 * `GET /ocs/v2.php/apps/libresign/api/{apiVersion}/file/list` (operationId
 * `file-list`) takes `page` ("the number of page to return") and `length`
 * ("Total of elements to return"), with no documented maximum, and answers
 * `ocs.data` = `FileListResponse` { pagination, data[] }
 * (https://raw.githubusercontent.com/LibreSign/libresign/main/openapi.json).
 *
 * `Pagination` is { total, current, next, prev, last, first }. LibreSign's
 * lib/Helper/Pagination.php sets `next` to a URL only while there is a next
 * page (`$this->hasNextPage()`), and returns every link as null when
 * `$total <= $length`. The fake below reproduces exactly that.
 */

const CREDS = {
  accessToken: 'pw',
  extra: { serverUrl: 'https://nc.test', username: 'u' },
} as Credentials
const L = 2
const N = 2 * L + 1

/** The query parameters `file-list` documents. Anything else is a bug here. */
const DOCUMENTED = new Set([
  'page',
  'length',
  'signer_uuid',
  'fileIds[]',
  'nodeIds[]',
  'status[]',
  'start',
  'end',
  'sortBy',
  'sortDirection',
  'parentFileId',
  'details',
])

/** One `FileSummary`, every required field from the documented schema. */
function fileSummary(i: number) {
  return {
    id: 10 + i,
    nodeId: 200 + i,
    uuid: `uuid-${i}`,
    name: `contract-${i}.pdf`,
    status: 1,
    statusText: 'available for signature',
    nodeType: 'file',
    created_at: `2025-01-0${1 + (i % 9)}T00:00:00+00:00`,
    metadata: {},
    docmdpLevel: 0,
    signatureFlow: 'parallel',
    signersCount: 1,
    signers: [
      {
        signRequestId: 500 + i,
        displayName: `Signer ${i}`,
        email: `s${i}@example.com`,
        signed: null,
        status: 0,
        statusText: 'pending',
      },
    ],
    requested_by: { userId: 'admin', displayName: 'Admin' },
    filesCount: 1,
    canSign: false,
  }
}

const FILES = Array.from({ length: N }, (_, i) => fileSummary(i))

function mockFileList(files = FILES) {
  return vi
    .spyOn(LibreSignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/file/list') throw new Error(`unexpected path ${path}`)
      for (const k of Object.keys(params ?? {})) {
        if (!DOCUMENTED.has(k)) throw new Error(`undocumented file-list parameter ${k}`)
      }
      const page = Number(params?.['page'] ?? 1)
      const length = Number(params?.['length'] ?? 100)
      const total = files.length
      const data = files.slice((page - 1) * length, page * length)
      const link = 'https://nc.test/ocs/v2.php/apps/libresign/api/v1/file/list'
      const pagination =
        total > length
          ? {
              total,
              current: `${link}?page=${page}`,
              next: page * length < total ? `${link}?page=${page + 1}` : null,
              prev: page > 1 ? `${link}?page=${page - 1}` : null,
              last: page * length < total ? `${link}?page=${Math.ceil(total / length)}` : null,
              first: page > 1 ? `${link}?page=1` : null,
            }
          : { total, current: null, next: null, prev: null, last: null, first: null }
      return { pagination, data } as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new LibresignAdapter()

describe('LibresignAdapter.listEnvelopes (file-list)', () => {
  it('sends the caller page and exact limit, with no undocumented cap', async () => {
    const get = mockFileList()
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 3, limit: 500 }))
    expect(get).toHaveBeenCalledWith('/file/list', { page: 3, length: 500 })
  })

  it('sends page 1 and length 100 (the server default length_of_page) when no page or limit is given', async () => {
    const get = mockFileList()
    await adapter.listEnvelopes(CREDS, {})
    expect(get).toHaveBeenCalledWith('/file/list', { page: 1, length: 100 })
  })

  it('forwards the documented status[] filter', async () => {
    const get = mockFileList()
    await adapter.listEnvelopes(CREDS, { page: 1, limit: L, status: '3' })
    expect(get).toHaveBeenCalledWith('/file/list', { page: 1, length: L, 'status[]': [3] })
  })

  it('pages 1..3 return every id once, with hasMore from pagination.next', async () => {
    mockFileList()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(FILES.map((f) => f.uuid))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('reports no next page when the whole collection fits (every link null)', async () => {
    mockFileList()
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows).toHaveLength(N)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockFileList()
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter.listEnvelopes(CREDS, params), params, 'libresign')
    expect(env.data.map((r) => r.id)).toEqual(['uuid-2', 'uuid-3'])
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(N)
  })

  it('every row parses as a canonical Envelope', async () => {
    mockFileList()
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: 500 }))
    for (const r of rows) expect(() => EnvelopeSchema.parse(r)).not.toThrow()
    expect(rows[0]).toMatchObject({
      id: 'uuid-0',
      subject: 'contract-0.pdf',
      status: 'sent',
      signerIds: ['500'],
      senderId: 'admin',
    })
  })
})
