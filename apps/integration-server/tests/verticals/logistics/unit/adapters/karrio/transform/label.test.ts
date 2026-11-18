/**
 * A Karrio label is the label on a shipment (schema Shipment: label_url "The
 * shipment label URL", label_type enum PDF | ZPL | PNG | '' | null).
 */
import { describe, it, expect } from 'vitest'
import { transformLabel } from '../../../../../../../src/verticals/logistics/adapters/karrio/transform/label'
import type { KarrioShipment } from '../../../../../../../src/verticals/logistics/adapters/karrio/transform/shipment'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeRaw(overrides: Partial<KarrioShipment> = {}): KarrioShipment {
  return {
    id: 'shp_5a2b',
    object_type: 'shipment',
    status: 'purchased',
    tracking_number: '1Z999AA10123456784',
    carrier_name: 'ups',
    carrier_id: 'ups-main',
    service: 'ups_ground',
    label_url: 'https://karrio.acme.example/v1/shipments/shp_5a2b/label.pdf',
    label_type: 'PDF',
    recipient: { person_name: 'Bob', email: 'bob@example.com' },
    created_at: '2024-03-01 09:30:00.000000+00:00',
    ...overrides,
  }
}

const parse = (raw: KarrioShipment) => LabelSchema.parse(transformLabel(raw))

describe('karrio transformLabel', () => {
  it('parses with LabelSchema', () => {
    expect(() => parse(makeRaw())).not.toThrow()
  })

  it('maps the shipment id to id and shipmentId, and the shipment fields', () => {
    const l = parse(makeRaw())
    expect(l.id).toBe('shp_5a2b')
    expect(l.shipmentId).toBe('shp_5a2b')
    expect(l.trackingNumber).toBe('1Z999AA10123456784')
    expect(l.carrierId).toBe('ups-main')
    expect(l.serviceCode).toBe('ups_ground')
    expect(l.url).toBe('https://karrio.acme.example/v1/shipments/shp_5a2b/label.pdf')
    expect(l.status).toBe('CREATED')
    expect(l.createdAt).toEqual(new Date('2024-03-01T09:30:00.000Z'))
  })

  it.each(['PDF', 'PNG', 'ZPL'] as const)('label_type %s is the format', (t) => {
    expect(parse(makeRaw({ label_type: t })).format).toBe(t)
  })

  it('an empty, null or undocumented label_type gives no format', () => {
    expect(parse(makeRaw({ label_type: '' })).format).toBeUndefined()
    expect(parse(makeRaw({ label_type: null })).format).toBeUndefined()
    expect(parse(makeRaw({ label_type: 'pdf' })).format).toBeUndefined()
  })

  it('no label_url, or a relative one, gives no url and no status', () => {
    expect(parse(makeRaw({ label_url: null })).status).toBeUndefined()
    const rel = parse(makeRaw({ label_url: '/v1/label.pdf' }))
    expect(rel.url).toBeUndefined()
    expect(rel.status).toBeUndefined()
  })

  it('does not dump the whole shipment into metadata', () => {
    const l = parse(makeRaw())
    expect(l.metadata).toBeUndefined()
    expect(JSON.stringify(l)).not.toContain('bob@example.com')
  })
})
