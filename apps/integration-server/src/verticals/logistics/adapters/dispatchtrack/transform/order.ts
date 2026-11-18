import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'
import type { DispatchTrackServiceOrder } from './shipment'

// ─── Status mapping ────────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'new':
    case 'pending':
      return 'PENDING'
    case 'scheduled':
    case 'assigned':
    case 'processing':
      return 'PROCESSING'
    case 'started':
    case 'in_transit':
    case 'out_for_delivery':
      return 'SHIPPED'
    case 'finished':
    case 'delivered':
    case 'completed':
      return 'DELIVERED'
    case 'unable_to_finish':
    case 'failed':
    case 'exception':
      return 'UNKNOWN'
    case 'returned':
      return 'RETURNED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

// ─── Transform ────────────────────────────────────────────────────────────────

export function transformOrderFromServiceOrder(raw: DispatchTrackServiceOrder): Order {
  const id = raw.id != null ? String(raw.id) : undefined

  const destinationAddress =
    raw.address && typeof raw.address === 'object'
      ? toAddress({
          ...raw.address,
          name: raw.address['name'] ?? raw.contact_name,
          phone: raw.address['phone'] ?? raw.contact_phone,
          email: raw.address['email'] ?? raw.contact_email,
        })
      : raw.contact_name ?? raw.contact_address
        ? {
            name: raw.contact_name ?? undefined,
            street1: raw.contact_address ?? undefined,
            phone: raw.contact_phone ?? undefined,
            email: raw.contact_email ?? undefined,
          }
        : undefined

  const lineItems = ((raw.items as Array<Record<string, unknown>> | null | undefined) ?? [])
    .map((item) => ({
      id: item['id'] != null ? String(item['id']) : undefined,
      sku: item['code'] != null ? String(item['code']) : undefined,
      name: item['description'] != null ? String(item['description']) : undefined,
      quantity:
        typeof item['quantity'] === 'number'
          ? item['quantity']
          : item['quantity'] != null
            ? parseInt(String(item['quantity']), 10) || undefined
            : undefined,
    }))

  return {
    id,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.number ?? raw.identifier ?? id,
    warehouseId: raw.store_code ?? raw.origin ?? raw.place ?? undefined,
    destinationAddress,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    notes: raw.notes ?? raw.description ?? undefined,
    orderAt: toISODate(raw.date) ?? toISODate(raw.created_at),
    shippedAt: toISODate(raw.started_at),
    deliveredAt: toISODate(raw.finished_at) ?? toISODate(raw.delivery_date),
    createdAt: toISODate(raw.created_at) ?? toISODate(raw.date),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
