import { describe, it, expect, vi } from 'vitest'
import { parseListQuery, listPageMeta, listPage } from '../../../../../src/verticals/accounting/router/helpers'

/**
 * Finding 16 — `meta.limit` must describe the payload, not the request.
 *
 * `list_accounts(limit=2)` returned ~60 records alongside `meta: { limit: 2 }`.
 * Ignoring `limit` is a bug on its own; asserting a limit that was not applied
 * is worse, because the metadata added to fix Finding 5 then makes a false
 * statement. A client sizes buffers, paginates or bills against a number that
 * does not describe what it was sent.
 *
 * The adapter fix (Xero's `listAccounts`) is necessary but not sufficient:
 * there are 1,545 adapters and auditing each is not a control. So the router
 * enforces the contract for all of them, and the adapter bug surfaces as a
 * logged warning rather than as a false envelope.
 */

function log() {
  return { warn: vi.fn(), debug: vi.fn(), info: vi.fn() }
}

describe('listPage — the envelope describes what was actually returned', () => {
  it('truncates an over-long page to the requested limit', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ id: String(i) }))
    const res = listPage(items, parseListQuery({ limit: '2' }), 'xero', log())
    expect(res.data).toHaveLength(2)
    expect(res.meta.limit).toBe(2)
  })

  it('reports the applied limit, never merely the requested one', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ id: String(i) }))
    const res = listPage(items, parseListQuery({ limit: '2' }), 'xero', log())
    // The exact defect: meta claiming 2 while data carried 60.
    expect(res.data.length).toBeLessThanOrEqual(res.meta.limit!)
  })

  it('warns when it has to truncate, so the adapter bug stays visible', () => {
    const l = log()
    listPage(Array.from({ length: 60 }, (_, i) => ({ id: String(i) })), parseListQuery({ limit: '2' }), 'xero', l)
    expect(l.warn).toHaveBeenCalledTimes(1)
    const [payload] = l.warn.mock.calls[0] as [Record<string, unknown>, string]
    expect(payload).toMatchObject({ platform: 'xero', requested_limit: 2, returned: 60 })
  })

  it('does not warn when the adapter already respected the limit', () => {
    const l = log()
    listPage([{ id: '1' }, { id: '2' }], parseListQuery({ limit: '2' }), 'xero', l)
    expect(l.warn).not.toHaveBeenCalled()
  })

  it('leaves a short page alone and reports the limit that was in force', () => {
    const res = listPage([{ id: '1' }], parseListQuery({ limit: '25' }), 'xero', log())
    expect(res.data).toHaveLength(1)
    expect(res.meta.limit).toBe(25)
  })

  it('applies the default page size when the caller names no limit', () => {
    const items = Array.from({ length: 250 }, (_, i) => ({ id: String(i) }))
    const res = listPage(items, parseListQuery({}), 'xero', log())
    expect(res.data).toHaveLength(100)
    expect(res.meta.limit).toBe(100)
  })

  it('keeps hasMore derivable from an upstream total', () => {
    const params = parseListQuery({ limit: '2', page: '1' })
    const res = listPage([{ id: '1' }, { id: '2' }], params, 'xero', log())
    expect(res.meta.page).toBe(1)
    expect(res.meta.limit).toBe(2)
  })
})

describe('listPageMeta', () => {
  it('still defaults page to 1 and limit to the page default', () => {
    expect(listPageMeta(parseListQuery({}))).toMatchObject({ page: 1, limit: 100 })
  })
})
