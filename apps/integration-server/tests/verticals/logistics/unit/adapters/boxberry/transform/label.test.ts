import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  transformLabelUrl,
  transformParcelStoryLabel,
  type BoxberryLabelResponse,
} from '../../../../../../../src/verticals/logistics/adapters/boxberry/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabelResponse(overrides: Partial<BoxberryLabelResponse> = {}): BoxberryLabelResponse {
  return {
    track: 'BBX123456789',
    label: 'https://api.boxberry.ru/label/BBX123456789.pdf',
    ...overrides,
  }
}

describe('transformLabel (boxberry)', () => {
  it('maps id and shipmentId and trackingNumber from track', () => {
    const result = transformLabel(makeLabelResponse())
    expect(result.id).toBe('BBX123456789')
    expect(result.shipmentId).toBe('BBX123456789')
    expect(result.trackingNumber).toBe('BBX123456789')
  })

  it('sets carrierId to boxberry', () => {
    expect(transformLabel(makeLabelResponse()).carrierId).toBe('boxberry')
  })

  it('sets format to PDF', () => {
    expect(transformLabel(makeLabelResponse()).format).toBe('PDF')
  })

  it('sets status to CREATED', () => {
    expect(transformLabel(makeLabelResponse()).status).toBe('CREATED')
  })

  it('maps url from label', () => {
    expect(transformLabel(makeLabelResponse()).url).toContain('BBX123456789.pdf')
  })

  it('passes metadata as original raw object', () => {
    const raw = makeLabelResponse()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles null track gracefully', () => {
    const result = transformLabel(makeLabelResponse({ track: null }))
    expect(result.id).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
  })

  it('produces output that parses against LabelSchema', () => {
    expect(() => LabelSchema.parse(transformLabel(makeLabelResponse()))).not.toThrow()
  })
})

describe('transformLabelUrl (boxberry)', () => {
  it('maps url and trackingNumber from arguments', () => {
    const result = transformLabelUrl('https://api.boxberry.ru/label/BBX999.pdf', 'BBX999')
    expect(result.url).toContain('BBX999.pdf')
    expect(result.trackingNumber).toBe('BBX999')
    expect(result.id).toBe('BBX999')
    expect(result.carrierId).toBe('boxberry')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
  })

  it('produces output that parses against LabelSchema', () => {
    const result = transformLabelUrl('https://api.boxberry.ru/label/BBX999.pdf', 'BBX999')
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})

describe('transformParcelStoryLabel (boxberry)', () => {
  // The documented ParselStory example row:
  // https://yandex.ru/support/delivery-boxberry/ru/pages/parcel-story
  const row = {
    track: 'AAP103449258',
    label:
      'http://api.boxberry.ru/parcel-files/barcodes?parcel_id=103449258&token=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    date: '2020.05.05 18:54:56',
    send: false,
    barcode: '0000309670026',
    imid: '1533187444',
  }

  it('maps the row to a PDF label with its URL, and parses', () => {
    const out = LabelSchema.parse(transformParcelStoryLabel(row))
    expect(out.id).toBe('AAP103449258')
    expect(out.shipmentId).toBe('AAP103449258')
    expect(out.trackingNumber).toBe('AAP103449258')
    expect(out.format).toBe('PDF')
    expect(out.url).toBe(row.label)
    expect(out.status).toBeUndefined()
  })

  it('is no label when the row has no absolute label URL or no track', () => {
    expect(transformParcelStoryLabel({ ...row, label: '' })).toBeUndefined()
    expect(transformParcelStoryLabel({ ...row, label: 'parcel-files/x' })).toBeUndefined()
    expect(transformParcelStoryLabel({ ...row, track: '' })).toBeUndefined()
  })
})
