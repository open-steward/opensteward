/**
 * Clients had to guess whether more pages existed.
 *
 * `meta` carried only `{platform, fetchedAt}`, so the only signal was
 * `len(data) === limit` — which fires a spurious extra request when the total
 * is an exact multiple, and breaks outright if the server ever clamps `limit`
 * below what was asked. A live connection made it concrete: `list_accounts`
 * with `limit: 100` returned exactly 100 of **1,339**, with nothing in the
 * response saying so.
 *
 * The envelope was never the problem — `listResponse()` has computed `hasMore`
 * from `{totalCount, page, limit}` all along, and `ListResponse<T>` declares
 * all four fields. Every router simply called it with two arguments, so `opts`
 * was undefined and the fields vanished from the JSON.
 *
 * What was missing is a way for an adapter to REPORT what the platform told it.
 * List methods return a bare `T[]`, and the array a router receives is not
 * always the one the adapter returned (`stripRawPayloads` and the cache path
 * both hand back new arrays), so the channel cannot hang off the result. It
 * hangs off `QueryParams` instead — the one object that is created per request
 * and passed straight into the adapter.
 *
 * Fortnox already had the answer and discarded it: every list call destructures
 * `MetaInformation { '@TotalResources', '@CurrentPage', '@TotalPages' }` off the
 * response and returns only the rows.
 */
import { describe, it, expect } from 'vitest'
import { reportUpstreamPage, readUpstreamPage, withPageSink } from '../../src/adapter/page-meta'
import type { QueryParams } from '../../src/adapter/base'

describe('reportUpstreamPage / readUpstreamPage', () => {
  it('carries what the platform reported back to the caller', () => {
    const params = withPageSink({ limit: 100, page: 1 })
    reportUpstreamPage(params, { totalCount: 1339 })
    expect(readUpstreamPage(params)?.totalCount).toBe(1339)
  })

  it('is a no-op for an adapter that never reports — never a fabricated total', () => {
    const params = withPageSink({ limit: 100 })
    expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
  })

  it('tolerates params with no sink, so an adapter can report unconditionally', () => {
    const bare: QueryParams = { limit: 10 }
    expect(() => reportUpstreamPage(bare, { totalCount: 5 })).not.toThrow()
    expect(readUpstreamPage(bare)).toBeUndefined()
  })

  it('merges successive reports, for an adapter that fans out over two endpoints', () => {
    const params = withPageSink({ limit: 50 })
    reportUpstreamPage(params, { totalCount: 10 })
    reportUpstreamPage(params, { totalPages: 3 })
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 10, totalPages: 3 })
  })

  it('does not leak the sink into the params an adapter forwards upstream', () => {
    // The sink must not be serialised into a query string by an adapter that
    // spreads `params` into its HTTP client.
    const params = withPageSink({ limit: 25, page: 2 })
    expect(Object.keys(params)).toEqual(['limit', 'page'])
    expect(JSON.parse(JSON.stringify(params))).toEqual({ limit: 25, page: 2 })
  })
})

describe('pagedLocally', () => {
  // The paging-contract gate compares the requests behind two caller pages. A
  // page cut from rows the adapter already fetched repeats its request by
  // design, and says so here.
  it('is carried back to the caller', () => {
    const params = withPageSink({ limit: 10, page: 2 })
    reportUpstreamPage(params, { hasMore: true, pagedLocally: true })
    expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('is an ordinary field of the report, and still never reaches the params', () => {
    // The sink is non-enumerable on params, so a flag inside it cannot be
    // spread into an upstream query string, however it is stored.
    const params = withPageSink({ limit: 10, page: 2 })
    reportUpstreamPage(params, { hasMore: false, pagedLocally: true })
    expect(readUpstreamPage(params)).toEqual({ hasMore: false, pagedLocally: true })
    expect(Object.keys(params)).toEqual(['limit', 'page'])
    expect(JSON.stringify(params)).toBe('{"limit":10,"page":2}')
  })

  it('is read back when it is the only thing reported', () => {
    const params = withPageSink({ limit: 10 })
    reportUpstreamPage(params, { pagedLocally: true })
    expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
  })

  it('a later report without it keeps it', () => {
    const params = withPageSink({ limit: 10 })
    reportUpstreamPage(params, { pagedLocally: true })
    reportUpstreamPage(params, { hasMore: false })
    expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
  })
})
