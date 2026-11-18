import type { Label } from '../../../schema/label'
import { parseDecimal, toISODate } from '../../shared/transform'
import type { ShipbubbleShipment } from './shipment'

export interface ShipbubblePayment {
  amount?: number | null
  payment_method?: string | null
  status?: string | null
  currency?: string | null
}

export interface ShipbubbleShipmentWithPayment extends ShipbubbleShipment {
  payment?: ShipbubblePayment | null
}

export function transformLabel(raw: ShipbubbleShipmentWithPayment): Label {
  const payment = raw.payment

  return {
    id: raw.order_id,
    shipmentId: raw.order_id,
    trackingNumber: raw.courier?.tracking_code ?? undefined,
    carrierId: raw.courier?.name ?? undefined,
    status: 'CREATED',
    url: raw.waybill_document ?? undefined,
    cost: payment?.amount !== null && payment?.amount !== undefined
      ? {
          amount: parseDecimal(payment.amount) ?? 0,
          currency: payment.currency ?? 'NGN',
        }
      : undefined,
    createdAt: toISODate(raw.date),
    metadata: raw as Record<string, unknown>,
  }
}
