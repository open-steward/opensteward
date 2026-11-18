import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type NovaPoshtaDeclarationGroup,
} from '../../../../../../../src/verticals/logistics/adapters/nova-poshta/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

function makeManifest(
  overrides: Partial<NovaPoshtaDeclarationGroup> = {},
): NovaPoshtaDeclarationGroup {
  return {
    number: 'MAN-2024-001',
    partnerNumber: 'PARTNER-001',
    declarationGroupNumber: 'DG-001',
    status: 'Created',
    statusDateTime: '2024-03-01T00:00:00Z',
    name: 'March Batch 1',
    type: 'standard',
    deliveryPartner: 'nova-poshta',
    divisionId: 'div-001',
    countryCode: 'UA',
    recipientCompanyTin: '12345678',
    recipientCompanyName: 'Receiver Corp',
    recipientCountryCode: 'UA',
    senderCompanyTin: '87654321',
    senderCompanyName: 'Sender Corp',
    senderAddress: '1 Sender St',
    senderCountryCode: 'UA',
    shipmentType: 'cargo',
    grossWeight: 50,
    parcelsAmount: 3,
    actualWeight: 48,
    shipmentAmount: 3,
    totalCost: 1500,
    currencyCode: 'UAH',
    documents: [
      {
        id: 'doc-1',
        mainNumber: 'SHIP-001',
        declarationNumber: 'DECL-001',
        declarationStatus: 'Active',
      },
      {
        id: 'doc-2',
        mainNumber: 'SHIP-002',
        declarationNumber: 'DECL-002',
        declarationStatus: 'Active',
      },
    ],
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T08:00:00Z',
    ...overrides,
  }
}

describe('nova-poshta transformManifest', () => {
  it('maps id from number', () => {
    expect(transformManifest(makeManifest()).id).toBe('MAN-2024-001')
  })

  it('falls back id to declarationGroupNumber when number is absent', () => {
    const result = transformManifest(makeManifest({ number: null }))
    expect(result.id).toBe('DG-001')
  })

  it('hardcodes carrierId as "nova-poshta"', () => {
    expect(transformManifest(makeManifest()).carrierId).toBe('nova-poshta')
  })

  it('maps warehouseId from divisionId', () => {
    expect(transformManifest(makeManifest()).warehouseId).toBe('div-001')
  })

  it('maps manifestNumber from number', () => {
    expect(transformManifest(makeManifest()).manifestNumber).toBe('MAN-2024-001')
  })

  it('falls back manifestNumber to partnerNumber when number is absent', () => {
    const result = transformManifest(makeManifest({ number: null }))
    expect(result.manifestNumber).toBe('PARTNER-001')
  })

  it('maps status "Created" → OPEN', () => {
    expect(transformManifest(makeManifest()).status).toBe('OPEN')
  })

  it('maps status "Submitted" → SUBMITTED', () => {
    expect(transformManifest(makeManifest({ status: 'Submitted' })).status).toBe('SUBMITTED')
  })

  it('maps status "Accepted" → ACCEPTED', () => {
    expect(transformManifest(makeManifest({ status: 'Accepted' })).status).toBe('ACCEPTED')
  })

  it('maps status "Closed" → CLOSED', () => {
    expect(transformManifest(makeManifest({ status: 'Closed' })).status).toBe('CLOSED')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformManifest(makeManifest({ status: 'Mystery' })).status).toBe('UNKNOWN')
  })

  it('maps shipmentIds from document mainNumbers', () => {
    const result = transformManifest(makeManifest())
    expect(result.shipmentIds).toEqual(['SHIP-001', 'SHIP-002'])
  })

  it('falls back shipmentId to doc.id when mainNumber is absent', () => {
    const result = transformManifest(
      makeManifest({
        documents: [{ id: 'doc-1', mainNumber: null }],
      }),
    )
    expect(result.shipmentIds).toEqual(['doc-1'])
  })

  it('maps labelCount from parcelsAmount', () => {
    expect(transformManifest(makeManifest()).labelCount).toBe(3)
  })

  it('maps submittedAt from statusDateTime', () => {
    expect(transformManifest(makeManifest()).submittedAt).toBeInstanceOf(Date)
  })

  it('maps createdAt as Date', () => {
    expect(transformManifest(makeManifest()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt as Date', () => {
    expect(transformManifest(makeManifest()).updatedAt).toBeInstanceOf(Date)
  })

  it('passes ManifestSchema.parse without throwing', () => {
    expect(() => ManifestSchema.parse(transformManifest(makeManifest()))).not.toThrow()
  })
})
