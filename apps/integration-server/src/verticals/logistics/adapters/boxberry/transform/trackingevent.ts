/**
 * Boxberry individual TrackingEvent transform.
 *
 * Maps one `ListStatuses` status entry to a canonical TrackingEvent.
 * https://yandex.ru/support/delivery-boxberry/ru/pages/list-statuses
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { BoxberryStatusItem } from './tracking'

/**
 * The status names `ListStatuses` returns, from the column "Наименование
 * статуса в API методах ListStatuses и ListStatusesFull" of Boxberry's status
 * table, with the table's own description in each comment. Names are matched
 * exactly; any other name is UNKNOWN.
 * https://yandex.ru/support/delivery-boxberry/ru/pages/status-codes-table
 */
const STATUS_BY_NAME: Readonly<Record<string, TrackingEventStatus>> = {
  // 1: "Заказ создан, но не добавили в акт."
  'Заказ создан в личном кабинете': 'PRE_TRANSIT',
  // 5: "Заказ добавлен в акт, но еще не был обработан в внутренних ИС Boxberry"
  'Заказ включен в акт. В обработке': 'PRE_TRANSIT',
  // 7: "Заказ добавлен в акт, но в внутренних ИС Boxberry произошла ошибка."
  'Ошибка выгрузки': 'FAILURE',
  // 10: "Заказ успешно создан в внутренних ИС Boxberry."
  'Загружен реестр ИМ': 'PRE_TRANSIT',
  // 76: "Груз промаркирован и принят на отделении Boxberry."
  'Заказ передан на доставку': 'IN_TRANSIT',
  // 77: "Заказ в пути из отделения на терминал."
  'Отправлен на сортировочный терминал': 'IN_TRANSIT',
  // 80: "Груз промаркирован и принят на терминале Boxberry."
  'Принято к доставке': 'IN_TRANSIT',
  // 90: "Заказ готовится к отправке в город назначения."
  'Передано на сортировку': 'IN_TRANSIT',
  // 100: "Груз фактически отправлен в город назначения."
  'Отправлено в город назначения': 'IN_TRANSIT',
  // 110: "Поступил на терминал обработки курьерской доставки."
  'Передано на курьерскую доставку': 'IN_TRANSIT',
  // 115: "Сортировка на терминале обработки курьерской доставки."
  'Обработка на складе курьерской доставки': 'IN_TRANSIT',
  // 120: "Поступил на терминал в городе получателя."
  'В городе Получателя': 'IN_TRANSIT',
  // 125: "Отправлен в пункт выдачи."
  'Передан на доставку до Пункта выдачи': 'IN_TRANSIT',
  // 130: "Заказ поступил на склад и ожидает курьера."
  'Передан на Курьерскую доставку, курьер позвонит за 30-60 минут до доставки': 'IN_TRANSIT',
  // 135: "Курьер забрал заказ и направляется к получателю."
  'Передано курьеру, курьер позвонит за 30-60 минут до доставки': 'OUT_FOR_DELIVERY',
  // 140: "Заказ поступил в пункт выдачи. Готов к получению."
  'Поступило в пункт выдачи': 'AVAILABLE_FOR_PICKUP',
  // 150: "Заказ выдан или частично выдан получателю."
  Выдано: 'DELIVERED',
  // 160: "Заказ готовится на возврат, но по факту находятся в пункте выдачи."
  'Готовится к возврату': 'RETURN_TO_SENDER',
  // 170: "Заказ отправлен на возврат."
  'Отправлено в пункт приема': 'RETURN_TO_SENDER',
  // 180: "Заказ поступил на склад возвратов Boxberry."
  'Возвращено в пункт приема': 'RETURN_TO_SENDER',
  // 190: "Заказ отгружен со склада возвратов Boxberry в Интернет-магазин."
  'Возвращено в ИМ': 'RETURN_TO_SENDER',
}

export function mapStatusName(name: string | null | undefined): TrackingEventStatus {
  return (name && STATUS_BY_NAME[name]) || 'UNKNOWN'
}

/**
 * `Date`: "Дата присвоения статуса в формате ГГГГ-ММ-ДД ЧЧ:ММ:СС Время в
 * часовом поясе МСК (GMT+3)". Read as that wall time at +03:00.
 */
export function parseMskDateTime(value: string | null | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value ?? '')
  if (!m) return undefined
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+03:00`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/**
 * One status entry as a TrackingEvent. `id` is supplied by the caller, which
 * builds it from the parcel and the entry's documented fields.
 */
export function transformTrackingEvent(
  raw: BoxberryStatusItem,
  trackingNumber?: string,
  id?: string,
): TrackingEvent {
  return {
    id,
    shipmentId: trackingNumber || undefined,
    trackingNumber: trackingNumber || undefined,
    carrierId: 'boxberry',
    status: mapStatusName(raw.Name),
    description: raw.Name || undefined,
    occurredAt: parseMskDateTime(raw.Date),
    metadata: { ...raw },
  }
}
