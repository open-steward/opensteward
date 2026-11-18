import type { Order, OrderStatus } from '../../../schema/order'
import type { SFOrderResult, SFContactInfo } from './shipment'
import { toISODate } from '../../shared/transform'

// SF Express re-uses the same order result shape for order operations.
// Re-export the raw type alias for clarity at the call site.
export type { SFOrderResult }

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapOrderStatus(filterResult?: number): OrderStatus {
  switch (filterResult) {
    case 2: return 'AWAITING_SHIPMENT'
    case 3: return 'ON_HOLD'
    default: return 'PENDING'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

function contactToAddress(c: SFContactInfo) {
  return {
    name: c.contact,
    company: c.company,
    city: c.city,
    state: c.province,
    country: c.countryCode as string | undefined,
    phone: c.mobile ?? c.tel,
  }
}

export function transformOrder(raw: SFOrderResult): Order {
  const sender   = raw.contactInfoList?.find((c) => c.contactType === 1)
  const receiver = raw.contactInfoList?.find((c) => c.contactType === 2)

  const trackingNumber = raw.mailNo ?? raw.waybillNoInfoList?.[0]?.waybillNo

  return {
    id: raw.orderId,
    orderNumber: raw.orderId,
    status: mapOrderStatus(raw.filterResult),
    shipmentIds: trackingNumber ? [trackingNumber] : undefined,
    originAddress: sender ? contactToAddress(sender) : undefined,
    destinationAddress: receiver ? contactToAddress(receiver) : undefined,
    orderAt: raw.sendStartTm ? toISODate(raw.sendStartTm) : undefined,
    createdAt: raw.sendStartTm ? toISODate(raw.sendStartTm) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
