import { describe, it, expect } from 'vitest'
import { transformTrackingEvents } from '../../../../../../../src/verticals/logistics/adapters/boxberry/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

/**
 * The documented ListStatuses example response ("Пример ответа"), verbatim:
 * https://yandex.ru/support/delivery-boxberry/ru/pages/list-statuses
 */
const LIST_STATUSES_EXAMPLE = [
  { Date: '2024-02-07 13:38:13', Name: 'Загружен реестр ИМ' },
  { Date: '2024-02-07 13:40:54', Name: 'Принято к доставке' },
  { Date: '2024-02-07 13:42:55', Name: 'Передано на сортировку' },
  { Date: '2024-02-07 13:44:03', Name: 'Отправлено в город назначения' },
  { Date: '2024-02-07 13:46:46', Name: 'Отправлено в город назначения' },
  { Date: '2024-02-07 13:48:08', Name: 'В городе Получателя' },
  { Date: '2024-02-07 13:50:13', Name: 'Передан на доставку до Пункта выдачи' },
  { Date: '2024-02-07 13:52:35', Name: 'Поступило в пункт выдачи' },
  { Date: '2024-02-07 13:54:31', Name: 'Выдано' },
  { Date: '2024-02-07 13:54:40', Name: 'Готовится к возврату' },
  { Date: '2024-02-07 13:56:11', Name: 'Отправлено в пункт приема' },
  { Date: '2024-02-07 13:58:06', Name: 'Возвращено в пункт приема' },
  { Date: '2024-02-07 14:00:32', Name: 'Возвращено в ИМ' },
]

describe('transformTrackingEvents (boxberry ListStatuses)', () => {
  const events = transformTrackingEvents('AAP298792807', LIST_STATUSES_EXAMPLE)

  it('maps every documented entry, each parsing against TrackingEventSchema', () => {
    expect(events).toHaveLength(13)
    for (const e of events) TrackingEventSchema.parse(e)
  })

  it('reads Date as MSK (GMT+3), as documented', () => {
    expect(events[0]!.occurredAt?.toISOString()).toBe('2024-02-07T10:38:13.000Z')
    expect(events[0]!.createdAt).toBeUndefined()
  })

  it('maps the documented status names', () => {
    expect(events.map((e) => e.status)).toEqual([
      'PRE_TRANSIT',
      'IN_TRANSIT',
      'IN_TRANSIT',
      'IN_TRANSIT',
      'IN_TRANSIT',
      'IN_TRANSIT',
      'IN_TRANSIT',
      'AVAILABLE_FOR_PICKUP',
      'DELIVERED',
      'RETURN_TO_SENDER',
      'RETURN_TO_SENDER',
      'RETURN_TO_SENDER',
      'RETURN_TO_SENDER',
    ])
  })

  it('builds unique deterministic ids from track, Date and Name', () => {
    expect(events[0]!.id).toBe('AAP298792807:2024-02-07 13:38:13:Загружен реестр ИМ')
    expect(new Set(events.map((e) => e.id)).size).toBe(13)
    expect(transformTrackingEvents('AAP298792807', LIST_STATUSES_EXAMPLE).map((e) => e.id)).toEqual(
      events.map((e) => e.id),
    )
  })

  it('suffixes an entry identical in Date and Name to an earlier one', () => {
    const dup = { Date: '2024-02-07 13:44:03', Name: 'Отправлено в город назначения' }
    const out = transformTrackingEvents('T1', [dup, dup])
    expect(out.map((e) => e.id)).toEqual([
      'T1:2024-02-07 13:44:03:Отправлено в город назначения',
      'T1:2024-02-07 13:44:03:Отправлено в город назначения#2',
    ])
  })

  it('returns no events for an empty history (no synthetic event)', () => {
    expect(transformTrackingEvents('T1', [])).toEqual([])
  })
})
