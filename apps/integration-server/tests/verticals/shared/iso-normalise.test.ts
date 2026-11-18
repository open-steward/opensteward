import { describe, it, expect } from 'vitest'
import { toIso3166Alpha2 } from '../../../src/verticals/shared/iso-normalise'

describe('toIso3166Alpha2', () => {
  it('passes an existing alpha-2 code through unchanged', () => {
    expect(toIso3166Alpha2('US')).toBe('US')
    expect(toIso3166Alpha2('GB')).toBe('GB')
  })

  it('upper-cases a lowercase alpha-2 code', () => {
    expect(toIso3166Alpha2('us')).toBe('US')
  })

  it('maps a full country name to its alpha-2 code', () => {
    expect(toIso3166Alpha2('India')).toBe('IN')
    expect(toIso3166Alpha2('China')).toBe('CN')
    expect(toIso3166Alpha2('United States')).toBe('US')
    expect(toIso3166Alpha2('United Kingdom')).toBe('GB')
  })

  it('is case- and whitespace-insensitive on names', () => {
    expect(toIso3166Alpha2('  united states  ')).toBe('US')
  })

  it('maps common alternates and alpha-3 codes', () => {
    expect(toIso3166Alpha2('USA')).toBe('US')
    expect(toIso3166Alpha2('Great Britain')).toBe('GB')
  })

  it('resolves an alpha-3 code that has no entry in the name map', () => {
    // "DEU" only exists in ALPHA3_TO_ALPHA2 ("germany" is the name-map key,
    // not "deu"), so this specifically exercises the alpha-3 branch rather
    // than being satisfiable by the name map alone.
    expect(toIso3166Alpha2('DEU')).toBe('DE')
  })

  it('resolves a non-standard two-letter alias to its real code, not itself', () => {
    // "uk" is two letters but is not a valid ISO 3166-1 alpha-2 code — the
    // alias map must be consulted before the raw two-letter passthrough, or
    // this would incorrectly return "UK" unchanged.
    expect(toIso3166Alpha2('uk')).toBe('GB')
    // A genuine alpha-2 code must still pass straight through.
    expect(toIso3166Alpha2('US')).toBe('US')
  })

  it('returns undefined rather than guessing on an unknown value', () => {
    expect(toIso3166Alpha2('Freedonia')).toBeUndefined()
    expect(toIso3166Alpha2('')).toBeUndefined()
    expect(toIso3166Alpha2(null)).toBeUndefined()
    expect(toIso3166Alpha2(undefined)).toBeUndefined()
  })

  it('rejects well-formed two-letter values that are not real codes, rather than passing them through', () => {
    // 'XK' (Kosovo, user-assigned, not officially ISO-assigned), 'EU', 'AN'
    // (retired), and 'ZZ' are all shape-valid two-letter strings but none is
    // a real ISO 3166-1 alpha-2 code — the exact defect this module exists
    // to normalise away. A bare shape check would return these unchanged.
    expect(toIso3166Alpha2('XK')).toBeUndefined()
    expect(toIso3166Alpha2('EU')).toBeUndefined()
    expect(toIso3166Alpha2('AN')).toBeUndefined()
    expect(toIso3166Alpha2('ZZ')).toBeUndefined()
  })

  it('is idempotent', () => {
    expect(toIso3166Alpha2(toIso3166Alpha2('India'))).toBe('IN')
    // Also cover a case where idempotence is non-trivial: the alias's own
    // output ("GB") must not be re-mapped to something else on a second pass.
    expect(toIso3166Alpha2(toIso3166Alpha2('uk'))).toBe('GB')
  })
})
