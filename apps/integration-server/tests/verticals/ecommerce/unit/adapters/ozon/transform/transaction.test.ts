/**
 * Ozon finance operation → canonical Transaction.
 *
 * Source: `POST /v3/finance/transaction/list` (FinanceAPI). Response
 * `{ result: { operations: [{ operation_id, operation_type,
 * operation_type_name, operation_date, amount, type, posting: {
 * posting_number, … }, items, services, … }], page_count, row_count } }`
 * from Ozon's official OpenAPI spec:
 *   https://docs.ozon.ru/api/seller/
 *   https://web.archive.org/web/20240531073337/https://docs.ozon.ru/api/seller/swagger.json
 * Path confirmed live 2026-09-13.
 *
 * Operations carry `amount` with no currency and `operation_date` with no
 * zone, so neither is promoted to a canonical field; both stay in metadata.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawOzonFinanceOperation,
} from '../../../../../../../src/verticals/ecommerce/adapters/ozon/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeOperation(overrides: Partial<RawOzonFinanceOperation> = {}): RawOzonFinanceOperation {
  return {
    operation_id: 11401182187840,
    operation_type: 'OperationAgentDeliveredToCustomer',
    operation_type_name: 'Доставка покупателю',
    operation_date: '2024-05-01 00:00:00',
    delivery_charge: 0,
    return_delivery_charge: 0,
    accruals_for_sale: 1390,
    sale_commission: -278,
    amount: 1112,
    type: 'orders',
    posting: {
      delivery_schema: 'FBS',
      order_date: '2024-04-28 10:15:00',
      posting_number: '05708065-0029-1',
      warehouse_id: 18850503335000,
    },
    items: [{ name: 'Клавиатура', sku: 1076001 }],
    services: [],
    ...overrides,
  }
}

describe('ozon transformTransaction', () => {
  it('maps the operation id and the posting it belongs to', () => {
    const txn = transformTransaction(makeOperation())
    expect(txn.id).toBe('11401182187840')
    expect(txn.orderId).toBe('05708065-0029-1')
  })

  it('leaves orderId unset for operations not tied to a posting', () => {
    const txn = transformTransaction(
      makeOperation({ posting: { delivery_schema: '', order_date: '', posting_number: '', warehouse_id: 0 } }),
    )
    expect(txn.orderId).toBeUndefined()
  })

  it('does not invent an amount: operations carry no currency', () => {
    expect(transformTransaction(makeOperation()).amount).toBeUndefined()
  })

  it('does not guess a zone for operation_date, but keeps a zoned value', () => {
    expect(transformTransaction(makeOperation()).processedAt).toBeUndefined()
    expect(transformTransaction(makeOperation({ operation_date: '2024-05-01T00:00:00Z' })).processedAt).toBe(
      '2024-05-01T00:00:00.000Z',
    )
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeOperation()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const parsed = TransactionSchema.parse(transformTransaction(makeOperation()))
    expect(parsed.id).toBe('11401182187840')
  })
})
