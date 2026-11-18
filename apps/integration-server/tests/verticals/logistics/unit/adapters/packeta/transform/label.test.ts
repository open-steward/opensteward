import { describe, it, expect } from 'vitest'
import { parseLabelXml } from '../../../../../../../src/verticals/logistics/adapters/packeta/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

const BARCODE = 'Z1234567890'
const FORMAT = 'A7 on A4'
const BASE64_PDF = 'JVBERi0xLjQKJ2Pv...'

/** Minimal Packeta label XML response. */
const LABEL_XML = `<?xml version="1.0" encoding="utf-8"?>
<packetLabelPdf>
  <status>ok</status>
  <result>${BASE64_PDF}</result>
</packetLabelPdf>`

describe('parseLabelXml', () => {
  it('sets id and shipmentId to the barcode', () => {
    const result = parseLabelXml(LABEL_XML, BARCODE, FORMAT)

    expect(result.id).toBe(BARCODE)
    expect(result.shipmentId).toBe(BARCODE)
  })

  it('sets trackingNumber to the barcode', () => {
    const result = parseLabelXml(LABEL_XML, BARCODE, FORMAT)

    expect(result.trackingNumber).toBe(BARCODE)
  })

  it('sets carrierId to "packeta"', () => {
    const result = parseLabelXml(LABEL_XML, BARCODE, FORMAT)

    expect(result.carrierId).toBe('packeta')
  })

  it('always sets format to "PDF"', () => {
    const result = parseLabelXml(LABEL_XML, BARCODE, FORMAT)

    expect(result.format).toBe('PDF')
  })

  it('always sets status to "CREATED"', () => {
    const result = parseLabelXml(LABEL_XML, BARCODE, FORMAT)

    expect(result.status).toBe('CREATED')
  })

  it('extracts the base64 content from the <result> tag', () => {
    const result = parseLabelXml(LABEL_XML, BARCODE, FORMAT)

    expect(result.base64).toBe(BASE64_PDF)
  })

  it('stores the requested format in metadata', () => {
    const result = parseLabelXml(LABEL_XML, BARCODE, FORMAT)

    expect((result.metadata as Record<string, unknown>)?.requestedFormat).toBe(FORMAT)
  })

  it('stores the raw XML in metadata', () => {
    const result = parseLabelXml(LABEL_XML, BARCODE, FORMAT)

    expect((result.metadata as Record<string, unknown>)?.raw).toBe(LABEL_XML)
  })

  it('uses the supplied createdAt date when provided', () => {
    const createdAt = new Date('2024-03-01T00:00:00Z')
    const result = parseLabelXml(LABEL_XML, BARCODE, FORMAT, createdAt)

    expect(result.createdAt).toEqual(createdAt)
  })

  it('falls back to a Date close to now when createdAt is omitted', () => {
    const before = new Date()
    const result = parseLabelXml(LABEL_XML, BARCODE, FORMAT)
    const after = new Date()

    expect(result.createdAt).toBeInstanceOf(Date)
    expect((result.createdAt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
    expect((result.createdAt as Date).getTime()).toBeLessThanOrEqual(after.getTime() + 1000)
  })

  it('sets base64 to undefined when the <result> tag is absent', () => {
    const xml = `<packetLabelPdf><status>ok</status></packetLabelPdf>`
    const result = parseLabelXml(xml, BARCODE, FORMAT)

    expect(result.base64).toBeUndefined()
  })

  it('produces output that satisfies LabelSchema', () => {
    const result = parseLabelXml(LABEL_XML, BARCODE, FORMAT, new Date('2024-03-01T00:00:00Z'))
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
