import { describe, it, expect } from 'vitest'
import { z } from 'zod'

import {
  AddressSchema,
  Description,
  DESCRIPTION_MAX,
  Email,
  EMAIL_MAX,
  ExternalId,
  EXTERNAL_ID_MAX,
  Name,
  NAME_MAX,
  Note,
  NOTE_MAX,
  nullish,
} from '../../src'

describe('limits helpers', () => {
  describe('Name', () => {
    it('accepts strings up to NAME_MAX', () => {
      expect(Name.safeParse('').success).toBe(true)
      expect(Name.safeParse('a'.repeat(NAME_MAX)).success).toBe(true)
    })
    it('rejects strings over NAME_MAX', () => {
      expect(Name.safeParse('a'.repeat(NAME_MAX + 1)).success).toBe(false)
    })
  })

  describe('Description', () => {
    it('caps at DESCRIPTION_MAX', () => {
      expect(Description.safeParse('a'.repeat(DESCRIPTION_MAX)).success).toBe(true)
      expect(Description.safeParse('a'.repeat(DESCRIPTION_MAX + 1)).success).toBe(false)
    })
  })

  describe('Note', () => {
    it('caps at NOTE_MAX', () => {
      expect(Note.safeParse('a'.repeat(NOTE_MAX)).success).toBe(true)
      expect(Note.safeParse('a'.repeat(NOTE_MAX + 1)).success).toBe(false)
    })
  })

  describe('ExternalId', () => {
    it('caps at EXTERNAL_ID_MAX', () => {
      expect(ExternalId.safeParse('a'.repeat(EXTERNAL_ID_MAX)).success).toBe(true)
      expect(ExternalId.safeParse('a'.repeat(EXTERNAL_ID_MAX + 1)).success).toBe(false)
    })
  })

  describe('Email', () => {
    it('accepts a valid email under EMAIL_MAX', () => {
      expect(Email.safeParse('user@example.com').success).toBe(true)
    })
    it('rejects non-email strings', () => {
      expect(Email.safeParse('not-an-email').success).toBe(false)
    })
    it('rejects emails over EMAIL_MAX', () => {
      const overlong = 'a'.repeat(EMAIL_MAX - 10) + '@example.com'
      expect(overlong.length).toBeGreaterThan(EMAIL_MAX)
      expect(Email.safeParse(overlong).success).toBe(false)
    })
  })
})

describe('nullish() helper', () => {
  const schema = nullish(z.string())

  it('accepts a string', () => {
    expect(schema.safeParse('hello').success).toBe(true)
  })
  it('accepts null', () => {
    expect(schema.safeParse(null).success).toBe(true)
  })
  it('accepts undefined', () => {
    expect(schema.safeParse(undefined).success).toBe(true)
  })
  it('rejects a number', () => {
    expect(schema.safeParse(42).success).toBe(false)
  })
})

describe('AddressSchema', () => {
  it('accepts an object with all sub-fields set to null', () => {
    const result = AddressSchema.safeParse({
      line1: null,
      line2: null,
      city: null,
      region: null,
      postalCode: null,
      country: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a partial object with only line1 set', () => {
    const result = AddressSchema.safeParse({ line1: '1 Main St' })
    expect(result.success).toBe(true)
  })

  it('accepts an empty object', () => {
    expect(AddressSchema.safeParse({}).success).toBe(true)
  })

  it('rejects a non-ISO-3166 country code', () => {
    const result = AddressSchema.safeParse({ country: 'INVALID' })
    expect(result.success).toBe(false)
  })

  it('rejects line1 over 255 chars', () => {
    const result = AddressSchema.safeParse({ line1: 'a'.repeat(256) })
    expect(result.success).toBe(false)
  })

  it('rejects postalCode over 40 chars', () => {
    const result = AddressSchema.safeParse({ postalCode: 'a'.repeat(41) })
    expect(result.success).toBe(false)
  })
})
