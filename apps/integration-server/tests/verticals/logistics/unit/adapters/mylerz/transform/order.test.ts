import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  transformPackageDetails,
  type MylerzPackageRaw,
} from '../../../../../../../src/verticals/logistics/adapters/mylerz/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import { docPackageDetails } from '../fixtures'

function makePackage(overrides: Partial<MylerzPackageRaw> = {}): MylerzPackageRaw {
  return {
    packageNo: 'PKG-001',
    BarCode: 'BC-ABC-123',
    Status: 'Delivered',
    ServiceType: 'EXPRESS',
    ServiceDate: '2024-03-01T00:00:00Z',
    DeliveryCost: 25,
    COD_Value: 150,
    Reference: 'REF-001',
    Customer_Name: 'Ahmed Ali',
    Mobile_No: '+201001234567',
    Address: '10 Tahrir Square',
    City: 'Cairo',
    Zone: 'Cairo Zone',
    WarehouseName: 'WH-CAIRO',
    Pieces: 2,
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (mylerz)', () => {
  it('maps id from BarCode', () => {
    expect(transformOrder(makePackage()).id).toBe('BC-ABC-123')
  })

  it('maps orderNumber from Reference', () => {
    expect(transformOrder(makePackage()).orderNumber).toBe('REF-001')
  })

  it('maps status DELIVERED for "Delivered"', () => {
    expect(transformOrder(makePackage()).status).toBe('DELIVERED')
  })

  it('maps status SHIPPED for "Out for Delivery"', () => {
    expect(transformOrder(makePackage({ Status: 'Out for Delivery' })).status).toBe('SHIPPED')
  })

  it('maps status CANCELLED for "Cancelled"', () => {
    expect(transformOrder(makePackage({ Status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status ON_HOLD for "On Hold"', () => {
    expect(transformOrder(makePackage({ Status: 'On Hold' })).status).toBe('ON_HOLD')
  })

  it('maps status RETURNED for "Returned"', () => {
    expect(transformOrder(makePackage({ Status: 'Returned' })).status).toBe('RETURNED')
  })

  it('defaults status to PENDING for unknown status', () => {
    expect(transformOrder(makePackage({ Status: 'UNKNOWN_STATUS' })).status).toBe('PENDING')
  })

  it('maps warehouseId from WarehouseName', () => {
    expect(transformOrder(makePackage()).warehouseId).toBe('WH-CAIRO')
  })

  it('maps destination address from Customer_Name, Address, City, Zone', () => {
    const result = transformOrder(makePackage())
    expect(result.destinationAddress?.name).toBe('Ahmed Ali')
    expect(result.destinationAddress?.street1).toBe('10 Tahrir Square')
    expect(result.destinationAddress?.city).toBe('Cairo')
    expect(result.destinationAddress?.state).toBe('Cairo Zone')
    expect(result.destinationAddress?.phone).toBe('+201001234567')
  })

  it('maps requestedServiceCode from ServiceType', () => {
    expect(transformOrder(makePackage()).requestedServiceCode).toBe('EXPRESS')
  })

  it('maps totalAmount from COD_Value preferentially', () => {
    expect(transformOrder(makePackage()).totalAmount).toBe(150)
  })

  it('falls back to DeliveryCost when COD_Value absent', () => {
    expect(transformOrder(makePackage({ COD_Value: null })).totalAmount).toBe(25)
  })

  it('maps shippedAt from ServiceDate as Date', () => {
    expect(transformOrder(makePackage()).shippedAt).toBeInstanceOf(Date)
  })

  it('uses pickupOrderCode for orderNumber fallback when Reference absent', () => {
    const result = transformOrder(makePackage({ Reference: null, BarCode: null }), 'PO-CODE-1')
    expect(result.orderNumber).toBe('PO-CODE-1')
  })

  it('passes through metadata as the raw object', () => {
    const raw = makePackage()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces an OrderSchema-valid result', () => {
    expect(() => OrderSchema.parse(transformOrder(makePackage()))).not.toThrow()
  })
})

describe('transformPackageDetails (mylerz)', () => {
  it('maps the documented PackageDetailsResponseDTO and parses as an Order', () => {
    const raw = docPackageDetails('12345678901234')
    const out = OrderSchema.parse(transformPackageDetails(raw, '12345678901234'))
    expect(out).toEqual({
      id: '12345678901234',
      orderNumber: 'sample string 22',
      destinationAddress: {
        name: 'sample string 9',
        phone: 'sample string 11',
        street1: 'sample string 12',
        city: 'sample string 17',
      },
      requestedServiceCode: 'sample string 5',
      notes: 'sample string 2',
      metadata: raw,
    })
  })

  it('invents no status and no amount: neither Status values nor a currency are documented', () => {
    const out = transformPackageDetails(docPackageDetails(), 'X')
    expect(out.status).toBeUndefined()
    expect(out.totalAmount).toBeUndefined()
    expect(out.shippingAmount).toBeUndefined()
  })
})
