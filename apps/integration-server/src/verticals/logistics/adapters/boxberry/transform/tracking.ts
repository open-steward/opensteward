import type { TrackingEvent } from '../../../schema/trackingevent'
import { transformTrackingEvent } from './trackingevent'

/**
 * One entry of the `ListStatuses` response ("Массив статусов"): `Date`
 * ("Дата присвоения статуса в формате ГГГГ-ММ-ДД ЧЧ:ММ:СС Время в часовом
 * поясе МСК (GMT+3)") and `Name` ("Наименование статуса").
 * https://yandex.ru/support/delivery-boxberry/ru/pages/list-statuses
 */
export interface BoxberryStatusItem {
  Date?: string | null
  Name?: string | null
}

/**
 * A parcel's `ListStatuses` history as TrackingEvents, in response order.
 *
 * Each id is `<track>:<Date>:<Name>`, from documented fields only. The docs'
 * own example repeats a name ("Отправлено в город назначения" twice), so an
 * entry identical in both fields to an earlier one gets `#2`, `#3`, … in
 * response order. An empty history is no events.
 */
export function transformTrackingEvents(
  trackingNumber: string,
  items: readonly BoxberryStatusItem[],
): TrackingEvent[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const base = `${trackingNumber}:${item.Date ?? ''}:${item.Name ?? ''}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return transformTrackingEvent(item, trackingNumber, n === 1 ? base : `${base}#${n}`)
  })
}
