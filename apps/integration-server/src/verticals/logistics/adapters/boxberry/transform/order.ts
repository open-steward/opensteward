import type { Order } from '../../../schema/order'
import { toISODate, parseDecimal, nonempty } from '../../shared/transform'
import { transformCustomerAddress, type BoxberryAddress } from './address'
import { BOXBERRY_CURRENCY } from '../constants'
import type { BoxberryParcelStoryItem } from './shipment'

/**
 * Raw Boxberry order as returned by getOrderInfoByOrderId / getOrderInfoByTrack.
 */
export interface BoxberryOrderRaw {
  track?: string | null
  order_id?: string | null
  status?: string | null
  status_name?: string | null
  weight?: string | number | null
  price?: string | number | null
  delivery_sum?: string | number | null
  payment_sum?: string | number | null
  date?: string | null
  date_start?: string | null
  date_end?: string | null
  customer?: BoxberryAddress | null
  label?: string | null
  barcode?: string | null
  [key: string]: unknown
}

function mapOrderStatus(
  status: string | null | undefined,
): Order['status'] {
  if (!status) return 'UNKNOWN'
  const s = String(status).toLowerCase()
  if (s === '1' || s.includes('создан') || s.includes('created')) return 'PENDING'
  if (s === '2' || s.includes('принят') || s.includes('accepted')) return 'PROCESSING'
  if (s === '3' || s.includes('транзит') || s.includes('transit')) return 'AWAITING_SHIPMENT'
  if (s === '4' || s.includes('доставк') || s.includes('delivery')) return 'SHIPPED'
  if (s === '5' || s.includes('выдан') || s.includes('delivered') || s.includes('получен')) return 'DELIVERED'
  if (s === '6' || s.includes('возврат') || s.includes('return')) return 'RETURNED'
  if (s === '7' || s.includes('отмен') || s.includes('cancel')) return 'CANCELLED'
  return 'UNKNOWN'
}

export function transformOrder(raw: BoxberryOrderRaw): Order {
  const trackingNumber = raw.track ?? undefined
  const totalAmount = parseDecimal(raw.payment_sum ?? raw.price)
  const shippingAmount = parseDecimal(raw.delivery_sum)

  return {
    id: raw.order_id ?? trackingNumber,
    status: mapOrderStatus(raw.status ?? raw.status_name),
    orderNumber: raw.order_id ?? undefined,
    destinationAddress: raw.customer ? transformCustomerAddress(raw.customer) : undefined,
    shipmentIds: trackingNumber ? nonempty([trackingNumber]) : undefined,
    currency: BOXBERRY_CURRENCY,
    totalAmount: totalAmount !== undefined ? Math.round(totalAmount * 100) : undefined,
    shippingAmount: shippingAmount !== undefined ? Math.round(shippingAmount * 100) : undefined,
    createdAt: toISODate(raw.date ?? raw.date_start),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * A `ParselStory` row as an Order: Boxberry's parcel list is its order list
 * ("Позволяет получить список созданных посылок в ЛК ИМ"), and `imid` is
 * "Номер заказа, присвоенный ИМ". The id is the parcel's `track`, which the
 * docs accept wherever an order is looked up ("ImId — Трек-номер
 * посылки/Номер заказа"). The row carries no status, amounts or currency, so
 * none is set; `date` has no documented time zone, so it stays in metadata.
 * https://yandex.ru/support/delivery-boxberry/ru/pages/parcel-story
 */
export function transformParcelStoryOrder(raw: BoxberryParcelStoryItem): Order {
  const track = raw.track || undefined
  return {
    id: track,
    orderNumber: raw.imid || undefined,
    shipmentIds: track ? [track] : undefined,
    metadata: { ...raw },
  }
}
