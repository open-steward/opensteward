import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, parseDecimal } from '../../shared/transform'
import { transformCustomerAddress, type BoxberryAddress } from './address'
import { BOXBERRY_CURRENCY } from '../constants'

/**
 * Raw Boxberry order/shipment as returned by getOrderInfoByTrack or
 * getOrderInfoByOrderId.
 */
export interface BoxberryShipment {
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

/**
 * One row of `ParselStory` ("Список трекинг-кодов посылок с расширенной
 * информацией ... Позволяет получить список созданных посылок в ЛК ИМ"). The
 * documented response fields, and only those:
 *
 *   track   string  "Трекинг код посылки"
 *   label   string  "Ссылка на скачивание pdf файла с этикетками"
 *   date    string  "Дата создания посылки в формате YYYY.MM.DD HH:MM:SS"
 *   send    bool    "Признак проведения посылки в акт"
 *   barcode string  "Штрих код посылки"
 *   imid    string  "Номер заказа, присвоенный ИМ"
 *
 * https://yandex.ru/support/delivery-boxberry/ru/pages/parcel-story
 */
export interface BoxberryParcelStoryItem {
  track?: string | null
  label?: string | null
  date?: string | null
  send?: boolean | null
  barcode?: string | null
  imid?: string | null
}

/** `label` as an absolute http(s) URL, or undefined. */
export function parcelStoryLabelUrl(label: string | null | undefined): string | undefined {
  return typeof label === 'string' && /^https?:\/\//i.test(label) ? label : undefined
}

function mapBoxberryStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = String(status).toLowerCase()
  // Boxberry status codes/names are descriptive Russian strings; map common
  // numeric/keyword patterns to canonical values.
  if (s === '1' || s.includes('создан') || s.includes('created')) return 'LABEL_CREATED'
  if (s === '2' || s.includes('принят') || s.includes('accepted')) return 'PENDING'
  if (s === '3' || s.includes('транзит') || s.includes('transit')) return 'IN_TRANSIT'
  if (s === '4' || s.includes('доставк') || s.includes('delivery')) return 'OUT_FOR_DELIVERY'
  if (s === '5' || s.includes('выдан') || s.includes('delivered') || s.includes('получен')) return 'DELIVERED'
  if (s === '6' || s.includes('возврат') || s.includes('return')) return 'RETURNED'
  if (s === '7' || s.includes('отмен') || s.includes('cancel')) return 'CANCELLED'
  if (s.includes('ошибк') || s.includes('error') || s.includes('exception')) return 'EXCEPTION'
  return 'UNKNOWN'
}

export function transformShipment(raw: BoxberryShipment): Shipment {
  const trackingNumber = raw.track ?? undefined
  const weightKg = parseDecimal(raw.weight)
  const cost = parseDecimal(raw.delivery_sum ?? raw.price)

  return {
    id: raw.order_id ?? trackingNumber,
    status: mapBoxberryStatus(raw.status ?? raw.status_name),
    trackingNumber,
    carrierId: 'boxberry',
    destinationAddress: raw.customer ? transformCustomerAddress(raw.customer) : undefined,
    totalWeight: weightKg !== undefined ? toWeight(weightKg, 'kg') : undefined,
    labelUrl: raw.label ?? undefined,
    cost: cost !== undefined
      ? { amount: cost, currency: BOXBERRY_CURRENCY }
      : undefined,
    createdAt: toISODate(raw.date ?? raw.date_start),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * A `ParselStory` row as a Shipment. The row carries no status, cost, weight
 * or address, so none is set. `date` has no documented time zone for this
 * method, so it is kept in metadata and not turned into `createdAt`.
 */
export function transformParcelStoryShipment(raw: BoxberryParcelStoryItem): Shipment {
  const track = raw.track || undefined
  return {
    id: track,
    trackingNumber: track,
    carrierId: 'boxberry',
    reference: raw.imid || undefined,
    labelUrl: parcelStoryLabelUrl(raw.label),
    metadata: { ...raw },
  }
}
