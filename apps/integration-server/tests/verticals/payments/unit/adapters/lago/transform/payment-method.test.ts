import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawLagoPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/lago/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('lago transformPaymentMethod', () => {
  it('maps a gocardless provider to type "bank_account"', () => {
    const raw: RawLagoPaymentMethod = {
      lago_id: 'pm-001',
      external_customer_id: 'ext-cust-001',
      payment_provider_type: 'gocardless',
      provider_method_id: 'gc-method-001',
      is_default: true,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('pm-001')
    expect(result.type).toBe('bank_account')
    expect(result.customerId).toBe('ext-cust-001')
    expect(result.isDefault).toBe(true)
    expect(result.gateway).toBe('lago')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a stripe provider to type "other"', () => {
    const raw: RawLagoPaymentMethod = {
      lago_id: 'pm-002',
      external_customer_id: 'ext-cust-002',
      payment_provider_type: 'stripe',
      provider_method_id: 'pm_stripe123',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('other')
    expect(result.externalId).toBe('pm_stripe123')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
