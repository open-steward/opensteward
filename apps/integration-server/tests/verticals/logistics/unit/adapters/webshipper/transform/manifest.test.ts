import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type WebshipperManifest,
} from '../../../../../../../src/verticals/logistics/adapters/webshipper/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

function makeRaw(overrides: Partial<WebshipperManifest> = {}): WebshipperManifest {
  return {
    id: 55,
    type: 'manifests',
    attributes: {
      status: 'submitted',
      carrier_id: 42,
      shipment_ids: [101, 102, 103],
      label_count: 3,
      pdf_link: 'https://webshipper.example/manifests/55.pdf',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T10:00:00Z',
      submitted_at: '2024-03-01T09:00:00Z',
    },
    ...overrides,
  }
}

describe('transformManifest (webshipper)', () => {
  it('maps id to string from raw.id', () => {
    expect(transformManifest(makeRaw()).id).toBe('55')
  })

  it('maps manifestNumber to string from raw.id', () => {
    expect(transformManifest(makeRaw()).manifestNumber).toBe('55')
  })

  it('maps carrierId from attributes.carrier_id', () => {
    expect(transformManifest(makeRaw()).carrierId).toBe('42')
  })

  it('defaults carrierId to webshipper when carrier_id absent', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, carrier_id: null } })
    expect(transformManifest(raw).carrierId).toBe('webshipper')
  })

  it('maps status submitted → SUBMITTED', () => {
    expect(transformManifest(makeRaw()).status).toBe('SUBMITTED')
  })

  it('maps status open → OPEN', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'open' } })
    expect(transformManifest(raw).status).toBe('OPEN')
  })

  it('maps status closed → CLOSED', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'closed' } })
    expect(transformManifest(raw).status).toBe('CLOSED')
  })

  it('maps status accepted → ACCEPTED', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'accepted' } })
    expect(transformManifest(raw).status).toBe('ACCEPTED')
  })

  it('sets status undefined for unknown status', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'pending_review' } })
    expect(transformManifest(raw).status).toBeUndefined()
  })

  it('maps shipmentIds as array of strings', () => {
    const result = transformManifest(makeRaw())
    expect(result.shipmentIds).toEqual(['101', '102', '103'])
  })

  it('sets shipmentIds undefined when empty', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, shipment_ids: [] } })
    expect(transformManifest(raw).shipmentIds).toBeUndefined()
  })

  it('maps labelCount from attributes.label_count', () => {
    expect(transformManifest(makeRaw()).labelCount).toBe(3)
  })

  it('maps submittedAt from attributes.submitted_at', () => {
    expect(transformManifest(makeRaw()).submittedAt).toBeInstanceOf(Date)
  })

  it('falls back submittedAt to updated_at when submitted_at absent', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, submitted_at: null } })
    expect(transformManifest(raw).submittedAt).toBeInstanceOf(Date)
  })

  it('maps createdAt from attributes.created_at', () => {
    expect(transformManifest(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from attributes.updated_at', () => {
    expect(transformManifest(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformManifest(raw).metadata).toBe(raw)
  })

  it('produces output that parses against ManifestSchema', () => {
    expect(() => ManifestSchema.parse(transformManifest(makeRaw()))).not.toThrow()
  })
})
