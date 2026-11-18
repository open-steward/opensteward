import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/logistics/adapters/cdek/transform/order'
import type { CdekOrder } from '../../../../../../../src/verticals/logistics/adapters/cdek/transform/shipment'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeRaw(overrides: Partial<CdekOrder> = {}): CdekOrder {
  return {
    uuid: 'uuid-001',
    cdek_number: 'CDEK-001',
    number: 'ORD-001',
    tariff_code: 136,
    from_location: {
      city: 'Moscow',
      address: 'Lenina 1',
      country_code: 'RU',
      region: 'Moscow Region',
    },
    to_location: {
      city: 'Saint Petersburg',
      address: 'Nevsky Prospect 10',
      country_code: 'RU',
    },
    sender: {
      name: 'Ivan Ivanov',
      company: 'Sender Co',
      email: 'ivan@example.ru',
      phones: [{ number: '+79001234567' }],
    },
    recipient: {
      name: 'Petr Petrov',
    },
    statuses: [
      {
        code: 'CREATED',
        name: 'Order registered',
        date_time: '2024-03-01T00:00:00Z',
        city: 'Moscow',
      },
    ],
    date_created: '2024-03-01T00:00:00Z',
    date_updated: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('cdek transformOrder', () => {
  it('maps uuid to id', () => {
    expect(transformOrder(makeRaw()).id).toBe('uuid-001')
  })

  it('maps number to orderNumber', () => {
    expect(transformOrder(makeRaw()).orderNumber).toBe('ORD-001')
  })

  it('maps CREATED status to PROCESSING', () => {
    expect(transformOrder(makeRaw()).status).toBe('PROCESSING')
  })

  it('maps tariff_code to requestedServiceCode', () => {
    expect(transformOrder(makeRaw()).requestedServiceCode).toBe('136')
  })

  it('maps from_location city to originAddress city', () => {
    expect(transformOrder(makeRaw()).originAddress?.city).toBe('Moscow')
  })

  it('maps to_location city to destinationAddress city', () => {
    expect(transformOrder(makeRaw()).destinationAddress?.city).toBe('Saint Petersburg')
  })

  it('includes uuid in shipmentIds array', () => {
    expect(transformOrder(makeRaw()).shipmentIds).toContain('uuid-001')
  })

  it('maps date_created to createdAt as Date', () => {
    expect(transformOrder(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies OrderSchema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('maps DELIVERED status to DELIVERED', () => {
    const result = transformOrder(
      makeRaw({
        statuses: [
          { code: 'DELIVERED', name: 'Delivered', date_time: '2024-03-03T00:00:00Z', city: null },
        ],
      }),
    )
    expect(result.status).toBe('DELIVERED')
  })

  it('maps CANCELLED to CANCELLED', () => {
    const result = transformOrder(
      makeRaw({
        statuses: [
          { code: 'CANCELLED', name: 'Cancelled', date_time: '2024-03-03T00:00:00Z', city: null },
        ],
      }),
    )
    expect(result.status).toBe('CANCELLED')
  })

  it('maps RETURNED_TO_SENDER to RETURNED', () => {
    const result = transformOrder(
      makeRaw({
        statuses: [
          {
            code: 'RETURNED_TO_SENDER',
            name: 'Returned',
            date_time: '2024-03-04T00:00:00Z',
            city: null,
          },
        ],
      }),
    )
    expect(result.status).toBe('RETURNED')
  })
})
