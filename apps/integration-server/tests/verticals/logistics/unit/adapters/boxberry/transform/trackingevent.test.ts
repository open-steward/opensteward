import { describe, it, expect } from 'vitest'
import {
  mapStatusName,
  parseMskDateTime,
  transformTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/boxberry/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

describe('transformTrackingEvent (boxberry)', () => {
  // One entry of the documented ListStatuses example:
  // https://yandex.ru/support/delivery-boxberry/ru/pages/list-statuses
  const item = { Date: '2024-02-07 13:54:31', Name: 'Выдано' }

  it('maps a documented entry and parses against TrackingEventSchema', () => {
    const out = TrackingEventSchema.parse(transformTrackingEvent(item, 'AAP298792807', 'id-1'))
    expect(out).toMatchObject({
      id: 'id-1',
      shipmentId: 'AAP298792807',
      trackingNumber: 'AAP298792807',
      carrierId: 'boxberry',
      status: 'DELIVERED',
      description: 'Выдано',
    })
    expect(out.occurredAt?.toISOString()).toBe('2024-02-07T10:54:31.000Z')
  })

  it('maps names from the status table exactly, anything else to UNKNOWN', () => {
    // https://yandex.ru/support/delivery-boxberry/ru/pages/status-codes-table
    expect(mapStatusName('Заказ создан в личном кабинете')).toBe('PRE_TRANSIT')
    expect(mapStatusName('Ошибка выгрузки')).toBe('FAILURE')
    expect(mapStatusName('Передано курьеру, курьер позвонит за 30-60 минут до доставки')).toBe(
      'OUT_FOR_DELIVERY',
    )
    expect(mapStatusName('Поступило в пункт выдачи')).toBe('AVAILABLE_FOR_PICKUP')
    expect(mapStatusName('Возвращено в ИМ')).toBe('RETURN_TO_SENDER')
    expect(mapStatusName('Выдан получателю')).toBe('UNKNOWN')
    expect(mapStatusName(null)).toBe('UNKNOWN')
  })

  it('never invents occurredAt from an unparseable Date', () => {
    expect(parseMskDateTime('07.02.2024 13:38')).toBeUndefined()
    expect(parseMskDateTime(undefined)).toBeUndefined()
    expect(transformTrackingEvent({ Name: 'Выдано' }, 'T1').occurredAt).toBeUndefined()
  })
})
