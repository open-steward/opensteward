import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawGCPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/gocardless/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('gocardless transformPaymentMethod (mandate)', () => {
  it('maps a bacs_debit mandate to canonical PaymentMethod', () => {
    const raw: RawGCPaymentMethod = {
      id: 'MD001',
      status: 'active',
      scheme: 'bacs',
      reference: 'MANDATE-REF-001',
      next_possible_charge_date: '2024-02-01',
      payments_require_approval: false,
      links: { customer: 'CU001', customer_bank_account: 'BA001' },
      created_at: '2024-01-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('MD001')
    expect(result.type).toBe('mandate')
    expect(result.brand).toBe('bacs')
    expect(result.customerId).toBe('CU001')
    expect(result.gateway).toBe('gocardless')
    expect(result.metadata.status).toBe('active')
    expect(result.metadata.reference).toBe('MANDATE-REF-001')
    expect(result.metadata.bankAccount).toBe('BA001')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a sepa_core mandate with minimal fields', () => {
    const raw: RawGCPaymentMethod = {
      id: 'MD002',
      scheme: 'sepa_core',
      links: { customer: 'CU002' },
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('mandate')
    expect(result.brand).toBe('sepa_core')
    expect(result.customerId).toBe('CU002')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
