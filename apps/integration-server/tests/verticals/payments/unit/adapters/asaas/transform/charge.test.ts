import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  untransformCharge,
  type RawAsaasPayment,
} from '../../../../../../../src/verticals/payments/adapters/asaas/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('asaas transformCharge', () => {
  it('maps a CONFIRMED payment to succeeded and sets amountCaptured', () => {
    const raw: RawAsaasPayment = {
      id: 'pay_001',
      dateCreated: '2024-03-01T00:00:00Z',
      customer: 'cus_001',
      status: 'CONFIRMED',
      value: 129.9,
      billingType: 'BOLETO',
      paymentDate: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)

    expect(result.id).toBe('pay_001')
    expect(result.status).toBe('succeeded')
    // 129.9 reais → 12990 centavos
    expect(result.amount).toBe(12990)
    expect(result.currency).toBe('BRL')
    expect(result.amountCaptured).toBe(12990)
    expect(result.captured).toBe(true)
    expect(result.customerId).toBe('cus_001')
    expect(result.gateway).toBe('asaas')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING payment to pending status without capture fields', () => {
    const raw: RawAsaasPayment = {
      id: 'pay_002',
      dateCreated: '2024-03-01T00:00:00Z',
      status: 'PENDING',
      value: 50.0,
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('pending')
    expect(result.captured).toBeUndefined()
    expect(result.amountCaptured).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an OVERDUE payment to failed', () => {
    const raw: RawAsaasPayment = {
      id: 'pay_003',
      dateCreated: '2024-03-01T00:00:00Z',
      status: 'OVERDUE',
      value: 75.0,
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CHARGEBACK_REQUESTED payment to disputed', () => {
    const raw: RawAsaasPayment = {
      id: 'pay_004',
      dateCreated: '2024-03-01T00:00:00Z',
      status: 'CHARGEBACK_REQUESTED',
      value: 200.0,
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('disputed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('includes billingType in metadata', () => {
    const raw: RawAsaasPayment = {
      id: 'pay_005',
      dateCreated: '2024-03-01T00:00:00Z',
      status: 'RECEIVED',
      value: 10.0,
      billingType: 'PIX',
      invoiceNumber: 'INV-001',
    }
    const result = transformCharge(raw)
    expect(result.metadata?.billingType).toBe('PIX')
    expect(result.metadata?.invoiceNumber).toBe('INV-001')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

describe('asaas untransformCharge', () => {
  it('round-trips canonical amount back to reais and includes required billingType', () => {
    const body = untransformCharge({
      amount: 12990,
      customerId: 'cus_001',
      description: 'Test charge',
    })

    // 12990 centavos → 129.9 reais
    expect(body.value).toBeCloseTo(129.9)
    expect(body.customer).toBe('cus_001')
    expect(body.description).toBe('Test charge')
    // billingType defaults to UNDEFINED when not in metadata
    expect(body.billingType).toBe('UNDEFINED')
  })
})
