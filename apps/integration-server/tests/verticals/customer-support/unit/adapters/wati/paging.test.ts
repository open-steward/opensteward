/**
 * wati — page-number paging for listContacts.
 *
 * WATI's v3 "Get contacts" (https://docs.wati.io/reference/contacts_getcontactlist.md)
 * takes `page_number` ("Page number (1-based).") and `page_size` ("Number of
 * items per page (max 100)."), both required, and answers with
 * `contact_list`, `page_number` and `page_size` — no total and no next flag,
 * so the end of the collection is a short page. The adapter used to read the
 * page from `params.cursor` and never from `params.page`, so page 2 was page
 * 1 again.
 *
 * The fake below honours ONLY the documented parameters.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import { WatiAdapter } from '../../../../../../src/verticals/customer-support/adapters/wati/index'
import { WatiClient } from '../../../../../../src/verticals/customer-support/adapters/wati/client'
import type { Credentials } from '../../../../../../src/verticals/customer-support/adapter/interface'

const creds = {
  accessToken: 'tok',
  extra: { baseUrl: 'https://live-mt-server.wati.io/123' },
} as Credentials

const DOC_MAX = 100

interface Call {
  path: string
  params: Record<string, unknown>
}

/**
 * Fake WATI contacts: `total` rows. Reads only `page_number` and `page_size`,
 * both required; a page size over the documented maximum is a 400.
 */
function fakeContacts(total: number) {
  const calls: Call[] = []
  vi.spyOn(WatiClient.prototype, 'get').mockImplementation((async (
    p: string,
    params?: Record<string, unknown>,
  ) => {
    const q = params ?? {}
    calls.push({ path: p, params: q })
    if (p !== '/api/ext/v3/contacts') throw new Error(`unexpected path in test: ${p}`)
    const page = Number(q['page_number'])
    const size = Number(q['page_size'])
    if (!(Number.isInteger(page) && page >= 1))
      throw new Error(`400: page_number ${String(q['page_number'])}`)
    if (!(Number.isInteger(size) && size >= 1 && size <= DOC_MAX)) {
      throw new Error(`400: page_size ${String(q['page_size'])}`)
    }
    const start = (page - 1) * size
    const rows = Array.from({ length: Math.max(0, Math.min(size, total - start)) }, (_, i) => ({
      id: `c_${start + i}`,
      wa_id: `1415555${String(start + i).padStart(4, '0')}`,
      name: `Contact ${start + i}`,
    }))
    return { contact_list: rows, page_number: page, page_size: size }
  }) as typeof WatiClient.prototype.get)
  return calls
}

const adapter = new WatiAdapter()

afterEach(() => vi.restoreAllMocks())

describe('wati listContacts pages by page_number', () => {
  it('pages 1..3 of 2L+1 rows serve every id once, in order, and only a short page ends it', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeContacts(N)
    const ids: string[] = []
    const lengths: number[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listContacts(creds, params)
      ids.push(...rows.map((r) => r.id))
      lengths.push(rows.length)
      // WATI reports neither a total nor a next flag: nothing is claimed.
      expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
      expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
    }
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => `c_${i}`))
    expect(lengths).toEqual([L, L, 1])
  })

  it('sends the documented page_number and the caller page size on page 2', async () => {
    const calls = fakeContacts(20)
    await adapter.listContacts(creds, withPageSink({ page: 2, limit: 7 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toEqual({ page_number: 2, page_size: 7 })
  })

  it('defaults to page_number 1 and the adapter default size when page and limit are absent', async () => {
    const calls = fakeContacts(20)
    await adapter.listContacts(creds, withPageSink({ limit: 5 }))
    expect(calls[0]!.params).toEqual({ page_number: 1, page_size: 5 })

    const calls2 = fakeContacts(20)
    await adapter.listContacts(creds, withPageSink({ page: 1 }))
    expect(calls2[0]!.params).toEqual({ page_number: 1, page_size: DOC_MAX })
  })

  it('clamps a limit above the documented maximum and reports the size it paged by', async () => {
    const calls = fakeContacts(250)
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await adapter.listContacts(creds, params)
    expect(calls[0]!.params).toEqual({ page_number: 2, page_size: DOC_MAX })
    expect(rows.map((r) => r.id)[0]).toBe(`c_${DOC_MAX}`)
    expect(rows).toHaveLength(DOC_MAX)
    expect(readUpstreamPage(params)?.pageSize).toBe(DOC_MAX)
  })

  // WATI declares no maxPageSize (listUsers and listMessages do not page by it),
  // so the router hands the caller's limit through unclamped.
  it('API path: parseListQuery → listContacts → listPage serves page 2 and ends on the short page', async () => {
    fakeContacts(9)
    const p2 = parseListQuery({ page: '2', limit: '4' })
    const env2 = listPage(await adapter.listContacts(creds, p2), p2, 'wati')
    expect(env2.data.map((r) => r.id)).toEqual(['c_4', 'c_5', 'c_6', 'c_7'])
    expect(env2.meta.page).toBe(2)
    expect(env2.meta.hasMore).toBeNull()

    const p3 = parseListQuery({ page: '3', limit: '4' })
    const env3 = listPage(await adapter.listContacts(creds, p3), p3, 'wati')
    expect(env3.data.map((r) => r.id)).toEqual(['c_8'])
    expect(env3.meta.hasMore).toBe(false)
  })

  it('API path at the router ceiling pages by 100 and judges shortness at 100', async () => {
    fakeContacts(250)
    const p = parseListQuery({ page: '1', limit: '500' })
    const env = listPage(await adapter.listContacts(creds, p), p, 'wati')
    expect(env.data).toHaveLength(DOC_MAX)
    expect(env.meta.limit).toBe(DOC_MAX)
    expect(env.meta.hasMore).toBeNull()
  })
})
