import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type MtCredit,
} from '../../../../../../../src/verticals/accounting/adapters/mineraltree/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeCredit(overrides: Partial<MtCredit> = {}): MtCredit {
  return {
    id: 'mt_cr_001',
    externalId: 'EXT-CR-1',
    creditNumber: 'CR-500',
    vendor: { id: 'vnd_10', name: 'Parts Co' },
    amount: { amount: 250.0, currency: 'USD' },
    status: 'Open',
    transactionDate: '2024-03-15',
    memo: 'Credit for returned parts',
    ...overrides,
  }
}

describe('transformCreditMemo (mineraltree)', () => {
  it('maps id', () => {
    expect(transformCreditMemo(makeCredit()).id).toBe('mt_cr_001')
  })

  it('maps creditNumber to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCredit()).creditmemoNumber).toBe('CR-500')
  })

  it('falls back to externalId when creditNumber is absent', () => {
    const result = transformCreditMemo(makeCredit({ creditNumber: undefined }))
    expect(result.creditmemoNumber).toBe('EXT-CR-1')
  })

  it('maps vendor.id to contactId', () => {
    expect(transformCreditMemo(makeCredit()).contactId).toBe('vnd_10')
  })

  it('maps currency from amount.currency', () => {
    expect(transformCreditMemo(makeCredit()).currency).toBe('USD')
  })

  it('converts decimal amount to integer minor units via toMinorUnits', () => {
    // 250.00 * 100 = 25000
    expect(transformCreditMemo(makeCredit()).totalAmount).toBe(25000)
  })

  it('maps transactionDate to postedAt as Date', () => {
    expect(transformCreditMemo(makeCredit()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps status Open to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCredit({ status: 'Open' })).status).toBe('AUTHORIZED')
  })

  it('maps status Settled to PAID', () => {
    expect(transformCreditMemo(makeCredit({ status: 'Settled' })).status).toBe('PAID')
  })

  it('maps status Voided to VOIDED', () => {
    expect(transformCreditMemo(makeCredit({ status: 'Voided' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformCreditMemo(makeCredit({ status: undefined })).status).toBe('DRAFT')
  })

  it('maps memo to notes', () => {
    expect(transformCreditMemo(makeCredit()).notes).toBe('Credit for returned parts')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCredit()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('passes CreditMemoSchema validation', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(makeCredit()))).not.toThrow()
  })
})
