import { describe, it, expect } from 'vitest'
import { toIso, pickStr, pickNum } from '../../../../../../../src/verticals/inventory/adapters/megaventory/transform/shared'

/**
 * Megaventory serialises dates in the .NET JSON format, confirmed in every
 * response example in the live service metadata (2026-09-18).
 */
describe('megaventory .NET date handling', () => {
  it('parses a .NET date into an ISO string', () => {
    expect(toIso('/Date(1530110485503-0000)/')).toBe('2018-06-27T14:41:25.503Z')
  })

  it('does not treat the .NET wrapper as an ISO string', () => {
    // new Date('/Date(...)/') is Invalid Date. A transform that assumes ISO
    // drops every timestamp in the payload without erroring.
    expect(new Date('/Date(1530110485503-0000)/').getTime()).toBeNaN()
    expect(toIso('/Date(1530110485503-0000)/')).toBeDefined()
  })

  it('treats DateTime.MinValue as absent rather than as the year 1', () => {
    // Megaventory sends this for every unset date. Parsing it literally
    // publishes timestamps in 0001, which sort before real data and read as
    // genuine values.
    expect(toIso('/Date(-62135596800000-0000)/')).toBeUndefined()
  })

  it('handles a positive timezone offset in the wrapper', () => {
    expect(toIso('/Date(1530110485503+0200)/')).toBe('2018-06-27T14:41:25.503Z')
  })

  it('still accepts a plain parseable date', () => {
    expect(toIso('2026-09-18T10:00:00Z')).toBe('2026-09-18T10:00:00.000Z')
  })

  it('returns undefined for empty and unparseable values', () => {
    expect(toIso('')).toBeUndefined()
    expect(toIso(null)).toBeUndefined()
    expect(toIso('not a date')).toBeUndefined()
  })
})

describe('megaventory empty-string handling', () => {
  it('treats an empty string as absent', () => {
    // Megaventory uses "" rather than null throughout.
    expect(pickStr('')).toBeUndefined()
    expect(pickStr('   ')).toBeUndefined()
    expect(pickStr('DFW-1')).toBe('DFW-1')
  })

  it('keeps zero as a real number', () => {
    expect(pickNum(0)).toBe(0)
    expect(pickNum('')).toBeUndefined()
  })
})
