import type { Order, OrderStatus } from '../../../schema/order'
import { destinationAddress, originAddress, text } from './address'
import type { PochtaRussiaShipment } from './shipment'

/**
 * A заказ in a партия. The specification titles the list of these records
 * "Запрос данных о заказах в партии" (GET /1.0/batch/{name}/shipment) and the
 * lookup "Поиск заказа в партии по внутреннему id" (GET /1.0/shipment/{id}):
 * the same documented record that backs Shipment.
 * https://otpravka.pochta.ru/static/views/specification/batches-get_info_about_orders_in_batch.html
 * https://otpravka.pochta.ru/static/views/specification/batches-find_order_by_id.html
 */
export type PochtaRussiaOrder = PochtaRussiaShipment

/**
 * `last-oper-type` values from the specification's enum page
 * (https://otpravka.pochta.ru/static/views/specification/enums-base-last-oper-type.html)
 * with an unambiguous order-lifecycle meaning. Everything else is 'unknown'.
 */
const LAST_OPER_STATUS: Record<string, OrderStatus> = {
  ACCEPTING: 'SHIPPED', // "Прием"
  PROCESSING: 'SHIPPED', // "Обработка"
  GIVING: 'DELIVERED', // "Вручение"
  RETURNING: 'RETURNED', // "Возврат"
  CANCELLATION: 'CANCELLED', // "Отмена"
}

function mapOrderStatus(lastOperType: string | null | undefined): OrderStatus {
  return (lastOperType && LAST_OPER_STATUS[lastOperType]) || 'unknown'
}

export function transformOrder(raw: PochtaRussiaOrder): Order {
  const id = raw.id != null ? String(raw.id) : undefined
  return {
    id,
    status: mapOrderStatus(raw['last-oper-type']),
    // "order-num - Строка (Опционально) Номер заказа. Внешний идентификатор
    // заказа, который формируется отправителем"
    orderNumber: text(raw['order-num']),
    // The order is this отправление: getShipment reads the same id.
    shipmentIds: id !== undefined ? [id] : undefined,
    originAddress: originAddress(raw),
    destinationAddress: destinationAddress(raw),
    metadata: raw as Record<string, unknown>,
  }
}
