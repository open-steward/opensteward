import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { destinationAddress, originAddress, text, type PochtaRussiaFlatAddress } from './address'

/**
 * One отправление as the Otpravka specification documents it for
 * GET /1.0/batch/{name}/shipment ("Запрос данных о заказах в партии") and
 * GET /1.0/shipment/{id} ("Поиск заказа в партии по внутреннему id"):
 * https://otpravka.pochta.ru/static/views/specification/batches-get_info_about_orders_in_batch.html
 * https://otpravka.pochta.ru/static/views/specification/batches-find_order_by_id.html
 *
 * Only the fields the transforms read are typed; the whole record is kept in
 * `metadata`. Addresses are flat `*-to` / `*-from` fields, not objects.
 * The same record backs both Shipment and Order (transform/order.ts).
 */
export interface PochtaRussiaShipment extends PochtaRussiaFlatAddress {
  /** "id - Целое число Внутренний идентификатор отправления" */
  id?: number | null
  /** "barcode - Строка (Опционально) ШПИ" */
  barcode?: string | null
  /** "batch-name - Строка (Опционально) Внешний идентификатор партии заказа" */
  'batch-name'?: string | null
  /** "mail-type - Строка (Опционально) Вид РПО" */
  'mail-type'?: string | null
  /** "mass - Целое число (Опционально) Вес РПО (в граммах)" */
  mass?: number | null
  /** "dimension - Размеры (Опционально) Линейные размеры", each "(сантиметры)" */
  dimension?: { height?: number | null; length?: number | null; width?: number | null } | null
  /** "order-num - Строка (Опционально) Номер заказа" */
  'order-num'?: string | null
  /** "last-oper-type - Строка (Опционально) Тип последней операции из трекинга" */
  'last-oper-type'?: string | null
  /** "total-rate-wo-vat - Целое число Плата всего без НДС (коп)" */
  'total-rate-wo-vat'?: number | null
  /** "total-vat - Целое число Всего НДС (коп)" */
  'total-vat'?: number | null
}

/**
 * `last-oper-type` values from the specification's enum page
 * (https://otpravka.pochta.ru/static/views/specification/enums-base-last-oper-type.html).
 * Only operations with an unambiguous lifecycle meaning are mapped; every
 * other documented value (STORING, HOLDING, CUSTOM_* …) and an absent value
 * are UNKNOWN.
 */
const LAST_OPER_STATUS: Record<string, ShipmentStatus> = {
  ACCEPTING: 'IN_TRANSIT', // "Прием"
  PROCESSING: 'IN_TRANSIT', // "Обработка"
  GIVING: 'DELIVERED', // "Вручение"
  RETURNING: 'RETURNED', // "Возврат"
  TRYING: 'EXCEPTION', // "Неудачная попытка вручения"
  SKIPPING: 'EXCEPTION', // "Невручение"
  LOSS_REGISTRATION: 'EXCEPTION', // "Регистрация утраты"
  CANCELLATION: 'CANCELLED', // "Отмена"
}

function mapStatus(lastOperType: string | null | undefined): ShipmentStatus {
  return (lastOperType && LAST_OPER_STATUS[lastOperType]) || 'UNKNOWN'
}

export function transformShipment(raw: PochtaRussiaShipment): Shipment {
  const d = raw.dimension
  const woVat = raw['total-rate-wo-vat']
  const vat = raw['total-vat']
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapStatus(raw['last-oper-type']),
    trackingNumber: text(raw.barcode),
    carrierId: 'pochta-russia',
    serviceCode: text(raw['mail-type']),
    originAddress: originAddress(raw),
    destinationAddress: destinationAddress(raw),
    totalWeight: typeof raw.mass === 'number' ? { value: raw.mass, unit: 'g' } : undefined,
    dimensions:
      d &&
      typeof d.length === 'number' &&
      typeof d.width === 'number' &&
      typeof d.height === 'number'
        ? { length: d.length, width: d.width, height: d.height, unit: 'cm' }
        : undefined,
    // Both are documented in копейки (kopecks, the rouble's minor unit).
    cost:
      Number.isInteger(woVat) && Number.isInteger(vat)
        ? { amount: (woVat as number) + (vat as number), currency: 'RUB' }
        : undefined,
    reference: text(raw['order-num']),
    metadata: raw as Record<string, unknown>,
  }
}
