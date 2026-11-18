import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { LleidaNetClient } from '../../../../../../src/verticals/docsign/adapters/lleida-net/client'
import { LleidaNetAdapter } from '../../../../../../src/verticals/docsign/adapters/lleida-net'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'

/**
 * GET_FILE_LIST (https://api.lleida.net/dtd/clickandsign/v1/en/) takes
 * signature_id, and optionally signatory_id, file_group and file_id, plus the
 * common request/request_id/user fields the client adds. It has no page,
 * limit or offset field. The response nests the rows under
 * `file_list.files[]`, each with signatory_id, filename, file_group, file_id
 * and status.
 */

const CREDS = { accessToken: 'key', extra: { user: 'acct' } } as unknown as Credentials
const SIG = '1111000000'
const L = 2
const N = 2 * L + 1

const DOCUMENTED = new Set(['signature_id', 'signatory_id', 'file_group', 'file_id'])

function fakeFiles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    signatory_id: '1111000002',
    filename: `Test-${i}.pdf`,
    file_group: 'llistat',
    file_id: 100 + i,
    status: 'available',
  }))
}

/** Honours only the documented GET_FILE_LIST request fields. */
function mockFileList(n: number) {
  return vi
    .spyOn(LleidaNetClient.prototype, 'call')
    .mockImplementation(async (action: string, body?: Record<string, unknown>) => {
      if (action !== 'get_file_list') throw new Error(`unexpected action ${action}`)
      for (const key of Object.keys(body ?? {})) {
        if (!DOCUMENTED.has(key)) throw new Error(`undocumented field ${key}`)
      }
      const files = fakeFiles(n)
      return {
        request: 'GET_FILE_LIST',
        status: 'Success',
        code: 200,
        file_list: { signature_id: String(body?.signature_id), files },
      } as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new LleidaNetAdapter({ clientId: '', clientSecret: '', redirectUri: '' })
const ids = Array.from({ length: N }, (_, i) => String(100 + i))

describe('LleidaNetAdapter.listDocuments reads file_list.files', () => {
  it('sends GET_FILE_LIST for the signature with the START_FILES group', async () => {
    const call = mockFileList(1)
    await adapter.listDocuments(CREDS, SIG, {})
    expect(call).toHaveBeenCalledWith('get_file_list', {
      signature_id: SIG,
      file_group: 'START_FILES',
    })
  })

  it('returns schema-valid documents from the documented response shape', async () => {
    mockFileList(1)
    const rows = await adapter.listDocuments(CREDS, SIG, {})
    expect(rows).toHaveLength(1)
    const doc = DocumentSchema.parse(rows[0])
    expect(doc.id).toBe(`${SIG}:100`)
    expect(doc.name).toBe('Test-0.pdf')
    expect(doc.envelopeId).toBe(SIG)
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const call = mockFileList(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listDocuments(CREDS, SIG, params)
      seen.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
    expect(call).toHaveBeenCalledTimes(3)
  })

  it('keeps order as the position in the whole list, not the page', async () => {
    mockFileList(N)
    const rows = await adapter.listDocuments(CREDS, SIG, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.order)).toEqual([2, 3])
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockFileList(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listDocuments(CREDS, SIG, params)
    const env = listPage(rows, params, 'lleida-net')
    expect(env.data.map((r) => r.externalId)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })

  it('returns an empty list when file_list has no files', async () => {
    mockFileList(0)
    const params = withPageSink({ page: 1, limit: L })
    expect(await adapter.listDocuments(CREDS, SIG, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('LleidaNetAdapter.getDocument', () => {
  it('reads the file back from the signature list, keeping its position', async () => {
    const call = mockFileList(N)
    const doc = await adapter.getDocument(CREDS, `${SIG}:103`)
    expect(call).toHaveBeenCalledWith('get_file_list', {
      signature_id: SIG,
      file_group: 'START_FILES',
    })
    expect(DocumentSchema.parse(doc).externalId).toBe('103')
    expect(doc.name).toBe('Test-3.pdf')
    expect(doc.order).toBe(3)
  })

  it('finds the last file on the signature', async () => {
    mockFileList(N)
    const doc = await adapter.getDocument(CREDS, `${SIG}:104`)
    expect(doc.externalId).toBe('104')
  })

  it('throws when the file is not on the signature', async () => {
    mockFileList(N)
    await expect(adapter.getDocument(CREDS, `${SIG}:999`)).rejects.toThrow(/999/)
  })
})
