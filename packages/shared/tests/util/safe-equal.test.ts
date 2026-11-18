import { describe, it, expect } from 'vitest'
import { safeStrEqual } from '../../src/util/safe-equal'

describe('safeStrEqual', () => {
  it('returns true for identical strings', () => {
    expect(safeStrEqual('abc', 'abc')).toBe(true)
    expect(safeStrEqual('', '')).toBe(true)
  })

  it('returns false for different strings of equal length', () => {
    expect(safeStrEqual('abc', 'abd')).toBe(false)
    expect(safeStrEqual('aaa', 'bbb')).toBe(false)
  })

  it('returns false for strings of different lengths without throwing', () => {
    expect(safeStrEqual('abc', 'abcd')).toBe(false)
    expect(safeStrEqual('', 'a')).toBe(false)
    expect(safeStrEqual('long-secret-token', 'short')).toBe(false)
  })

  it('handles utf8 multi-byte characters', () => {
    expect(safeStrEqual('café', 'café')).toBe(true)
    expect(safeStrEqual('café', 'cafe')).toBe(false)
  })
})
