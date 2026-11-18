import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type NovaPoshtaLabel,
} from '../../../../../../../src/verticals/logistics/adapters/nova-poshta/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<NovaPoshtaLabel> = {}): NovaPoshtaLabel {
  return {
    id: 'label-001',
    shipmentId: 'ship-001',
    number: 'TTN-20240301-001',
    labelUrl: 'https://example.com/label.pdf',
    labelBase64: undefined,
    serviceCode: 'standard',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T08:00:00Z',
    ...overrides,
  }
}

describe('nova-poshta transformLabel', () => {
  it('maps id from raw.id', () => {
    expect(transformLabel(makeLabel()).id).toBe('label-001')
  })

  it('falls back id to shipmentId when id is absent', () => {
    expect(transformLabel(makeLabel({ id: null })).id).toBe('ship-001')
  })

  it('maps shipmentId', () => {
    expect(transformLabel(makeLabel()).shipmentId).toBe('ship-001')
  })

  it('maps trackingNumber from number (TTN)', () => {
    expect(transformLabel(makeLabel()).trackingNumber).toBe('TTN-20240301-001')
  })

  it('hardcodes carrierId as "nova-poshta"', () => {
    expect(transformLabel(makeLabel()).carrierId).toBe('nova-poshta')
  })

  it('maps serviceCode', () => {
    expect(transformLabel(makeLabel()).serviceCode).toBe('standard')
  })

  it('maps format as "PDF" when labelUrl is present', () => {
    expect(transformLabel(makeLabel()).format).toBe('PDF')
  })

  it('omits format when labelUrl is null', () => {
    expect(transformLabel(makeLabel({ labelUrl: null })).format).toBeUndefined()
  })

  it('maps status always as "CREATED"', () => {
    expect(transformLabel(makeLabel()).status).toBe('CREATED')
  })

  it('maps url from labelUrl', () => {
    expect(transformLabel(makeLabel()).url).toBe('https://example.com/label.pdf')
  })

  it('maps base64 from labelBase64', () => {
    const raw = makeLabel({ labelBase64: 'base64encodeddata' })
    expect(transformLabel(raw).base64).toBe('base64encodeddata')
  })

  it('maps createdAt as Date', () => {
    expect(transformLabel(makeLabel()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt as Date', () => {
    expect(transformLabel(makeLabel()).updatedAt).toBeInstanceOf(Date)
  })

  it('passes LabelSchema.parse without throwing', () => {
    expect(() => LabelSchema.parse(transformLabel(makeLabel()))).not.toThrow()
  })
})
