import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  transformPackageLabel,
  type SkydropxLabel,
} from '../../../../../../../src/verticals/logistics/adapters/skydropx/transform/label'
import { docPackage, docShipment } from '../fixtures'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<SkydropxLabel> = {}): SkydropxLabel {
  return {
    id: 'lbl-001',
    type: 'labels',
    attributes: {
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T12:00:00Z',
      status: 'CREATED',
      tracking_number: 'TRK9876543',
      label_url: 'https://labels.skydropx.example/lbl-001.pdf',
      rate_id: 42,
    },
    ...overrides,
  }
}

describe('Skydropx transformLabel', () => {
  it('maps JSON:API id to label id', () => {
    const result = transformLabel(makeLabel())
    expect(result.id).toBe('lbl-001')
  })

  it('maps tracking_number to trackingNumber', () => {
    const result = transformLabel(makeLabel())
    expect(result.trackingNumber).toBe('TRK9876543')
  })

  it('always emits PDF format', () => {
    const result = transformLabel(makeLabel())
    expect(result.format).toBe('PDF')
  })

  it('maps CREATED status from attributes.status', () => {
    const result = transformLabel(makeLabel())
    expect(result.status).toBe('CREATED')
  })

  it('maps label_url to url', () => {
    const result = transformLabel(makeLabel())
    expect(result.url).toBe('https://labels.skydropx.example/lbl-001.pdf')
  })

  it('maps createdAt and updatedAt as Date objects', () => {
    const result = transformLabel(makeLabel())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes LabelSchema validation', () => {
    const result = transformLabel(makeLabel())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('maps all label statuses correctly', () => {
    const cases: Array<[string, string]> = [
      ['CREATED', 'CREATED'],
      ['USED', 'USED'],
      ['REFUNDED', 'REFUNDED'],
      ['VOIDED', 'VOIDED'],
    ]
    for (const [status, expected] of cases) {
      const result = transformLabel(
        makeLabel({ attributes: { ...makeLabel().attributes, status } }),
      )
      expect(result.status).toBe(expected)
    }
  })

  it('falls back to CREATED status when attributes.status is unknown', () => {
    const result = transformLabel(
      makeLabel({ attributes: { ...makeLabel().attributes, status: 'UNKNOWN_STATUS' } }),
    )
    expect(result.status).toBe('CREATED')
  })

  it('handles null tracking_number and label_url', () => {
    const result = transformLabel(
      makeLabel({ attributes: { tracking_number: null, label_url: null } }),
    )
    expect(result.trackingNumber).toBeUndefined()
    expect(result.url).toBeUndefined()
  })
})

describe('Skydropx transformPackageLabel (package label_url from GET /api/v1/shipments)', () => {
  it('maps the documented package example and parses as LabelSchema', () => {
    const s = docShipment('s1', ['p1'])
    const out = LabelSchema.parse(transformPackageLabel(docPackage('p1', 's1'), s))
    expect(out).toMatchObject({
      id: 'p1',
      shipmentId: 's1',
      trackingNumber: '234234234233',
      carrierId: 'fedex',
      url: 'https://label.com',
    })
    expect(out.format).toBeUndefined()
    expect(out.status).toBeUndefined()
    expect(out.createdAt?.toISOString()).toBe('2024-09-05T23:13:00.000Z')
  })

  it('a package without a label_url yields no label', () => {
    const s = docShipment('s1', ['p1'])
    expect(transformPackageLabel(docPackage('p1', 's1', { label_url: null }), s)).toBeUndefined()
  })

  it('a relative label_url yields no label (Label.url must be absolute)', () => {
    const s = docShipment('s1', ['p1'])
    expect(
      transformPackageLabel(docPackage('p1', 's1', { label_url: 'label.pdf' }), s),
    ).toBeUndefined()
  })
})
