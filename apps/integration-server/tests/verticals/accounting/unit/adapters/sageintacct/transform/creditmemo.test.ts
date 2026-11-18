import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type IntacctCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/sageintacct/transform/creditmemo'

function makeCreditMemo(overrides: Partial<IntacctCreditMemo> = {}): IntacctCreditMemo {
  return {
    RECORDNO: 'cm-1',
    RECORDID: 'CM-2024-001',
    CUSTOMERID: 'cust-1',
    TOTALENTERED: '500.00',
    TOTALPAID: '0.00',
    TOTALDUE: '500.00',
    CURRENCY: 'USD',
    WHENCREATED: '2024-03-01',
    WHENDUE: '2024-04-01',
    STATE: 'Posted',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps RECORDNO to id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-1')
  })

  it('maps RECORDID to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CM-2024-001')
  })

  it('maps CUSTOMERID to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('cust-1')
  })

  it('maps CURRENCY correctly', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('USD')
  })

  it('parses TOTALENTERED as totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(500)
  })

  it('parses TOTALPAID as paidAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).paidAmount).toBe(0)
  })

  it('parses TOTALDUE as balanceAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).balanceAmount).toBe(500)
  })

  it('parses WHENCREATED as Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses WHENDUE as Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps STATE Draft to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ STATE: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps STATE Posted with full balance due to AUTHORIZED', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ STATE: 'Posted', TOTALPAID: '0.00', TOTALDUE: '500.00' })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps STATE Posted with zero due to PAID', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ STATE: 'Posted', TOTALPAID: '500.00', TOTALDUE: '0.00' })).status,
    ).toBe('PAID')
  })

  it('maps STATE Posted with partial payment to PARTIALLY_PAID', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ STATE: 'Posted', TOTALPAID: '200.00', TOTALDUE: '300.00' })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps STATE Paid to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ STATE: 'Paid' })).status).toBe('PAID')
  })

  it('maps STATE Reversed to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ STATE: 'Reversed' })).status).toBe('VOIDED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
