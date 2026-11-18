import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { LibreSignClient } from '../../../../../../src/verticals/docsign/adapters/libresign/client'
import { LibresignAdapter } from '../../../../../../src/verticals/docsign/adapters/libresign'

/**
 * Signers, documents and audit-trail entries all come from
 * `GET /file/validate/uuid/{uuid}`, whose only parameters are `uuid`,
 * `showVisibleElements`, `showMessages` and `showValidateFile`: the file
 * carries its whole `signers` array
 * (https://raw.githubusercontent.com/LibreSign/libresign/main/openapi.json).
 * There is no upstream page to ask for, so the adapter must page the
 * collection itself, or page 2 repeats page 1.
 */

const CREDS = {
  accessToken: 'pw',
  extra: { serverUrl: 'https://nc.test', username: 'u' },
} as Credentials
const UUID = 'file-uuid-1'
const L = 2
const N = 2 * L + 1

function iso(minute: number): string {
  return new Date(Date.UTC(2025, 0, 1, 0, minute)).toISOString()
}

/**
 * A file with `n` signers, none signed, so the audit trail is exactly
 * `created` + one `sent` per signer, in ascending time.
 */
function fakeFile(signers: number) {
  return {
    uuid: UUID,
    name: 'contract.pdf',
    status: 1,
    created_at: iso(0),
    signers: Array.from({ length: signers }, (_, i) => ({
      signRequestId: 100 + i,
      email: `s${i}@example.com`,
      displayName: `Signer ${i}`,
      status: 0,
      request_sign_date: iso(i + 1),
    })),
  }
}

/** Honours only the documented path; any query parameter is a bug here. */
function mockValidate(signers: number) {
  return vi
    .spyOn(LibreSignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/file/validate/uuid/${UUID}`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('file-validate-uuid takes no paging params')
      return fakeFile(signers) as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new LibresignAdapter()

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>

/** [name, lister, signers on the fake file, expected ids in order]. */
const METHODS: Array<[string, Lister, number, string[]]> = [
  [
    'listSigners',
    (c, id, p) => adapter.listSigners(c, id, p),
    N,
    Array.from({ length: N }, (_, i) => String(100 + i)),
  ],
  [
    'listAuditTrailEntries',
    (c, id, p) => adapter.listAuditTrailEntries(c, id, p),
    // created + (N - 1) sent events = N entries.
    N - 1,
    Array.from({ length: N }, (_, i) => `${UUID}:${i}`),
  ],
]

describe.each(METHODS)(
  'LibresignAdapter.%s pages the whole file locally',
  (_name, list, signers, ids) => {
    it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
      const get = mockValidate(signers)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(CREDS, UUID, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.totalCount).toBe(N)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids)
      expect(more).toEqual([true, true, false])
      // The endpoint takes no paging parameter; every page asks for the file.
      for (const call of get.mock.calls) expect(call).toEqual([`/file/validate/uuid/${UUID}`])
    })

    it('page 2 is not page 1', async () => {
      mockValidate(signers)
      const p1 = await list(CREDS, UUID, withPageSink({ page: 1, limit: L }))
      const p2 = await list(CREDS, UUID, withPageSink({ page: 2, limit: L }))
      expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
    })

    it('a limit above the collection size serves everything once, with no next page', async () => {
      mockValidate(signers)
      const params = parseListQuery({ page: '1', limit: '100000' })
      const rows = await list(CREDS, UUID, params)
      expect(rows.map((r) => r.id)).toEqual(ids)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('without a limit returns the whole collection (used by the get* lookups)', async () => {
      mockValidate(signers)
      const rows = await list(CREDS, UUID, {})
      expect(rows.map((r) => r.id)).toEqual(ids)
    })

    it('serves page 2 on the API path through parseListQuery and listPage', async () => {
      mockValidate(signers)
      const params = parseListQuery({ page: '2', limit: String(L) })
      const rows = await list(CREDS, UUID, params)
      const env = listPage(rows, params, 'libresign')
      expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(env.meta.page).toBe(2)
      expect(env.meta.limit).toBe(L)
      expect(env.meta.totalCount).toBe(N)
      expect(env.meta.hasMore).toBe(true)
    })
  },
)

describe('LibresignAdapter.listDocuments pages its one-document collection locally', () => {
  it('page 1 holds the document and ends the collection; page 2 is empty', async () => {
    mockValidate(1)
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter.listDocuments(CREDS, UUID, p1)).map((d) => d.id)).toEqual([UUID])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    expect(readUpstreamPage(p1)?.totalCount).toBe(1)
    expect(readUpstreamPage(p1)?.pagedLocally).toBe(true)

    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listDocuments(CREDS, UUID, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path as empty rather than repeating page 1', async () => {
    mockValidate(1)
    const params = parseListQuery({ page: '2', limit: '1' })
    const env = listPage(await adapter.listDocuments(CREDS, UUID, params), params, 'libresign')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })
})

describe('LibresignAdapter get* lookups still see the whole file', () => {
  it('getSigner finds the last signer and getAuditTrailEntry the last entry', async () => {
    mockValidate(N)
    const s = await adapter.getSigner(CREDS, `${UUID}:${100 + N - 1}`)
    expect(s.externalId).toBe(String(100 + N - 1))
    const e = await adapter.getAuditTrailEntry(CREDS, `${UUID}:${N}`)
    expect(e.id).toBe(`${UUID}:${N}`)
  })
})

describe('LibresignAdapter.listAuditTrailEntries sorts before numbering and paging', () => {
  it('pages 1..3 come back in time order when signers arrive out of order', async () => {
    const signers = N - 1
    const file = fakeFile(signers)
    // Signer i was asked last-first: signer 0 is the latest `sent` event.
    file.signers.forEach((s, i) => (s.request_sign_date = iso(signers - i)))
    vi.spyOn(LibreSignClient.prototype, 'get').mockResolvedValue(file as never)

    const seen: Array<{ id: string; occurredAt?: string; actorEmail?: string }> = []
    for (const page of [1, 2, 3]) {
      seen.push(
        ...(await adapter.listAuditTrailEntries(CREDS, UUID, withPageSink({ page, limit: L }))),
      )
    }
    const times = seen.map((e) => e.occurredAt)
    expect(times).toEqual([...times].sort())
    expect(seen.map((e) => e.id)).toEqual(Array.from({ length: N }, (_, i) => `${UUID}:${i}`))
    expect(seen.slice(1).map((e) => e.actorEmail)).toEqual(
      Array.from({ length: signers }, (_, i) => `s${signers - 1 - i}@example.com`),
    )
  })
})
