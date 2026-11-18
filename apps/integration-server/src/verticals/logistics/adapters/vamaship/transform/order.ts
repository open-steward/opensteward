import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, toAddress, parseDecimal, nonempty } from '../../shared/transform'

export interface VamashipOrderItem {
  id: number | null
  name: string | null
  sku: string | null
  quantity: number | null
  unit_price: number | null
  hsn_code: string | null
  [key: string]: unknown
}

export interface VamashipOrder {
  id: number | null
  order_number: string | null
  status: string | null
  consignee_name: string | null
  consignee_email: string | null
  consignee_phone: string | null
  consignee_address1: string | null
  consignee_address2: string | null
  consignee_city: string | null
  consignee_state: string | null
  consignee_pincode: string | null
  consignee_country: string | null
  shipper_name: string | null
  shipper_address1: string | null
  shipper_address2: string | null
  shipper_city: string | null
  shipper_state: string | null
  shipper_pincode: string | null
  shipper_country: string | null
  items: VamashipOrderItem[] | null
  shipment_ids: number[] | null
  payment_mode: string | null
  invoice_amount: number | null
  shipping_charges: number | null
  total_amount: number | null
  courier_name: string | null
  awb_number: string | null
  warehouse_id: number | null
  order_date: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null): OrderStatus {
  if (!status) return 'PENDING'
  const s = status.toLowerCase()
  if (s === 'new' || s === 'pending') return 'PENDING'
  if (s === 'processing') return 'PROCESSING'
  if (s === 'on_hold' || s === 'hold') return 'ON_HOLD'
  if (s.includes('ready') || s.includes('awaiting') || s.includes('manifest')) return 'AWAITING_SHIPMENT'
  if (s.includes('picked') || s.includes('transit') || s.includes('shipped')) return 'SHIPPED'
  if (s.includes('delivered')) return 'DELIVERED'
  if (s.includes('cancel')) return 'CANCELLED'
  if (s.includes('rto') || s.includes('return')) return 'RETURNED'
  return 'PENDING'
}

export function transformOrder(raw: VamashipOrder): Order {
  const lineItems = (raw.items ?? []).map((item) => ({
    id: item.id != null ? String(item.id) : undefined,
    sku: item.sku ?? undefined,
    name: item.name ?? undefined,
    quantity: item.quantity ?? undefined,
    unitAmount: parseDecimal(item.unit_price),
  }))

  const shipmentIds = nonempty(
    (raw.shipment_ids ?? []).map((s) => String(s)),
  )

  return {
    id: String(raw.id ?? ''),
    status: mapOrderStatus(raw.status),
    orderNumber: raw.order_number ?? undefined,
    warehouseId: raw.warehouse_id != null ? String(raw.warehouse_id) : undefined,
    destinationAddress: toAddress({
      name: raw.consignee_name,
      street1: raw.consignee_address1,
      street2: raw.consignee_address2,
      city: raw.consignee_city,
      state: raw.consignee_state,
      postalCode: raw.consignee_pincode,
      country: raw.consignee_country,
      phone: raw.consignee_phone,
      email: raw.consignee_email,
    }),
    originAddress: toAddress({
      name: raw.shipper_name,
      street1: raw.shipper_address1,
      street2: raw.shipper_address2,
      city: raw.shipper_city,
      state: raw.shipper_state,
      postalCode: raw.shipper_pincode,
      country: raw.shipper_country,
    }),
    shipmentIds,
    lineItems: nonempty(lineItems),
    currency: 'INR',
    subtotalAmount: parseDecimal(raw.invoice_amount),
    shippingAmount: parseDecimal(raw.shipping_charges),
    totalAmount: parseDecimal(raw.total_amount),
    requestedServiceCode: raw.courier_name ?? undefined,
    orderAt: toISODate(raw.order_date),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
