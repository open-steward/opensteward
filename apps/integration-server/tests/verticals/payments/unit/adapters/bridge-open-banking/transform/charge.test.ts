/**
 * Bridge payment-request transaction -> Charge.
 *
 * Fixture: the `payment-request` example of GET /v3/payment/payment-requests
 * (https://docs.bridgeapi.io/reference/getpaymentrequests.md), verbatim.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  transformPaymentRequest,
  type RawBridgePaymentRequest,
} from '../../../../../../../src/verticals/payments/adapters/bridge-open-banking/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

const REJECTED: RawBridgePaymentRequest = {
  id: '7b36ddbe3a3b4dbbb1fc2a9cb0764131',
  status: 'RJCT',
  status_reason: 'NOAS',
  user: { first_name: 'Thomas', last_name: 'Pichet', external_reference: 'AEF142536-890' },
  sender: {},
  transactions: [
    {
      id: '423076fbc14b4ca58e0c86f7049eb92d',
      status: 'RJCT',
      beneficiary: { iban: 'FR76XXXXXXXXXXXXXXXXXXXX280', company_name: 'ACME' },
      amount: 200,
      end_to_end_id: 'E2E_TEST-123',
      currency: 'EUR',
      label: 'payment label',
      client_reference: 'ABCDE-EEEE_9398848',
    },
  ],
  provider_id: '574,',
  created_at: '2024-12-23T15:35:06.558Z',
  updated_at: '2024-12-23T16:36:03.152Z',
}

const EXECUTED: RawBridgePaymentRequest = {
  id: '5cde82dc416a4e94a08567ed0242f82a',
  status: 'ACSC',
  user: { first_name: 'Thomas', last_name: 'Pichet', external_reference: 'AEF142536-890' },
  sender: { iban: 'FR76XXXXXXXXXXXXXXXXXXXX222', name: 'Thomas Pichet' },
  transactions: [
    {
      id: 'b746dfd13a3f444bbfeff0000170df2e',
      status: 'ACSC',
      beneficiary: { iban: 'FR76XXXXXXXXXXXXXXXXXXXX280', company_name: 'ACME' },
      amount: 200,
      end_to_end_id: 'E2E_TEST-123',
      currency: 'EUR',
      label: 'payment label',
      client_reference: 'ABCDE-EEEE_9398848',
    },
  ],
  provider_id: '574,',
  created_at: '2024-12-23T15:35:06.558Z',
  updated_at: '2024-12-23T16:36:03.152Z',
}

describe('bridge-open-banking transformCharge', () => {
  it('maps an executed (ACSC) transaction to a succeeded charge in minor units', () => {
    const [c] = transformPaymentRequest(EXECUTED)
    const parsed = ChargeSchema.parse(c)
    expect(parsed.id).toBe('5cde82dc416a4e94a08567ed0242f82a:b746dfd13a3f444bbfeff0000170df2e')
    expect(parsed.externalId).toBe(parsed.id)
    expect(parsed.amount).toBe(20000)
    expect(parsed.currency).toBe('EUR')
    expect(parsed.status).toBe('succeeded')
    expect(parsed.description).toBe('payment label')
    expect(parsed.failureCode).toBeNull()
    expect(parsed.gateway).toBe('bridge-open-banking')
    expect(parsed.metadata).toMatchObject({
      payment_request_id: '5cde82dc416a4e94a08567ed0242f82a',
      transaction_id: 'b746dfd13a3f444bbfeff0000170df2e',
      client_reference: 'ABCDE-EEEE_9398848',
      end_to_end_id: 'E2E_TEST-123',
      bridge_status: 'ACSC',
    })
    expect(parsed.createdAt).toBe('2024-12-23T15:35:06.558Z')
    expect(parsed.updatedAt).toBe('2024-12-23T16:36:03.152Z')
  })

  it('maps a rejected (RJCT) transaction to failed with the request status_reason', () => {
    const [c] = transformPaymentRequest(REJECTED)
    const parsed = ChargeSchema.parse(c)
    expect(parsed.status).toBe('failed')
    expect(parsed.failureCode).toBe('NOAS')
  })

  it.each([
    ['CREA', 'pending'],
    ['ACTC', 'pending'],
    ['PDNG', 'pending'],
    ['ACSC', 'succeeded'],
    ['RJCT', 'failed'],
    ['PART', 'unknown'],
  ])('maps status %s to %s', (bridge, canonical) => {
    const tx = { ...EXECUTED.transactions![0]!, status: bridge }
    expect(ChargeSchema.parse(transformCharge(EXECUTED, tx)).status).toBe(canonical)
  })

  it('scales the documented float amount by the currency exponent', () => {
    const tx = { ...EXECUTED.transactions![0]!, amount: 2899.5 }
    expect(ChargeSchema.parse(transformCharge(EXECUTED, tx)).amount).toBe(289950)
  })

  it('emits one charge per transaction of a multi-transaction request', () => {
    const tx0 = EXECUTED.transactions![0]!
    const bulk = { ...EXECUTED, transactions: [tx0, { ...tx0, id: 'second' }] }
    const out = transformPaymentRequest(bulk).map((c) => ChargeSchema.parse(c).id)
    expect(out).toEqual([
      '5cde82dc416a4e94a08567ed0242f82a:b746dfd13a3f444bbfeff0000170df2e',
      '5cde82dc416a4e94a08567ed0242f82a:second',
    ])
  })

  it('upper-cases the currency code', () => {
    const tx = { ...EXECUTED.transactions![0]!, currency: 'eur' }
    expect(ChargeSchema.parse(transformCharge(EXECUTED, tx)).currency).toBe('EUR')
  })

  it('throws rather than inventing a currency or amount', () => {
    const tx = EXECUTED.transactions![0]!
    expect(() => transformCharge(EXECUTED, { ...tx, currency: undefined })).toThrow(/no currency/)
    expect(() => transformCharge(EXECUTED, { ...tx, amount: undefined })).toThrow(/no amount/)
  })
})
