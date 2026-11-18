import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type NetvisorCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/netvisor/transform/creditmemo'

function makeCreditMemo(overrides: Partial<NetvisorCreditMemo> = {}): NetvisorCreditMemo {
  return {
    NetvisorKey: 99001,
    CreditMemoNumber: 7001,
    CustomerIdentifier: 'CUST-7',
    Currency: 'EUR',
    CreditMemoDate: '2024-03-01',
    DueDate: '2024-03-31',
    Amount: -10000,
    VatAmount: -2000,
    OpenAmount: -10000,
    PaidAmount: 0,
    Status: 'Open',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps NetvisorKey to id as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('99001')
  })

  it('maps CreditMemoNumber to creditmemoNumber as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('7001')
  })

  it('maps CustomerIdentifier to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('CUST-7')
  })

  it('maps Currency to currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('EUR')
  })

  it('maps amounts correctly', () => {
    const cm = transformCreditMemo(makeCreditMemo())
    expect(cm.totalAmount).toBe(-10000)
    expect(cm.taxAmount).toBe(-2000)
    expect(cm.balanceAmount).toBe(-10000)
  })

  it('maps CreditMemoDate to postedAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-03-01')).toBe(true)
  })

  it('maps DueDate to dueAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(expectDate(result.dueAt).toISOString().startsWith('2024-03-31')).toBe(true)
  })

  it('returns undefined postedAt when CreditMemoDate is empty', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ CreditMemoDate: '' })).postedAt,
    ).toBeUndefined()
  })

  it('maps status Open to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Open' })).status).toBe('AUTHORIZED')
  })

  it('maps status Paid to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Paid' })).status).toBe('PAID')
  })

  it('maps status Cancelled to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Unknown' })).status).toBe('DRAFT')
  })

  it('returns undefined contactId when CustomerIdentifier is empty', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ CustomerIdentifier: '' })).contactId,
    ).toBeUndefined()
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
