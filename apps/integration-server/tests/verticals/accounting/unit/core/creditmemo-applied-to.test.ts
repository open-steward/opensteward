/**
 * `CreditMemo.appliedTo` links a credit memo to the invoice(s) it credits.
 * An entry that names no invoice at all links to nothing, so the schema
 * rejects it: every entry carries an `invoiceId`, an `invoiceNumber`, or both.
 */
import { describe, it, expect } from 'vitest'
import {
  CreditMemoApplicationSchema,
  CreditMemoSchema,
} from '../../../../../src/verticals/accounting/schema/creditmemo'

describe('CreditMemoApplicationSchema', () => {
  it('accepts an id-only, a number-only and a full entry', () => {
    expect(CreditMemoApplicationSchema.safeParse({ invoiceId: 'inv_1' }).success).toBe(true)
    expect(CreditMemoApplicationSchema.safeParse({ invoiceNumber: 'INV-1' }).success).toBe(true)
    expect(
      CreditMemoApplicationSchema.safeParse({
        invoiceId: 'inv_1',
        invoiceNumber: 'INV-1',
        amount: 6000,
        appliedAt: '2026-02-10',
      }).success,
    ).toBe(true)
  })

  it('rejects an entry with neither invoiceId nor invoiceNumber', () => {
    expect(CreditMemoApplicationSchema.safeParse({}).success).toBe(false)
    expect(
      CreditMemoApplicationSchema.safeParse({ amount: 6000, appliedAt: '2026-02-10' }).success,
    ).toBe(false)
  })

  it('rejects an entry whose only reference is an empty string', () => {
    expect(CreditMemoApplicationSchema.safeParse({ invoiceNumber: '' }).success).toBe(false)
    expect(CreditMemoApplicationSchema.safeParse({ invoiceId: '' }).success).toBe(false)
  })

  it('rejects such an entry inside a CreditMemo', () => {
    expect(CreditMemoSchema.safeParse({ appliedTo: [{ amount: 6000 }] }).success).toBe(false)
  })

  it('rejects a non-calendar-date appliedAt string', () => {
    expect(
      CreditMemoApplicationSchema.safeParse({ invoiceId: 'inv_1', appliedAt: '10/02/2026' })
        .success,
    ).toBe(false)
  })

  it('leaves appliedTo optional on CreditMemo', () => {
    expect(CreditMemoSchema.safeParse({}).success).toBe(true)
    expect(CreditMemoSchema.safeParse({ appliedTo: [] }).success).toBe(true)
  })
})
