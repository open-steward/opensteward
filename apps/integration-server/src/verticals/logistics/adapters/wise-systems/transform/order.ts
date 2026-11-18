import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'
import type { WiseSystemsTask } from './shipment'

function mapOrderStatus(status: number | null | undefined): OrderStatus {
  switch (status) {
    case 0: return 'PENDING'
    case 1: return 'PROCESSING'
    case 2: return 'SHIPPED'
    case 3: return 'DELIVERED'
    default: return 'unknown'
  }
}

export function transformOrder(raw: WiseSystemsTask): Order {
  const props = raw.props ?? {}
  return {
    id: raw.id,
    status: mapOrderStatus(raw.status ?? undefined),
    orderNumber: (props.reference as string | undefined) ?? raw.id,
    destinationAddress: toAddress(raw.location ?? raw.destination ?? undefined),
    originAddress: toAddress(raw.origin ?? undefined),
    notes: (props.notes as string | undefined) ?? undefined,
    shippedAt: toISODate(raw.updated_at),
    deliveredAt: toISODate(props.completed_at ?? undefined),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
