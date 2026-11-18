import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  transformOrderDetails,
  transformOrderStatus,
  type NovaPoshtaOrderDetails,
  type NovaPoshtaOrderStatus,
  type NovaPoshtaFulfillmentOrder,
} from '../../../../../../../src/verticals/logistics/adapters/nova-poshta/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(
  overrides: Partial<NovaPoshtaFulfillmentOrder> = {},
): NovaPoshtaFulfillmentOrder {
  return {
    documentId: 'DOC-2024-001',
    externalNumber: 'EXT-2024-001',
    status: 'Processing',
    statusTime: '2024-03-01T06:00:00Z',
    destWarehouse: 'WH-001',
    additionalInfo: 'Priority order',
    deliveryType: 'standard',
    waybilNumber: 'TTN-20240301-001',
    details: [
      {
        objectId: 'item-1',
        sku: 'SKU-001',
        measureUnitName: 'Widget',
        plannedQuantity: 5,
        actualQuantity: 5,
        quantity: 5,
        price: 200,
        sum: 1000,
        condition: 'New',
        series: 'A',
      },
    ],
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T08:00:00Z',
    ...overrides,
  }
}

describe('nova-poshta transformOrder', () => {
  it('maps id from documentId', () => {
    expect(transformOrder(makeOrder()).id).toBe('DOC-2024-001')
  })

  it('maps orderNumber from externalNumber', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('EXT-2024-001')
  })

  it('maps status "Processing" → PROCESSING', () => {
    expect(transformOrder(makeOrder()).status).toBe('PROCESSING')
  })

  it('maps status "Created" → PENDING', () => {
    expect(transformOrder(makeOrder({ status: 'Created' })).status).toBe('PENDING')
  })

  it('maps status "Shipped" → SHIPPED', () => {
    expect(transformOrder(makeOrder({ status: 'Shipped' })).status).toBe('SHIPPED')
  })

  it('maps status "Delivered" → DELIVERED', () => {
    expect(transformOrder(makeOrder({ status: 'Delivered' })).status).toBe('DELIVERED')
  })

  it('maps status "Cancelled" → CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status "Returned" → RETURNED', () => {
    expect(transformOrder(makeOrder({ status: 'Returned' })).status).toBe('RETURNED')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformOrder(makeOrder({ status: 'Mystery' })).status).toBe('UNKNOWN')
  })

  it('maps warehouseId from destWarehouse', () => {
    expect(transformOrder(makeOrder()).warehouseId).toBe('WH-001')
  })

  it('maps shipmentIds from waybilNumber', () => {
    expect(transformOrder(makeOrder()).shipmentIds).toEqual(['TTN-20240301-001'])
  })

  it('omits shipmentIds when waybilNumber is absent', () => {
    expect(transformOrder(makeOrder({ waybilNumber: null })).shipmentIds).toBeUndefined()
  })

  it('maps requestedServiceCode from deliveryType', () => {
    expect(transformOrder(makeOrder()).requestedServiceCode).toBe('standard')
  })

  it('maps notes from additionalInfo', () => {
    expect(transformOrder(makeOrder()).notes).toBe('Priority order')
  })

  it('maps lineItems from details', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].sku).toBe('SKU-001')
    expect(result.lineItems![0].quantity).toBe(5)
    expect(result.lineItems![0].unitAmount).toBe(200)
    expect(result.lineItems![0].totalAmount).toBe(1000)
  })

  it('maps shippedAt when status is shipped', () => {
    const result = transformOrder(makeOrder({ status: 'shipped' }))
    expect(result.shippedAt).toBeInstanceOf(Date)
  })

  it('maps deliveredAt when status is delivered', () => {
    const result = transformOrder(makeOrder({ status: 'delivered' }))
    expect(result.deliveredAt).toBeInstanceOf(Date)
  })

  it('maps cancelledAt when status is cancelled', () => {
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.cancelledAt).toBeInstanceOf(Date)
  })

  it('maps createdAt as Date', () => {
    expect(transformOrder(makeOrder()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt as Date', () => {
    expect(transformOrder(makeOrder()).updatedAt).toBeInstanceOf(Date)
  })

  it('passes OrderSchema.parse without throwing', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })
})

/**
 * The documented fulfillment order shapes
 * (https://api-portal.novapost.com/methods/methods/fullfillment.md). Fixtures
 * are the first-party Postman example responses, verbatim.
 */
describe('nova-poshta transformOrderStatus (GET /fulfillment/{countrycode}/v1/orders/status row)', () => {
  const ROWS: NovaPoshtaOrderStatus[] = [
    {
      id: 'ed3bd7e9-545c-4a34-9c58-f17e2b92ed32',
      externalNumber: 'TEST-EXTRA-001',
      destWarehouse: '000063146',
      status: 1,
      statusTime: null,
      waybillNumber: null,
    },
    {
      id: 'dup-test-001',
      externalNumber: 'DUP-TEST-EXT',
      destWarehouse: '000063146',
      status: 13,
      statusTime: '2026-05-10T15:34:00Z',
      waybillNumber: '20450000000001',
    },
  ]

  it('parses with OrderSchema and maps the documented fields', () => {
    const out = ROWS.map((r) => OrderSchema.parse(transformOrderStatus(r)))
    expect(out[0]).toEqual(
      expect.objectContaining({
        id: 'ed3bd7e9-545c-4a34-9c58-f17e2b92ed32',
        orderNumber: 'TEST-EXTRA-001',
      }),
    )
    expect(out[1]!.id).toBe('dup-test-001')
    expect(out[1]!.orderNumber).toBe('DUP-TEST-EXT')
  })

  it('maps the documented statuses: 1 (New) → PENDING, 13 (Incomplete) → ON_HOLD, 10 (Canceled) → CANCELLED', () => {
    expect(OrderSchema.parse(transformOrderStatus(ROWS[0]!)).status).toBe('PENDING')
    expect(OrderSchema.parse(transformOrderStatus(ROWS[1]!)).status).toBe('ON_HOLD')
    expect(OrderSchema.parse(transformOrderStatus({ ...ROWS[0]!, status: 10 })).status).toBe(
      'CANCELLED',
    )
  })

  it('maps an undocumented status value to unknown', () => {
    expect(OrderSchema.parse(transformOrderStatus({ ...ROWS[0]!, status: 7 })).status).toBe(
      'unknown',
    )
  })

  it('keeps destWarehouse (a fulfillment warehouse code, not a division id) out of warehouseId', () => {
    const out = OrderSchema.parse(transformOrderStatus(ROWS[0]!))
    expect(out.warehouseId).toBeUndefined()
    expect(out.metadata).toEqual(expect.objectContaining({ destWarehouse: '000063146' }))
  })

  it('keeps status, statusTime and waybillNumber in metadata, not in canonical fields', () => {
    const out = transformOrderStatus(ROWS[1]!)
    expect(out.metadata).toEqual(
      expect.objectContaining({
        status: 13,
        statusTime: '2026-05-10T15:34:00Z',
        waybillNumber: '20450000000001',
      }),
    )
    expect(out.shipmentIds).toBeUndefined()
    expect(out.updatedAt).toBeUndefined()
    expect(out.orderAt).toBeUndefined()
  })
})

describe('nova-poshta transformOrderDetails (GET /fulfillment/{countrycode}/v1/orders/{id}/details)', () => {
  const EXAMPLE: NovaPoshtaOrderDetails = {
    id: '0123456789',
    externalNumber: 'Num-01',
    details: [
      {
        id: '3279cadb-daeb-4c62-a2fa-8fdb105c85a4',
        objectId: '0102030405',
        sku: 'SKU-001',
        measureUnitName: 'шт',
        plannedQuantity: 4,
        actualQuantity: 0,
        condition: 0,
        series: ['SN-001', 'SN-002', 'SN-003', 'SN-004'],
      },
    ],
  }

  it('parses with OrderSchema: id, orderNumber and line items from the documented fields', () => {
    const out = OrderSchema.parse(transformOrderDetails(EXAMPLE))
    expect(out.id).toBe('0123456789')
    expect(out.orderNumber).toBe('Num-01')
    expect(out.status).toBeUndefined()
    expect(out.lineItems).toEqual([
      { id: '3279cadb-daeb-4c62-a2fa-8fdb105c85a4', sku: 'SKU-001', quantity: 4 },
    ])
  })

  it('an order with no details has no line items', () => {
    const out = OrderSchema.parse(transformOrderDetails({ ...EXAMPLE, details: [] }))
    expect(out.lineItems).toBeUndefined()
  })
})
