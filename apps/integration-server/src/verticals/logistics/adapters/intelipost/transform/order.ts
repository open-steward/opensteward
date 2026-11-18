import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import {
  destinationFromEndCustomer,
  nonEmpty,
  originFromOrder,
  sharedVolumeState,
  type IntelipostShipmentOrderRaw,
} from './shipment'

// ─── Status mapping ──────────────────────────────────────────────────────────
//
// GET /shipment_order/{pedido_de_entrega} carries no order-level state (that is
// documented only on GET /shipment_order/read_status/{pedido_envio} as
// `shipment_order_state`, which this adapter does not call). The per-volume
// states are the `shipment_volume_state` values of `GET /tracking/micro_states`;
// the order status is read from the state every volume shares (see sharedVolumeState).

function mapOrderStatus(raw: string | undefined): OrderStatus {
  switch (raw) {
    case 'NEW':
      return 'PENDING'
    case 'CREATED_AT_LOGISTIC_PROVIDER':
    case 'LABEL_CREATED':
      return 'PROCESSING'
    case 'READY_FOR_SHIPPING':
    case 'WAITING_FOR_DROP_OFF':
      return 'AWAITING_SHIPMENT'
    case 'CLARIFY_ADDRESS':
    case 'CLARIFY_LABEL_FAIL':
      return 'ON_HOLD'
    case 'SHIPPED':
    case 'IN_TRANSIT':
    case 'TO_BE_DELIVERED':
      return 'SHIPPED'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'unknown'
  }
}

function lineItems(raw: IntelipostShipmentOrderRaw): Lineitem[] | undefined {
  const items = (raw.shipment_order_volume_array ?? []).flatMap((v) =>
    (v.products ?? []).map((p): Lineitem => ({
      id: p.id != null ? String(p.id) : undefined,
      sku: nonEmpty(p.sku),
      description: nonEmpty(p.description),
      quantity: p.quantity ?? undefined,
    })),
  )
  return items.length > 0 ? items : undefined
}

// ─── Transform ───────────────────────────────────────────────────────────────

/**
 * Canonical Order from an Intelipost shipment order (`GET
 * /shipment_order/{pedido_de_entrega}`). Intelipost has no separate order
 * resource: the shipment order is both the fulfilment order and its shipment,
 * so the Shipment read back by the same `order_number` is this order's
 * shipment.
 *
 * Money is omitted: the response documents `customer_shipping_costs` and the
 * products' `price` but no currency.
 */
export function transformOrder(raw: IntelipostShipmentOrderRaw): Order {
  const id = nonEmpty(raw.order_number)
  return {
    id,
    orderNumber: nonEmpty(raw.sales_order_number),
    status: mapOrderStatus(sharedVolumeState(raw)),
    warehouseId: raw.warehouse_address_id != null ? String(raw.warehouse_address_id) : undefined,
    shipmentIds: id !== undefined ? [id] : undefined,
    originAddress: originFromOrder(raw),
    destinationAddress: destinationFromEndCustomer(raw.end_customer),
    lineItems: lineItems(raw),
    requestedServiceCode:
      raw.delivery_method_id != null ? String(raw.delivery_method_id) : undefined,
    orderAt: toISODate(raw.created_iso),
    shippedAt: toISODate(raw.shipped_date_iso),
    createdAt: toISODate(raw.created_iso),
    updatedAt: toISODate(raw.modified_iso),
    metadata: raw as Record<string, unknown>,
  }
}
