/**
 * `listResponse` could always publish pagination; nothing ever gave it the
 * numbers. This pins the wiring end-to-end: parse → adapter reports → envelope.
 *
 * Updated for Finding 25. The derivation moved from `listResponse` into
 * `listPage`, because the honest answer needs something `listResponse` cannot
 * see: how many rows the ADAPTER returned before the router truncated them to
 * `limit`. An adapter that over-returns proves more exists; that signal is
 * destroyed by the time the envelope is built.
 *
 * `hasMore` also became nullable rather than optional. Only 2 of 282
 * accounting adapters report a count, so "we cannot tell" is the common case
 * and needs to be a value a client can branch on — an omitted key is
 * indistinguishable from a field nobody implemented, which is precisely how
 * `accounts` ended up reporting pagination while `invoices` and `contacts`
 * silently did not.
 */
import { describe, it, expect, vi } from 'vitest'
import { reportUpstreamPage } from '@opensteward/shared'
import { parseListQuery, listPage } from '../../../../../src/verticals/accounting/router/helpers'

const log = () => ({ warn: vi.fn(), debug: vi.fn(), info: vi.fn() })
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }))

describe('the list envelope carries pagination', () => {
  it('publishes hasMore=true for the 100-of-1339 case that prompted this', () => {
    const params = parseListQuery({ limit: '100', page: '1' })
    reportUpstreamPage(params, { totalCount: 1339 })

    const res = listPage(rows(100), params, 'fortnox', log())
    expect(res.meta.totalCount).toBe(1339)
    expect(res.meta.limit).toBe(100)
    expect(res.meta.page).toBe(1)
    expect(res.meta.hasMore).toBe(true)
  })

  it('publishes hasMore=false on the last page', () => {
    const params = parseListQuery({ limit: '100', page: '14' })
    reportUpstreamPage(params, { totalCount: 1339 })
    expect(listPage(rows(39), params, 'fortnox', log()).meta.hasMore).toBe(false)
  })

  it('does not guess hasMore when the platform reported no total', () => {
    // The honest answer for a FULL page with no count: `null`, not `true`.
    // Claiming `true` would fire a wasted request whenever the collection is
    // an exact multiple of the page size — the original objection, preserved.
    const params = parseListQuery({ limit: '100' })
    const res = listPage(rows(100), params, 'someplatform', log())
    expect(res.meta.totalCount).toBeNull()
    expect(res.meta.hasMore).toBeNull()
  })

  it('does answer hasMore=false for a short page even with no total', () => {
    // Not a guess: fewer rows than the page asked for is the end of the
    // collection. Previously this was reported as `undefined`, which threw
    // away information the adapter had already given us.
    const params = parseListQuery({ limit: '100' })
    expect(listPage(rows(39), params, 'someplatform', log()).meta.hasMore).toBe(false)
  })

  it('still reports the page and limit the caller asked for', () => {
    const params = parseListQuery({ limit: '25', page: '3' })
    const res = listPage([], params, 'someplatform', log())
    expect(res.meta).toMatchObject({ page: 3, limit: 25 })
  })

  it('defaults page and limit when the caller named neither', () => {
    const res = listPage([], parseListQuery({}), 'someplatform', log())
    expect(res.meta).toMatchObject({ page: 1, limit: 100 })
  })
})
