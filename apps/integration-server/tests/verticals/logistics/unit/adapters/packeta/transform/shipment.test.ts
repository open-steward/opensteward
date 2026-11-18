import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  parsePacketXml,
  type PacketaPacket,
} from '../../../../../../../src/verticals/logistics/adapters/packeta/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makePacket(overrides: Partial<PacketaPacket> = {}): PacketaPacket {
  return {
    barcode: 'Z1234567890',
    id: 'Z1234567890',
    number: 'ORD-2024-001',
    name: 'Jana',
    surname: 'Nováková',
    company: 'Acme s.r.o.',
    email: 'jana@example.cz',
    phone: '+420 123 456 789',
    street: 'Václavské náměstí',
    houseNumber: '1',
    city: 'Prague',
    zip: '110 00',
    country: 'CZ',
    addressId: '12345',
    weight: '2.5',
    cod: '1500',
    currency: 'CZK',
    carrierCode: 'packeta_hd',
    statusCode: '4',
    statusText: 'In transit',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T08:00:00Z',
    eshop: 'my-eshop',
    ...overrides,
  }
}

describe('transformShipment', () => {
  it('maps barcode to id and trackingNumber', () => {
    const raw = makePacket({ barcode: 'Z9876543210' })
    const result = transformShipment(raw)

    expect(result.id).toBe('Z9876543210')
    expect(result.trackingNumber).toBe('Z9876543210')
  })

  it('falls back to id field when barcode is absent', () => {
    const raw = makePacket({ barcode: undefined, id: 'ZFALLBACK' })
    const result = transformShipment(raw)

    expect(result.id).toBe('ZFALLBACK')
  })

  it('maps statusCode "4" (in transit) to IN_TRANSIT', () => {
    const result = transformShipment(makePacket({ statusCode: '4' }))
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps statusCode "5" (delivered) to DELIVERED', () => {
    const result = transformShipment(makePacket({ statusCode: '5' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps statusCode "1" (pending) to PENDING', () => {
    const result = transformShipment(makePacket({ statusCode: '1' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps statusCode "2" to LABEL_CREATED', () => {
    const result = transformShipment(makePacket({ statusCode: '2' }))
    expect(result.status).toBe('LABEL_CREATED')
  })

  it('maps statusCode "3" to LABEL_CREATED', () => {
    const result = transformShipment(makePacket({ statusCode: '3' }))
    expect(result.status).toBe('LABEL_CREATED')
  })

  it('maps statusCode "7" to OUT_FOR_DELIVERY', () => {
    const result = transformShipment(makePacket({ statusCode: '7' }))
    expect(result.status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps statusCode "6" to RETURNED', () => {
    const result = transformShipment(makePacket({ statusCode: '6' }))
    expect(result.status).toBe('RETURNED')
  })

  it('maps statusCode "8" to CANCELLED', () => {
    const result = transformShipment(makePacket({ statusCode: '8' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps statusCode "9" to EXCEPTION', () => {
    const result = transformShipment(makePacket({ statusCode: '9' }))
    expect(result.status).toBe('EXCEPTION')
  })

  it('maps unknown statusCode to UNKNOWN', () => {
    const result = transformShipment(makePacket({ statusCode: '99' }))
    expect(result.status).toBe('UNKNOWN')
  })

  it('maps undefined statusCode to UNKNOWN', () => {
    const result = transformShipment(makePacket({ statusCode: undefined }))
    expect(result.status).toBe('UNKNOWN')
  })

  it('uses carrierCode as carrierId when present', () => {
    const result = transformShipment(makePacket({ carrierCode: 'packeta_hd' }))
    expect(result.carrierId).toBe('packeta_hd')
  })

  it('falls back to "packeta" when carrierCode is absent', () => {
    const result = transformShipment(makePacket({ carrierCode: undefined }))
    expect(result.carrierId).toBe('packeta')
  })

  it('maps reference from the number field', () => {
    const result = transformShipment(makePacket({ number: 'ORD-2024-001' }))
    expect(result.reference).toBe('ORD-2024-001')
  })

  it('builds destination address from home-delivery fields', () => {
    const raw = makePacket()
    const result = transformShipment(raw)

    expect(result.destinationAddress?.name).toBe('Jana Nováková')
    expect(result.destinationAddress?.company).toBe('Acme s.r.o.')
    expect(result.destinationAddress?.city).toBe('Prague')
    expect(result.destinationAddress?.postalCode).toBe('110 00')
    expect(result.destinationAddress?.country).toBe('CZ')
    expect(result.destinationAddress?.email).toBe('jana@example.cz')
    expect(result.destinationAddress?.phone).toBe('+420 123 456 789')
  })

  it('concatenates street and houseNumber into street1', () => {
    const result = transformShipment(makePacket({ street: 'Václavské náměstí', houseNumber: '1' }))
    expect(result.destinationAddress?.street1).toBe('Václavské náměstí 1')
  })

  it('sets destinationAddress to undefined when no address fields are present', () => {
    const raw = makePacket({
      street: undefined,
      houseNumber: undefined,
      city: undefined,
      zip: undefined,
      country: undefined,
    })
    const result = transformShipment(raw)
    expect(result.destinationAddress).toBeUndefined()
  })

  it('maps weight string to totalWeight with unit kg', () => {
    const result = transformShipment(makePacket({ weight: '2.5' }))
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('sets totalWeight to undefined when weight is absent', () => {
    const result = transformShipment(makePacket({ weight: undefined }))
    expect(result.totalWeight).toBeUndefined()
  })

  it('maps cod + currency to cost', () => {
    const result = transformShipment(makePacket({ cod: '1500', currency: 'CZK' }))
    expect(result.cost?.amount).toBe(1500)
    expect(result.cost?.currency).toBe('CZK')
  })

  it('sets cost to undefined when currency is absent', () => {
    const result = transformShipment(makePacket({ cod: '1500', currency: undefined }))
    expect(result.cost).toBeUndefined()
  })

  it('parses createdAt into a Date', () => {
    const result = transformShipment(makePacket({ createdAt: '2024-03-01T00:00:00Z' }))
    expect(result.createdAt).toBeInstanceOf(Date)
    expect((result.createdAt as Date).toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('parses updatedAt into a Date', () => {
    const result = transformShipment(makePacket({ updatedAt: '2024-03-02T08:00:00Z' }))
    expect(result.updatedAt).toBeInstanceOf(Date)
    expect((result.updatedAt as Date).toISOString()).toBe('2024-03-02T08:00:00.000Z')
  })

  it('passes the raw packet through as metadata', () => {
    const raw = makePacket()
    const result = transformShipment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces output that satisfies ShipmentSchema', () => {
    const result = transformShipment(makePacket())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})

// ─── parsePacketXml ──────────────────────────────────────────────────────────

describe('parsePacketXml', () => {
  const PACKET_XML = `<?xml version="1.0" encoding="utf-8"?>
<packetStatus>
  <status>ok</status>
  <result>
    <barcode>Z1234567890</barcode>
    <statusCode>4</statusCode>
    <statusText>In transit</statusText>
    <name>Jana</name>
    <surname>Nováková</surname>
    <city>Prague</city>
    <zip>110 00</zip>
    <country>CZ</country>
    <weight>2.5</weight>
    <currency>CZK</currency>
    <createdAt>2024-03-01T00:00:00</createdAt>
  </result>
</packetStatus>`

  it('extracts the barcode field', () => {
    const result = parsePacketXml(PACKET_XML)
    expect(result.barcode).toBe('Z1234567890')
  })

  it('extracts the statusCode field', () => {
    const result = parsePacketXml(PACKET_XML)
    expect(result.statusCode).toBe('4')
  })

  it('extracts recipient name and surname', () => {
    const result = parsePacketXml(PACKET_XML)
    expect(result.name).toBe('Jana')
    expect(result.surname).toBe('Nováková')
  })

  it('extracts city, zip, and country', () => {
    const result = parsePacketXml(PACKET_XML)
    expect(result.city).toBe('Prague')
    expect(result.zip).toBe('110 00')
    expect(result.country).toBe('CZ')
  })

  it('does not set fields that are absent from the XML', () => {
    const xml = `<packetStatus><result><barcode>Z999</barcode></result></packetStatus>`
    const result = parsePacketXml(xml)
    expect(result.cod).toBeUndefined()
    expect(result.email).toBeUndefined()
  })
})
