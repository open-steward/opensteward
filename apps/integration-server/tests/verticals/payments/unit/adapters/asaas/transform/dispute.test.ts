import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawAsaasChargeback,
} from '../../../../../../../src/verticals/payments/adapters/asaas/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('asaas transformDispute', () => {
  it('maps a REQUESTED chargeback to needs_response with fraudulent reason', () => {
    const raw: RawAsaasChargeback = {
      id: 'CB-001',
      dateCreated: '2024-03-01T00:00:00Z',
      payment: 'pay_001',
      value: 99.9,
      status: 'REQUESTED',
      reason: 'FRAUD',
      creditCardBrand: 'VISA',
    }
    const result = transformDispute(raw)

    expect(result.id).toBe('CB-001')
    expect(result.chargeId).toBe('pay_001')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    // 99.9 reais → 9990 centavos
    expect(result.amount).toBe(9990)
    expect(result.currency).toBe('BRL')
    expect(result.network).toBe('visa')
    expect(result.gateway).toBe('asaas')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps an IN_DISPUTE chargeback to under_review', () => {
    const raw: RawAsaasChargeback = {
      id: 'CB-002',
      payment: 'pay_002',
      value: 50.0,
      status: 'IN_DISPUTE',
    }
    const result = transformDispute(raw)

    expect(result.status).toBe('under_review')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a DISPUTE_LOST chargeback to lost', () => {
    const raw: RawAsaasChargeback = {
      id: 'CB-003',
      payment: 'pay_003',
      value: 200.0,
      status: 'DISPUTE_LOST',
      reason: 'COMMERCIAL_DISAGREEMENT',
    }
    const result = transformDispute(raw)

    expect(result.status).toBe('lost')
    expect(result.reason).toBe('product_unacceptable')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a REVERSED chargeback to won', () => {
    const raw: RawAsaasChargeback = {
      id: 'CB-004',
      payment: 'pay_004',
      value: 75.0,
      status: 'REVERSED',
    }
    const result = transformDispute(raw)

    expect(result.status).toBe('won')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})
