import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawPagarmeBalanceOperation,
} from '../../../../../../../src/verticals/payments/adapters/pagarme/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('pagarme transformBalanceTransaction', () => {
  it('maps a payable operation to a charge balance transaction', () => {
    const raw: RawPagarmeBalanceOperation = {
      id: 'op_001',
      type: 'payable',
      amount: 10000,
      fee: 250,
      status: 'waiting_funds',
      balance_amount: 9750,
      balance_old_amount: 0,
      movement_object: {
        object: 'payable',
        id: 'mv_1',
        charge_id: 'ch_abc',
        gateway_id: 'gw_99',
        created_at: '2024-03-01T00:00:00Z',
      },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('op_001')
    expect(result.externalId).toBe('op_001')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('BRL')
    expect(result.fee).toBe(250)
    expect(result.net).toBe(9750)
    expect(result.sourceId).toBe('mv_1')
    expect(result.sourceType).toBe('payable')
    expect(result.gateway).toBe('pagarme')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps refund type to refund', () => {
    const raw: RawPagarmeBalanceOperation = {
      id: 'op_ref',
      type: 'refund',
      amount: -5000,
      created_at: '2024-03-02T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.amount).toBe(-5000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps chargeback_refund type to refund', () => {
    const raw: RawPagarmeBalanceOperation = {
      id: 'op_cbr',
      type: 'chargeback_refund',
      amount: -8000,
      created_at: '2024-03-03T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps transfer type to transfer', () => {
    const raw: RawPagarmeBalanceOperation = {
      id: 'op_trf',
      type: 'transfer',
      amount: 30000,
      created_at: '2024-03-04T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('transfer')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps anticipation and fee_collection to fee', () => {
    const anti: RawPagarmeBalanceOperation = {
      id: 'op_ant',
      type: 'anticipation',
      amount: -500,
      created_at: '2024-03-05T00:00:00Z',
    }
    const fee: RawPagarmeBalanceOperation = {
      id: 'op_fee',
      type: 'fee_collection',
      amount: -100,
      created_at: '2024-03-05T00:00:00Z',
    }
    expect(transformBalanceTransaction(anti).type).toBe('fee')
    expect(transformBalanceTransaction(fee).type).toBe('fee')
    expect(() => BalanceTransactionSchema.parse(transformBalanceTransaction(anti))).not.toThrow()
    expect(() => BalanceTransactionSchema.parse(transformBalanceTransaction(fee))).not.toThrow()
  })

  it('maps chargeback to dispute', () => {
    const raw: RawPagarmeBalanceOperation = {
      id: 'op_cb',
      type: 'chargeback',
      amount: -7500,
      created_at: '2024-03-06T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('dispute')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('computes net as amount minus fee', () => {
    const raw: RawPagarmeBalanceOperation = {
      id: 'op_net',
      type: 'payable',
      amount: 20000,
      fee: 400,
      created_at: '2024-03-07T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.fee).toBe(400)
    expect(result.net).toBe(19600)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('falls back to charge_id when movement_object has no id', () => {
    const raw: RawPagarmeBalanceOperation = {
      id: 'op_chid',
      type: 'payable',
      amount: 5000,
      movement_object: {
        charge_id: 'ch_fallback',
      },
      created_at: '2024-03-08T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.sourceId).toBe('ch_fallback')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
