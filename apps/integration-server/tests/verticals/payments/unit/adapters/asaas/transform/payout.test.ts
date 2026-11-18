import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawAsaasTransfer,
} from '../../../../../../../src/verticals/payments/adapters/asaas/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('asaas transformPayout', () => {
  it('maps a DONE transfer to paid status', () => {
    const raw: RawAsaasTransfer = {
      id: 'tr_001',
      dateCreated: '2024-03-01T00:00:00Z',
      type: 'BANK_ACCOUNT',
      status: 'DONE',
      value: 500.0,
      netValue: 498.5,
      transferFee: 1.5,
      effectiveDate: '2024-03-01T00:00:00Z',
      operationType: 'TED',
      bankAccount: {
        bank: { name: 'Banco do Brasil' },
        account: '12345-6',
      },
    }
    const result = transformPayout(raw)

    expect(result.id).toBe('tr_001')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('BRL')
    expect(result.method).toBe('standard')
    // last 4 of account '12345-6'
    expect(result.destinationLast4).toBe('45-6')
    expect(result.gateway).toBe('asaas')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING transfer to pending status', () => {
    const raw: RawAsaasTransfer = {
      id: 'tr_002',
      dateCreated: '2024-03-01T00:00:00Z',
      status: 'PENDING',
      value: 250.0,
    }
    const result = transformPayout(raw)

    expect(result.status).toBe('pending')
    expect(result.amount).toBe(25000)
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a BANK_PROCESSING transfer to in_transit status', () => {
    const raw: RawAsaasTransfer = {
      id: 'tr_003',
      dateCreated: '2024-03-01T00:00:00Z',
      status: 'BANK_PROCESSING',
      value: 100.0,
    }
    const result = transformPayout(raw)

    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED transfer to failed status with failureMessage', () => {
    const raw: RawAsaasTransfer = {
      id: 'tr_004',
      dateCreated: '2024-03-01T00:00:00Z',
      status: 'FAILED',
      value: 75.0,
      failReason: 'Insufficient balance',
    }
    const result = transformPayout(raw)

    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Insufficient balance')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED transfer to cancelled', () => {
    const raw: RawAsaasTransfer = {
      id: 'tr_005',
      dateCreated: '2024-03-01T00:00:00Z',
      status: 'CANCELLED',
      value: 30.0,
    }
    const result = transformPayout(raw)

    expect(result.status).toBe('cancelled')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
