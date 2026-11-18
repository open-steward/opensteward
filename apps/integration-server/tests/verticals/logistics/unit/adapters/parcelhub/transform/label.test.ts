import { describe, it, expect } from 'vitest'
import { transformLabel } from '../../../../../../../src/verticals/logistics/adapters/parcelhub/transform/label'
import { parseXml } from '../../../../../../../src/verticals/logistics/adapters/parcelhub/xml'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'
import { GET_SHIPMENT_XML, CREATE_SHIPMENT_PACKAGE_XML } from '../fixtures'

/** The Get Shipment example with its <Packages> replaced by the Create Shipment package that carries LabelData. */
function shipmentWithLabelData(): string {
  return GET_SHIPMENT_XML.replace(
    /<Packages>[\s\S]*<\/Packages>/,
    `<Packages>${CREATE_SHIPMENT_PACKAGE_XML}</Packages>`,
  )
}

describe('Parcelhub transformLabel (GET /1.0/Shipment/{id})', () => {
  it('maps the documented Get Shipment example to a schema-valid label', () => {
    const label = LabelSchema.parse(transformLabel(parseXml(GET_SHIPMENT_XML)))
    expect(label.id).toBe('2815849279065972')
    expect(label.shipmentId).toBe('2815849279065972')
    expect(label.trackingNumber).toBe('JD0002200000002197')
    expect(label.carrierId).toBe('10')
    expect(label.serviceCode).toBe('388')
    expect(label.format).toBe('ZPL')
    expect(label.status).toBe('CREATED')
    // The example's <Label> has no <LabelData>.
    expect(label.base64).toBeUndefined()
    expect(label.url).toBeUndefined()
    expect(label.metadata?.labelSize).toBe('8')
    expect(label.metadata?.printed).toBe(false)
  })

  it('keeps an int64 ParcelhubShipmentId exact', () => {
    const xml = GET_SHIPMENT_XML.replace(/2815849279065972/g, '12667473463631775')
    expect(transformLabel(parseXml(xml)).id).toBe('12667473463631775')
  })

  it('takes the Base64 LabelData of the package label', () => {
    const label = LabelSchema.parse(transformLabel(parseXml(shipmentWithLabelData())))
    expect(label.base64).toMatch(/^XlhB/)
    expect(label.trackingNumber).toBe('WHISU000124622')
    expect(label.format).toBe('ZPL')
  })

  it('keeps every package label in metadata', () => {
    const two = GET_SHIPMENT_XML.replace(
      /<Packages>[\s\S]*<\/Packages>/,
      `<Packages>${CREATE_SHIPMENT_PACKAGE_XML}${CREATE_SHIPMENT_PACKAGE_XML.replace(/WHISU000124622/g, 'WHISU000124623')}</Packages>`,
    )
    const label = transformLabel(parseXml(two))
    const pkgs = label.metadata?.packageLabels as Array<{ courierTrackingNumber?: string }>
    expect(pkgs.map((p) => p.courierTrackingNumber)).toEqual(['WHISU000124622', 'WHISU000124623'])
  })

  it('maps Deleted=true to VOIDED', () => {
    const xml = GET_SHIPMENT_XML.replace('<Deleted>false</Deleted>', '<Deleted>true</Deleted>')
    expect(LabelSchema.parse(transformLabel(parseXml(xml))).status).toBe('VOIDED')
  })

  it('maps Deleted=false to CREATED and leaves status unset when Deleted is absent', () => {
    expect(transformLabel(parseXml(GET_SHIPMENT_XML)).status).toBe('CREATED')
    const xml = GET_SHIPMENT_XML.replace('<Deleted>false</Deleted>', '')
    expect(xml).not.toContain('<Deleted>')
    expect(LabelSchema.parse(transformLabel(parseXml(xml))).status).toBeUndefined()
  })

  it('takes ShippingInfo/CourierTrackingNumber when no package carries a label', () => {
    const xml = GET_SHIPMENT_XML.replace(
      /<ShippingInfo>(\s*)<CourierTrackingNumber>JD0002200000002197<\/CourierTrackingNumber>/,
      '<ShippingInfo>$1<CourierTrackingNumber>SHIPLEVEL0001</CourierTrackingNumber>',
    ).replace(/<Packages>[\s\S]*<\/Packages>/, '<Packages />')
    expect(xml).toContain('SHIPLEVEL0001')
    const label = LabelSchema.parse(transformLabel(parseXml(xml)))
    expect(label.trackingNumber).toBe('SHIPLEVEL0001')
    expect(label.base64).toBeUndefined()
  })

  it('prefers the tracking number of the package whose label it returns', () => {
    const xml = shipmentWithLabelData().replace(
      /<ShippingInfo>(\s*)<CourierTrackingNumber>JD0002200000002197<\/CourierTrackingNumber>/,
      '<ShippingInfo>$1<CourierTrackingNumber>SHIPLEVEL0001</CourierTrackingNumber>',
    )
    expect(xml).toContain('SHIPLEVEL0001')
    expect(transformLabel(parseXml(xml)).trackingNumber).toBe('WHISU000124622')
  })

  it('decodes XML entities and treats xsi:nil as absent', () => {
    const xml = GET_SHIPMENT_XML.replace(
      '<Account>TEST001</Account>',
      '<Account>A&amp;B &#x41;&#66;</Account>',
    ).replace(/<LabelFormat>ZPL<\/LabelFormat>/, '<LabelFormat xsi:nil="true" />')
    const label = transformLabel(
      parseXml(
        xml.replace(
          '<Shipment ',
          '<Shipment xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ',
        ),
      ),
    )
    expect(label.metadata?.account).toBe('A&B AB')
    expect(label.format).toBeUndefined()
    expect(label.metadata?.labelSize).toBe('8')
  })

  it('maps an undocumented label format to unknown', () => {
    const xml = GET_SHIPMENT_XML.replace(
      '<LabelFormat>ZPL</LabelFormat>',
      '<LabelFormat>XYZ</LabelFormat>',
    )
    expect(LabelSchema.parse(transformLabel(parseXml(xml))).format).toBe('unknown')
  })

  it('leaves zone-less CreationDate and ModifiedTime out of createdAt/updatedAt', () => {
    const label = transformLabel(parseXml(GET_SHIPMENT_XML))
    expect(label.createdAt).toBeUndefined()
    expect(label.updatedAt).toBeUndefined()
    expect(label.metadata?.creationDate).toBe('2025-03-26T14:36:56.073')
    expect(label.metadata?.modifiedTime).toBe('2025-03-26T14:36:56.073')
  })

  it('throws when the shipment has no ParcelhubShipmentId', () => {
    const xml = GET_SHIPMENT_XML.replace(
      /<ParcelhubShipmentId>2815849279065972<\/ParcelhubShipmentId>/,
      '',
    )
    expect(() => transformLabel(parseXml(xml))).toThrow(/ParcelhubShipmentId/)
  })
})
