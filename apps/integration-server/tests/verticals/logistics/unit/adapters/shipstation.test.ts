import { describe, it, expect } from 'vitest'
import { transformAddress, type SSAddress } from '../../../../../src/verticals/logistics/adapters/shipstation/transform/address'
import { transformOrder, type SSOrder, type SSOrderItem } from '../../../../../src/verticals/logistics/adapters/shipstation/transform/order'
import { transformShipment, type SSShipment } from '../../../../../src/verticals/logistics/adapters/shipstation/transform/shipment'
import { transformLabel } from '../../../../../src/verticals/logistics/adapters/shipstation/transform/label'
import { transformCarrier, type SSCarrier, type SSCarrierService } from '../../../../../src/verticals/logistics/adapters/shipstation/transform/carrier'
import { transformWarehouse, type SSWarehouse } from '../../../../../src/verticals/logistics/adapters/shipstation/transform/warehouse'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeAddress(overrides: Partial<SSAddress> = {}): SSAddress {
  return {
    name: 'Jane Doe',
    company: 'Acme Corp',
    street1: '123 Main St',
    street2: 'Suite 4',
    street3: null,
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    country: 'US',
    phone: '4155551234',
    residential: false,
    addressVerified: 'Address validated successfully',
    ...overrides,
  }
}

function makeOrderItem(overrides: Partial<SSOrderItem> = {}): SSOrderItem {
  return {
    orderItemId: 1001,
    lineItemKey: 'li_001',
    sku: 'WIDGET-001',
    name: 'Blue Widget',
    imageUrl: null,
    weight: { value: 8, units: 'ounces' },
    quantity: 2,
    unitPrice: 12.99,
    taxAmount: 1.04,
    shippingAmount: null,
    warehouseLocation: null,
    productId: 500,
    fulfillmentSku: null,
    adjustment: false,
    upc: null,
    createDate: '2024-01-15T10:00:00Z',
    modifyDate: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<SSOrder> = {}): SSOrder {
  return {
    orderId: 12345,
    orderNumber: 'ORD-001',
    orderKey: 'key_001',
    orderDate: '2024-01-15T10:00:00Z',
    createDate: '2024-01-15T10:00:00Z',
    modifyDate: '2024-01-15T12:00:00Z',
    paymentDate: '2024-01-15T10:05:00Z',
    shipByDate: '2024-01-17T00:00:00Z',
    orderStatus: 'awaiting_shipment',
    customerId: 999,
    customerUsername: 'janedoe',
    customerEmail: 'jane@acme.com',
    billTo: makeAddress(),
    shipTo: makeAddress({ name: 'John Smith' }),
    items: [makeOrderItem()],
    orderTotal: 26.98,
    amountPaid: 26.98,
    taxAmount: 2.08,
    shippingAmount: 5.99,
    customerNotes: 'Please ship ASAP',
    internalNotes: null,
    gift: false,
    giftMessage: null,
    paymentMethod: 'credit_card',
    requestedShippingService: 'Priority Mail',
    carrierCode: 'stamps_com',
    serviceCode: 'usps_priority_mail',
    packageCode: 'package',
    confirmation: 'delivery',
    shipDate: null,
    weight: { value: 16, units: 'ounces' },
    advancedOptions: {
      warehouseId: 42,
      storeId: 10,
      customField1: null,
      customField2: null,
      customField3: null,
      source: null,
    },
    tagIds: null,
    externallyFulfilled: false,
    externallyFulfilledBy: null,
    ...overrides,
  }
}

function makeShipment(overrides: Partial<SSShipment> = {}): SSShipment {
  return {
    shipmentId: 67890,
    orderId: 12345,
    orderKey: 'key_001',
    userId: null,
    orderNumber: 'ORD-001',
    createDate: '2024-01-16T08:00:00Z',
    shipDate: '2024-01-16T08:00:00Z',
    shipmentCost: 9.25,
    insuranceCost: 0,
    trackingNumber: '9205590164917312751089',
    isReturnLabel: false,
    batchNumber: null,
    carrierCode: 'stamps_com',
    serviceCode: 'usps_priority_mail',
    packageCode: 'package',
    confirmation: 'delivery',
    warehouseId: 42,
    voided: false,
    voidDate: null,
    marketplaceNotified: true,
    notifyErrorMessage: null,
    shipTo: makeAddress({ name: 'John Smith' }),
    weight: { value: 16, units: 'ounces' },
    dimensions: { units: 'inches', length: 10, width: 8, height: 4 },
    labelData: 'base64encodedlabeldata==',
    formData: null,
    ...overrides,
  }
}

function makeCarrier(overrides: Partial<SSCarrier> = {}): SSCarrier {
  return {
    name: 'Stamps.com',
    code: 'stamps_com',
    accountNumber: '****1234',
    requiresFundedAccount: true,
    balance: 25.50,
    nickname: null,
    shippingProviderId: 1,
    primary: true,
    ...overrides,
  }
}

function makeWarehouse(overrides: Partial<SSWarehouse> = {}): SSWarehouse {
  return {
    warehouseId: 42,
    warehouseName: 'Main Warehouse',
    originAddress: makeAddress(),
    returnAddress: makeAddress({ name: 'Returns Dept' }),
    createDate: '2024-01-01T00:00:00Z',
    isDefault: true,
    ...overrides,
  }
}

// ─── Address ──────────────────────────────────────────────────────────────────

describe('transformAddress', () => {
  it('maps all canonical fields', () => {
    const raw = makeAddress()
    const result = transformAddress(raw)!

    expect(result.name).toBe('Jane Doe')
    expect(result.company).toBe('Acme Corp')
    expect(result.street1).toBe('123 Main St')
    expect(result.street2).toBe('Suite 4')
    expect(result.city).toBe('San Francisco')
    expect(result.state).toBe('CA')
    expect(result.postalCode).toBe('94105')
    expect(result.country).toBe('US')
    expect(result.phone).toBe('4155551234')
  })

  it('returns undefined for null input', () => {
    expect(transformAddress(null)).toBeUndefined()
    expect(transformAddress(undefined)).toBeUndefined()
  })

  it('handles null optional fields', () => {
    const raw = makeAddress({ company: null, street2: null, phone: null })
    const result = transformAddress(raw)!
    expect(result.company).toBeUndefined()
    expect(result.street2).toBeUndefined()
    expect(result.phone).toBeUndefined()
  })
})

// ─── Order ────────────────────────────────────────────────────────────────────

describe('transformOrder', () => {
  it('maps all canonical fields', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)

    expect(result.id).toBe('12345')
    expect(result.status).toBe('AWAITING_SHIPMENT')
    expect(result.orderNumber).toBe('ORD-001')
    expect(result.customerId).toBe('999')
    expect(result.warehouseId).toBe('42')
    expect(result.destinationAddress).toBeDefined()
    expect(result.destinationAddress!.name).toBe('John Smith')
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].sku).toBe('WIDGET-001')
    expect(result.lineItems![0].unitAmount).toBe(12.99)
    expect(result.lineItems![0].quantity).toBe(2)
    expect(result.totalAmount).toBe(26.98)
    expect(result.taxAmount).toBe(2.08)
    expect(result.shippingAmount).toBe(5.99)
    expect(result.notes).toBe('Please ship ASAP')
    expect(result.requestedServiceCode).toBe('Priority Mail')
    expect(result.orderAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('handles null optional fields', () => {
    const raw = makeOrder({
      customerId: null,
      shipTo: null,
      customerNotes: null,
      internalNotes: null,
      requestedShippingService: null,
      serviceCode: null,
      advancedOptions: null,
      items: [],
    })
    const result = transformOrder(raw)
    expect(result.customerId).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.notes).toBeUndefined()
    expect(result.requestedServiceCode).toBeUndefined()
    expect(result.warehouseId).toBeUndefined()
    expect(result.lineItems).toBeUndefined()
  })

  it('maps order status values', () => {
    const cases: [string, string][] = [
      ['awaiting_payment', 'PENDING'],
      ['awaiting_shipment', 'AWAITING_SHIPMENT'],
      ['pending_fulfillment', 'PROCESSING'],
      ['shipped', 'SHIPPED'],
      ['on_hold', 'ON_HOLD'],
      ['cancelled', 'CANCELLED'],
      ['rejected_fulfillment', 'CANCELLED'],
    ]
    for (const [input, expected] of cases) {
      const result = transformOrder(makeOrder({ orderStatus: input }))
      expect(result.status).toBe(expected)
    }
  })

  it('maps line item weight units', () => {
    const item = makeOrderItem({ weight: { value: 2, units: 'pounds' } })
    const result = transformOrder(makeOrder({ items: [item] }))
    expect(result.lineItems![0].weight).toEqual({ value: 2, unit: 'lb' })
  })
})

// ─── Shipment ─────────────────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps all canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('67890')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('9205590164917312751089')
    expect(result.carrierId).toBe('stamps_com')
    expect(result.serviceCode).toBe('usps_priority_mail')
    expect(result.warehouseId).toBe('42')
    expect(result.destinationAddress).toBeDefined()
    expect(result.totalWeight).toEqual({ value: 16, unit: 'oz' })
    expect(result.dimensions).toEqual({ length: 10, width: 8, height: 4, unit: 'in' })
    expect(result.cost).toEqual({ amount: 9.25, currency: 'USD' })
    expect(result.reference).toBe('ORD-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('maps voided shipment to CANCELLED', () => {
    const raw = makeShipment({ voided: true, voidDate: '2024-01-17T00:00:00Z' })
    expect(transformShipment(raw).status).toBe('CANCELLED')
  })

  it('handles null optional fields', () => {
    const raw = makeShipment({
      shipTo: null,
      weight: null,
      dimensions: null,
      warehouseId: null,
      trackingNumber: '',
    })
    const result = transformShipment(raw)
    expect(result.destinationAddress).toBeUndefined()
    expect(result.totalWeight).toBeUndefined()
    expect(result.dimensions).toBeUndefined()
    expect(result.warehouseId).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
  })

  it('handles metric dimensions', () => {
    const raw = makeShipment({
      dimensions: { units: 'centimeters', length: 25, width: 20, height: 10 },
    })
    const result = transformShipment(raw)
    expect(result.dimensions).toEqual({ length: 25, width: 20, height: 10, unit: 'cm' })
  })
})

// ─── Label ────────────────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps all canonical fields', () => {
    const raw = makeShipment()
    const result = transformLabel(raw)

    expect(result.id).toBe('67890')
    expect(result.shipmentId).toBe('67890')
    expect(result.trackingNumber).toBe('9205590164917312751089')
    expect(result.carrierId).toBe('stamps_com')
    expect(result.serviceCode).toBe('usps_priority_mail')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.base64).toBe('base64encodedlabeldata==')
    expect(result.cost).toEqual({ amount: 9.25, currency: 'USD' })
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('maps voided label', () => {
    const raw = makeShipment({ voided: true, voidDate: '2024-01-17T00:00:00Z' })
    const result = transformLabel(raw)
    expect(result.status).toBe('VOIDED')
    expect(result.voidedAt).toBeInstanceOf(Date)
  })

  it('handles null optional fields', () => {
    const raw = makeShipment({ trackingNumber: '', labelData: null })
    const result = transformLabel(raw)
    expect(result.trackingNumber).toBeUndefined()
    expect(result.base64).toBeUndefined()
  })
})

// ─── Carrier ──────────────────────────────────────────────────────────────────

describe('transformCarrier', () => {
  it('maps all canonical fields', () => {
    const raw = makeCarrier()
    const result = transformCarrier(raw)

    expect(result.id).toBe('stamps_com')
    expect(result.name).toBe('Stamps.com')
    expect(result.code).toBe('stamps_com')
    expect(result.isActive).toBe(true)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeCarrier()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('includes services when provided', () => {
    const raw = makeCarrier()
    const services: SSCarrierService[] = [
      { carrierCode: 'stamps_com', code: 'usps_priority_mail', name: 'USPS Priority Mail', domestic: true, international: false },
      { carrierCode: 'stamps_com', code: 'usps_first_class_mail', name: 'USPS First-Class Mail', domestic: true, international: false },
    ]
    const result = transformCarrier(raw, services)
    expect(result.services).toHaveLength(2)
    expect(result.services![0].code).toBe('usps_priority_mail')
    expect(result.services![0].name).toBe('USPS Priority Mail')
  })

  it('omits services when not provided', () => {
    const raw = makeCarrier()
    const result = transformCarrier(raw)
    expect(result.services).toBeUndefined()
  })
})

// ─── Warehouse ────────────────────────────────────────────────────────────────

describe('transformWarehouse', () => {
  it('maps all canonical fields', () => {
    const raw = makeWarehouse()
    const result = transformWarehouse(raw)

    expect(result.id).toBe('42')
    expect(result.name).toBe('Main Warehouse')
    expect(result.address).toBeDefined()
    expect(result.address!.name).toBe('Jane Doe')
    expect(result.isActive).toBe(true)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeWarehouse()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })

  it('handles null address', () => {
    const raw = makeWarehouse({ originAddress: null })
    const result = transformWarehouse(raw)
    expect(result.address).toBeUndefined()
  })
})
