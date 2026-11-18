import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { transformAddress, type SSAddress } from './address'

export interface SSWeight {
  value: number
  units: string
}

export interface SSOrderItem {
  orderItemId: number
  lineItemKey: string | null
  sku: string
  name: string
  imageUrl: string | null
  weight: SSWeight | null
  quantity: number
  unitPrice: number
  taxAmount: number | null
  shippingAmount: number | null
  warehouseLocation: string | null
  productId: number | null
  fulfillmentSku: string | null
  adjustment: boolean
  upc: string | null
  createDate: string
  modifyDate: string
  [key: string]: unknown
}

export interface SSAdvancedOptions {
  warehouseId: number | null
  storeId: number | null
  customField1: string | null
  customField2: string | null
  customField3: string | null
  source: string | null
  [key: string]: unknown
}

export interface SSOrder {
  orderId: number
  orderNumber: string
  orderKey: string
  orderDate: string
  createDate: string
  modifyDate: string
  paymentDate: string | null
  shipByDate: string | null
  orderStatus: string
  customerId: number | null
  customerUsername: string | null
  customerEmail: string | null
  billTo: SSAddress | null
  shipTo: SSAddress | null
  items: SSOrderItem[]
  orderTotal: number
  amountPaid: number
  taxAmount: number
  shippingAmount: number
  customerNotes: string | null
  internalNotes: string | null
  gift: boolean
  giftMessage: string | null
  paymentMethod: string | null
  requestedShippingService: string | null
  carrierCode: string | null
  serviceCode: string | null
  packageCode: string | null
  confirmation: string | null
  shipDate: string | null
  weight: SSWeight | null
  advancedOptions: SSAdvancedOptions | null
  tagIds: number[] | null
  externallyFulfilled: boolean
  externallyFulfilledBy: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string): OrderStatus {
  switch (status) {
    case 'awaiting_payment':       return 'PENDING'
    case 'awaiting_shipment':      return 'AWAITING_SHIPMENT'
    case 'pending_fulfillment':    return 'PROCESSING'
    case 'shipped':                return 'SHIPPED'
    case 'on_hold':                return 'ON_HOLD'
    case 'cancelled':              return 'CANCELLED'
    case 'rejected_fulfillment':   return 'CANCELLED'
    default:                       return 'PENDING'
  }
}

function mapWeightUnit(units: string): 'oz' | 'lb' | 'g' | 'kg' {
  switch (units) {
    case 'ounces':  return 'oz'
    case 'pounds':  return 'lb'
    case 'grams':   return 'g'
    default:        return 'oz'
  }
}

function transformLineitem(raw: SSOrderItem): Lineitem {
  return {
    id: String(raw.orderItemId),
    sku: raw.sku || undefined,
    name: raw.name || undefined,
    quantity: raw.quantity,
    unitAmount: raw.unitPrice,
    totalAmount: raw.unitPrice * raw.quantity,
    weight: raw.weight
      ? { value: raw.weight.value, unit: mapWeightUnit(raw.weight.units) }
      : undefined,
  }
}

export function transformOrder(raw: SSOrder): Order {
  return {
    id: String(raw.orderId),
    status: mapOrderStatus(raw.orderStatus),
    orderNumber: raw.orderNumber || undefined,
    customerId: raw.customerId != null ? String(raw.customerId) : undefined,
    warehouseId: raw.advancedOptions?.warehouseId != null
      ? String(raw.advancedOptions.warehouseId)
      : undefined,
    destinationAddress: transformAddress(raw.shipTo),
    lineItems: raw.items?.length ? raw.items.map(transformLineitem) : undefined,
    totalAmount: raw.orderTotal,
    taxAmount: raw.taxAmount,
    shippingAmount: raw.shippingAmount,
    notes: raw.customerNotes ?? raw.internalNotes ?? undefined,
    requestedServiceCode: raw.requestedShippingService ?? raw.serviceCode ?? undefined,
    orderAt: toISODate(raw.orderDate),
    createdAt: toISODate(raw.createDate),
    updatedAt: toISODate(raw.modifyDate),
    metadata: raw as Record<string, unknown>,
  }
}
