import { describe, it, expect } from 'vitest'
import {
  toWorkEmail,
  toPhone,
  toAddress,
  composeName,
  parseDecimal,
  nonempty,
  toMinorUnits,
  fromMinorUnits,
  prefixedId,
  unprefixedId,
} from '../../../../../../src/verticals/accounting/adapters/shared/transform'

/**
 * `toMinorUnits` had no coverage here, and its inverse did not exist at all —
 * kashflow carried a private `minor / 100` and every other adapter that writes
 * back to a decimal-major API had to reinvent it. An adapter that converts on
 * read but not on write sends amounts 100x too large upstream.
 */
describe('toMinorUnits / fromMinorUnits', () => {
  it('converts a decimal major amount to integer minor units', () => {
    expect(toMinorUnits(12.5)).toBe(1250)
  })

  it('rounds rather than truncating, so a half-öre does not vanish', () => {
    expect(toMinorUnits(312.5)).toBe(31250)
    expect(toMinorUnits(0.5)).toBe(50)
  })

  // Documents a real limit rather than asserting a wish: `1.005 * 100` is
  // 100.49999999999999 in IEEE754, so this rounds DOWN to 100, not up to 101.
  // Pre-existing behaviour of toMinorUnits, shared by the 43 adapters already
  // using it. Recorded here so a future reader does not treat it as a fresh bug.
  it('inherits IEEE754 half-cent drift on a third decimal place', () => {
    expect(toMinorUnits(1.005)).toBe(100)
  })

  it('converts integer minor units back to a decimal major amount', () => {
    expect(fromMinorUnits(1250)).toBe(12.5)
  })

  it('round-trips a value with minor-unit precision', () => {
    expect(fromMinorUnits(toMinorUnits(1234.56)!)).toBe(1234.56)
  })

  it('preserves the three-state contract: undefined and null are not zero', () => {
    expect(fromMinorUnits(undefined)).toBeUndefined()
    expect(fromMinorUnits(null)).toBeUndefined()
    expect(toMinorUnits(undefined)).toBeUndefined()
    expect(toMinorUnits(null)).toBeUndefined()
  })

  it('passes an explicit zero through in both directions', () => {
    expect(toMinorUnits(0)).toBe(0)
    expect(fromMinorUnits(0)).toBe(0)
  })
})

describe('toWorkEmail', () => {
  it('wraps a truthy string in a WORK email array', () => {
    expect(toWorkEmail('hello@example.com')).toEqual([{ email: 'hello@example.com', type: 'WORK' }])
  })
  it('returns [] for undefined', () => {
    expect(toWorkEmail(undefined)).toEqual([])
  })
  it('returns [] for null', () => {
    expect(toWorkEmail(null)).toEqual([])
  })
  it('returns [] for empty string', () => {
    expect(toWorkEmail('')).toEqual([])
  })
})

describe('toPhone', () => {
  it('returns a WORK telephone by default', () => {
    expect(toPhone('08-123456')).toEqual({ telephone: '08-123456', type: 'WORK' })
  })
  it('accepts a custom type', () => {
    expect(toPhone('123', 'MOBILE')).toEqual({ telephone: '123', type: 'MOBILE' })
  })
  it('returns undefined for empty string', () => {
    expect(toPhone('')).toBeUndefined()
  })
  it('returns undefined for null', () => {
    expect(toPhone(null)).toBeUndefined()
  })
  it('returns undefined for undefined', () => {
    expect(toPhone(undefined)).toBeUndefined()
  })
})

describe('toAddress', () => {
  it('builds a full address', () => {
    expect(
      toAddress({
        address1: 'Storgatan 1',
        city: 'Stockholm',
        postalCode: '12345',
        country: 'SE',
      }),
    ).toEqual({
      address1: 'Storgatan 1',
      city: 'Stockholm',
      postalCode: '12345',
      country: 'SE',
    })
  })

  it('omits falsy fields', () => {
    expect(toAddress({ address1: 'Main St', city: '', postalCode: null })).toEqual({
      address1: 'Main St',
    })
  })

  it('returns undefined when all fields are absent', () => {
    expect(toAddress({ address1: '', city: null, postalCode: undefined })).toBeUndefined()
  })

  it('returns undefined for empty object', () => {
    expect(toAddress({})).toBeUndefined()
  })
})

describe('composeName', () => {
  it('returns the org name when present', () => {
    expect(composeName('Acme Ltd', 'John', 'Doe')).toBe('Acme Ltd')
  })

  it('joins first+last when org is absent', () => {
    expect(composeName(undefined, 'John', 'Doe')).toBe('John Doe')
  })

  it('handles only first name', () => {
    expect(composeName(undefined, 'John', undefined)).toBe('John')
  })

  it('returns undefined when all inputs are absent', () => {
    expect(composeName(undefined, undefined, undefined)).toBeUndefined()
  })

  it('returns undefined for empty strings', () => {
    expect(composeName('', '', '')).toBeUndefined()
  })
})

describe('parseDecimal', () => {
  it('parses a valid string', () => {
    expect(parseDecimal('3.14')).toBe(3.14)
  })

  it('parses zero string as 0 (not undefined)', () => {
    expect(parseDecimal('0')).toBe(0)
    expect(parseDecimal('0.00')).toBe(0)
  })

  it('passes through a number', () => {
    expect(parseDecimal(42)).toBe(42)
    expect(parseDecimal(0)).toBe(0)
  })

  it('returns undefined for NaN string', () => {
    expect(parseDecimal('abc')).toBeUndefined()
  })

  it('returns undefined for null', () => {
    expect(parseDecimal(null)).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(parseDecimal(undefined)).toBeUndefined()
  })
})

describe('nonempty', () => {
  it('returns the array when non-empty', () => {
    expect(nonempty([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('returns undefined for an empty array', () => {
    expect(nonempty([])).toBeUndefined()
  })
})

/**
 * FK resolution. The canonical schema documents that a contact's `id` and the
 * `contactId` FKs pointing at it share one format — `Contact.id`'s example is
 * `cus_4Qm2Xa9Lr` and every `contactId` across bill/creditmemo/invoice/order/
 * salesorder/purchaseorder carries the identical example. Adapters that merge
 * two upstream endpoints into one canonical Contact (customers + suppliers)
 * must prefix to keep ids unique, and until now each one hand-rolled that
 * prefixing with no helper — so Fortnox and quickfile prefixed the id but not
 * the FK, and the join silently never resolved.
 *
 * Generic over the prefix because the corpus uses several: cust_/supp_,
 * vend_, debtor_/creditor_, deb_/crd_.
 *
 * Idempotent on purpose: ~25 accounting adapters still need this applied, and
 * a call site that already prefixes must not become `cust_cust_1` when swept.
 */
describe('prefixedId / unprefixedId', () => {
  it('builds a namespaced id from a platform-native value', () => {
    expect(prefixedId('cust', '1')).toBe('cust_1')
  })

  it('accepts a numeric upstream id', () => {
    expect(prefixedId('cust', 1)).toBe('cust_1')
  })

  it('is idempotent, so sweeping an already-fixed call site is safe', () => {
    expect(prefixedId('cust', 'cust_1')).toBe('cust_1')
  })

  it('does not confuse a different prefix for its own', () => {
    expect(prefixedId('cust', 'supp_1')).toBe('cust_supp_1')
  })

  it('treats absent and empty upstream values as no reference', () => {
    expect(prefixedId('cust', null)).toBeUndefined()
    expect(prefixedId('cust', undefined)).toBeUndefined()
    expect(prefixedId('cust', '')).toBeUndefined()
    expect(prefixedId('cust', '   ')).toBeUndefined()
  })

  it('round-trips back to the platform-native id for write paths', () => {
    expect(unprefixedId('cust', 'cust_1')).toBe('1')
    expect(unprefixedId('cust', prefixedId('cust', '42')!)).toBe('42')
  })

  it('tolerates an already-bare id on the way out', () => {
    expect(unprefixedId('cust', '1')).toBe('1')
  })

  it('leaves a foreign prefix alone rather than mangling it', () => {
    expect(unprefixedId('cust', 'supp_1')).toBe('supp_1')
  })

  it('treats absent and empty values as no reference on the way out', () => {
    expect(unprefixedId('cust', null)).toBeUndefined()
    expect(unprefixedId('cust', undefined)).toBeUndefined()
    expect(unprefixedId('cust', '')).toBeUndefined()
  })
})
