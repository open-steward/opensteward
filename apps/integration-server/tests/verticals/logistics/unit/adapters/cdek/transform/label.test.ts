import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type CdekPrintResponse,
} from '../../../../../../../src/verticals/logistics/adapters/cdek/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeRaw(overrides: Partial<CdekPrintResponse> = {}): CdekPrintResponse {
  return {
    entity: {
      uuid: 'print-uuid-001',
      orders: [{ order_uuid: 'order-uuid-001', cdek_number: 'CDEK-001' }],
      create_time: '2024-03-01T00:00:00Z',
      url: 'https://api.cdek.ru/v2/print/orders/print-uuid-001.pdf',
    },
    requests: [
      {
        state: 'SUCCESSFUL',
        date_time: '2024-03-01T00:00:00Z',
        errors: [],
      },
    ],
    ...overrides,
  }
}

describe('cdek transformLabel', () => {
  it('maps entity.uuid to id', () => {
    expect(transformLabel(makeRaw()).id).toBe('print-uuid-001')
  })

  it('accepts optional shipmentId parameter', () => {
    expect(transformLabel(makeRaw(), 'order-uuid-001').shipmentId).toBe('order-uuid-001')
  })

  it('hardcodes format to PDF', () => {
    expect(transformLabel(makeRaw()).format).toBe('PDF')
  })

  it('maps SUCCESSFUL request state to CREATED label status', () => {
    expect(transformLabel(makeRaw()).status).toBe('CREATED')
  })

  it('maps INVALID request state to VOIDED label status', () => {
    const result = transformLabel(
      makeRaw({ requests: [{ state: 'INVALID', date_time: '2024-03-01T00:00:00Z', errors: [] }] }),
    )
    expect(result.status).toBe('VOIDED')
  })

  it('maps entity.url to url', () => {
    expect(transformLabel(makeRaw()).url).toBe(
      'https://api.cdek.ru/v2/print/orders/print-uuid-001.pdf',
    )
  })

  it('maps entity.create_time to createdAt as Date', () => {
    expect(transformLabel(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies LabelSchema', () => {
    const result = transformLabel(makeRaw(), 'order-uuid-001')
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('handles missing entity gracefully', () => {
    const result = transformLabel({
      requests: [{ state: 'SUCCESSFUL', date_time: '2024-03-01T00:00:00Z' }],
    })
    expect(result.id).toBeUndefined()
    expect(result.url).toBeUndefined()
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
