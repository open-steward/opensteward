import { describe, it, expect } from 'vitest'
import { z } from 'zod'

import { Amount, ExternalId, nullish, withUnknown } from '../../src'

describe('Null/validation policy helpers', () => {
  describe('ExternalId (Rule 2: identifiers strict)', () => {
    it('rejects empty string (missing-id = ingestion error)', () => {
      expect(ExternalId.safeParse('').success).toBe(false)
    })
    it('accepts single-char id', () => {
      expect(ExternalId.safeParse('a').success).toBe(true)
    })
    it('rejects strings over the 256-char limit', () => {
      expect(ExternalId.safeParse('a'.repeat(257)).success).toBe(false)
    })
  })

  describe('Amount (Rule 1: monetary)', () => {
    it('rejects floats (must be integer minor units)', () => {
      expect(Amount.safeParse(1.5).success).toBe(false)
      expect(Amount.safeParse(0.01).success).toBe(false)
    })
    it('accepts integer 0 (upstream reported zero — a fact, not a missing value)', () => {
      expect(Amount.safeParse(0).success).toBe(true)
    })
    it('accepts negative integers (refunds, adjustments)', () => {
      expect(Amount.safeParse(-500).success).toBe(true)
    })
    it('accepts positive integers', () => {
      expect(Amount.safeParse(12345).success).toBe(true)
    })
  })

  describe('nullish(Amount) (three-state distinction)', () => {
    const schema = nullish(Amount)

    it('accepts null (upstream did not report this amount)', () => {
      expect(schema.safeParse(null).success).toBe(true)
    })
    it('accepts undefined (key omitted from payload)', () => {
      expect(schema.safeParse(undefined).success).toBe(true)
    })
    it('accepts 0 (upstream reported zero)', () => {
      expect(schema.safeParse(0).success).toBe(true)
    })
    it('rejects float (must be integer)', () => {
      expect(schema.safeParse(1.5).success).toBe(false)
    })
    it('preserves the three-state distinction in z.infer', () => {
      // null and undefined are distinct types after parse
      const a = schema.parse(null)
      const b = schema.parse(undefined)
      const c = schema.parse(0)
      expect(a).toBeNull()
      expect(b).toBeUndefined()
      expect(c).toBe(0)
    })
  })

  describe('nullish(z.array(...)) (Rule 5: collections)', () => {
    // The scalar rules above were written first and the collection case was
    // never stated, so every adapter reached for `(raw.Rows ?? []).map(...)`
    // and turned "the source did not report this" into "this is empty". `[]`
    // is an assertion, and asserting it falsely is undetectable downstream.
    const Doc = z.object({ lines: nullish(z.array(z.string())) })

    it('accepts null (upstream did not report the collection)', () => {
      expect(Doc.safeParse({ lines: null }).success).toBe(true)
    })

    it('accepts undefined (key omitted from payload)', () => {
      expect(Doc.safeParse({}).success).toBe(true)
    })

    it('accepts [] (upstream reported an explicitly empty collection)', () => {
      expect(Doc.safeParse({ lines: [] }).success).toBe(true)
    })

    it('keeps null and [] distinguishable rather than collapsing them', () => {
      expect(Doc.parse({ lines: null }).lines).toBeNull()
      expect(Doc.parse({ lines: [] }).lines).toEqual([])
      expect(Doc.parse({ lines: null }).lines).not.toEqual(Doc.parse({ lines: [] }).lines)
    })

    it('still rejects a non-array', () => {
      expect(Doc.safeParse({ lines: 'nope' }).success).toBe(false)
    })
  })

  describe('withUnknown (Rule 4: enums with explicit unknown)', () => {
    const StatusSchema = withUnknown(['active', 'archived'])

    it('accepts mapped values', () => {
      expect(StatusSchema.safeParse('active').success).toBe(true)
      expect(StatusSchema.safeParse('archived').success).toBe(true)
    })
    it('accepts unknown as a first-class member', () => {
      expect(StatusSchema.safeParse('unknown').success).toBe(true)
    })
    it('rejects values outside the set (still surfaces unmapped values rather than silently dropping)', () => {
      expect(StatusSchema.safeParse('NOPE').success).toBe(false)
    })
  })

  describe('Three-state semantics in a realistic schema', () => {
    const Charge = z.object({
      amount: Amount,
      amountRefunded: nullish(Amount),
    })

    it('accepts a charge with no refund recorded (key omitted)', () => {
      const r = Charge.safeParse({ amount: 100 })
      expect(r.success).toBe(true)
    })
    it('accepts a charge where upstream explicitly reported "no refund" (null)', () => {
      const r = Charge.safeParse({ amount: 100, amountRefunded: null })
      expect(r.success).toBe(true)
    })
    it('accepts a charge with a real zero refund (0)', () => {
      const r = Charge.safeParse({ amount: 100, amountRefunded: 0 })
      expect(r.success).toBe(true)
    })
    it('rejects a charge with a missing required `amount`', () => {
      const r = Charge.safeParse({ amountRefunded: 50 })
      expect(r.success).toBe(false)
    })
  })
})
