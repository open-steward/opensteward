import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type FikenCreditMemo,
  type FikenCreditMemoLine,
} from '../../../../../../../src/verticals/accounting/adapters/fiken/transform/creditmemo'

function makeCreditMemoLine(overrides: Partial<FikenCreditMemoLine> = {}): FikenCreditMemoLine {
  return {
    netPrice: 2000,
    vatAmount: 500,
    grossPrice: 2500,
    description: 'Return item',
    accountCode: '3000',
    ...overrides,
  }
}

function makeCreditMemo(overrides: Partial<FikenCreditMemo> = {}): FikenCreditMemo {
  return {
    creditNoteId: 801,
    creditNoteNumber: 'CN-801',
    customerId: 55,
    currency: 'NOK',
    net: 4000,
    vat: 1000,
    gross: 5000,
    issueDate: '2024-08-01',
    settled: false,
    lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps creditNoteId to id as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('801')
  })

  it('maps creditNoteNumber to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CN-801')
  })

  it('maps customerId to contactId as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('55')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('NOK')
  })

  it('maps gross to totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(5000)
  })

  it('maps vat to taxAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).taxAmount).toBe(1000)
  })

  it('maps issueDate to postedAt as Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-08-01'))
  })

  it('returns undefined postedAt when issueDate is empty', () => {
    expect(transformCreditMemo(makeCreditMemo({ issueDate: '' })).postedAt).toBeUndefined()
  })

  it('maps status AUTHORIZED when not settled', () => {
    expect(transformCreditMemo(makeCreditMemo({ settled: false })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID when settled', () => {
    expect(transformCreditMemo(makeCreditMemo({ settled: true })).status).toBe('PAID')
  })

  it('maps lines to lineItems', () => {
    const raw = makeCreditMemo({ lines: [makeCreditMemoLine()] })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemDescription).toBe('Return item')
    expect(li.totalAmount).toBe(2500)
    expect(li.taxAmount).toBe(500)
    expect(li.accountId).toBe('3000')
  })

  it('returns undefined contactId when customerId is zero', () => {
    expect(transformCreditMemo(makeCreditMemo({ customerId: 0 })).contactId).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
