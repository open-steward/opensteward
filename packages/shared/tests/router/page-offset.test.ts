import { describe, it, expect } from 'vitest'
import { pageOffset, parseListQuery } from '../../src/router/list-envelope'

/**
 * `page` is 1-based everywhere in OpenSteward. Offset APIs count rows from 0,
 * so the first page is offset 0 — `page × limit` starts one page in and the
 * first `limit` rows are never served (clover, revel and paysafe did this).
 */
describe('pageOffset', () => {
  it('starts page 1 at the first row', () => {
    expect(pageOffset(parseListQuery({ page: '1', limit: '10' }), 10)).toBe(0)
  })

  it('moves one page size per page', () => {
    expect(pageOffset(parseListQuery({ page: '2', limit: '25' }), 25)).toBe(25)
    expect(pageOffset({ page: 3 }, 20)).toBe(40)
  })

  it.each([
    ['missing', undefined],
    ['0', 0],
    ['negative', -3],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('reads a %s page as page 1', (_label, page) => {
    expect(pageOffset({ page }, 10)).toBe(0)
  })

  it('floors a fractional page rather than sending a fractional offset', () => {
    expect(pageOffset({ page: 2.7 }, 10)).toBe(10)
  })

  it('strides by the size actually sent, not the caller’s larger limit', () => {
    // A caller asks for 500 and the platform caps at 100. Page 2 must start at
    // row 100: striding by 500 would skip rows 100–499 on every page.
    const params = parseListQuery({ page: '2', limit: '500' })
    const sent = Math.min(params.limit!, 100)
    expect(pageOffset(params, sent)).toBe(100)
  })
})
