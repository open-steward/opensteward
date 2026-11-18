import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type BokioCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/bokio/transform/creditmemo'
import { CREDIT_NOTE, copyOf } from '../fixtures'

const creditNote = (overrides: Partial<BokioCreditNote> = {}): BokioCreditNote => ({
  ...copyOf<BokioCreditNote>(CREDIT_NOTE),
  ...overrides,
})

describe('transformCreditMemo (Bokio, documented creditNote)', () => {
  it('maps the documented example and parses against CreditMemoSchema', () => {
    const out = CreditMemoSchema.parse(transformCreditMemo(creditNote()))
    expect(out).toMatchObject({
      id: 'b529df79-eb7f-5ef0-a8dc-c2b71f953554',
      status: 'AUTHORIZED',
      creditmemoNumber: 'CN-2024-001',
      contactId: '55c899c5-82b2-47fa-9c51-e35fc9b26443',
      currency: 'SEK',
      totalAmount: 637_500,
      taxAmount: 127_500,
      paidAmount: 0,
      postedAt: '2024-10-15',
      dueAt: '2024-11-15',
    })
  })

  it('reads creditDate and customerRef, not undocumented date/customerId', () => {
    const out = CreditMemoSchema.parse(
      transformCreditMemo(creditNote({ date: '1999-01-01', customerId: 'wrong' })),
    )
    expect(out.postedAt).toBe('2024-10-15')
    expect(out.contactId).toBe('55c899c5-82b2-47fa-9c51-e35fc9b26443')
  })

  it('maps the documented line items', () => {
    const out = CreditMemoSchema.parse(transformCreditMemo(creditNote()))
    expect(out.lineItems).toEqual([
      { id: '1', itemDescription: 'Product 1', unitAmount: 10_000, unitQuantity: 2 },
      { id: '2', itemDescription: 'Installation work', unitAmount: 50_000, unitQuantity: 10 },
    ])
  })

  it.each([
    ['draft', 'DRAFT'],
    ['published', 'AUTHORIZED'],
  ])('maps documented status %s to %s', (status, expected) => {
    expect(CreditMemoSchema.parse(transformCreditMemo(creditNote({ status }))).status).toBe(
      expected,
    )
  })

  it('keeps the raw row as metadata', () => {
    const raw = creditNote()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })
})

describe('transformCreditMemo (Bokio) appliedTo', () => {
  it('maps the documented invoiceRef to appliedTo', () => {
    const out = CreditMemoSchema.parse(transformCreditMemo(creditNote()))
    expect(out.appliedTo).toEqual([
      { invoiceId: 'a419cf69-db6f-4de9-992c-b1a60942a443', invoiceNumber: 'IN-2024-001' },
    ])
  })

  it('omits appliedTo when invoiceRef is absent or empty', () => {
    expect(
      CreditMemoSchema.parse(transformCreditMemo(creditNote({ invoiceRef: undefined }))).appliedTo,
    ).toBeUndefined()
    expect(
      CreditMemoSchema.parse(transformCreditMemo(creditNote({ invoiceRef: {} }))).appliedTo,
    ).toBeUndefined()
  })

  it('keeps a number-only invoiceRef', () => {
    const out = CreditMemoSchema.parse(
      transformCreditMemo(creditNote({ invoiceRef: { invoiceNumber: 'IN-2024-001' } })),
    )
    expect(out.appliedTo).toEqual([{ invoiceNumber: 'IN-2024-001' }])
  })
})
