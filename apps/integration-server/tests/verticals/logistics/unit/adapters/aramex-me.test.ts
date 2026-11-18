import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type AramexMeShipment,
} from '../../../../../src/verticals/logistics/adapters/aramex-me/transform/shipment'
import {
  transformTracking,
  type AramexMeTrackingResponse,
} from '../../../../../src/verticals/logistics/adapters/aramex-me/transform/tracking'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<AramexMeShipment> = {}): AramexMeShipment {
  return {
    ID: 'SHP-AME-001',
    HasErrors: false,
    Reference1: 'ME-REF-001',
    Reference2: null,
    Shipper: {
      Reference1: null,
      AccountNumber: '12345',
      PartyAddress: {
        Line1: '10 King Fahd Rd',
        Line2: null,
        Line3: null,
        City: 'Riyadh',
        StateOrProvinceCode: 'RD',
        PostCode: '11564',
        CountryCode: 'SA',
      },
      Contact: {
        PersonName: 'Ali Sender',
        CompanyName: 'Sender LLC',
        PhoneNumber1: '+966501234567',
        EmailAddress: 'ali@example.com',
      },
    },
    Consignee: {
      Reference1: null,
      AccountNumber: null,
      PartyAddress: {
        Line1: '20 Sheikh Zayed Rd',
        Line2: 'Suite 5',
        Line3: null,
        City: 'Dubai',
        StateOrProvinceCode: 'DU',
        PostCode: '00000',
        CountryCode: 'AE',
      },
      Contact: {
        PersonName: 'Sara Receiver',
        CompanyName: 'Receiver Inc',
        PhoneNumber1: '+971501234567',
        EmailAddress: 'sara@example.com',
      },
    },
    ShipmentDetails: {
      Dimensions: { Length: 30, Width: 20, Height: 15, Unit: 'CM' },
      ActualWeight: { Value: 3.0, Unit: 'KG' },
      ProductGroup: 'EXP',
      ProductType: 'PDX',
      NumberOfPieces: 1,
      DescriptionOfGoods: 'Electronics',
    },
    ShipmentLabel: {
      LabelURL: 'https://ws.aramex.net/labels/SHP-AME-001.pdf',
      LabelFileContents: null,
    },
    ShipmentNumber: 'AME9876543210',
    Status: 'CREATED',
    CreatedDate: '2024-04-10T08:00:00Z',
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: Partial<AramexMeTrackingResponse> = {},
): AramexMeTrackingResponse {
  return {
    TrackingResults: [
      {
        WaybillNumber: 'AME9876543210',
        UpdateCode: 'SH001',
        UpdateDescription: 'Shipment information received',
        UpdateDateTime: '2024-04-10T08:00:00Z',
        UpdateLocation: 'Riyadh',
        Comments: null,
      },
      {
        WaybillNumber: 'AME9876543210',
        UpdateCode: 'SH003',
        UpdateDescription: 'In transit to destination',
        UpdateDateTime: '2024-04-11T14:00:00Z',
        UpdateLocation: 'Dubai Hub',
        Comments: null,
      },
    ],
    HasErrors: false,
    Notifications: [],
    ...overrides,
  }
}

// ─── transformShipment ───────────────────────────────────────────────────────

describe('Aramex ME transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-AME-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('AME9876543210')
    expect(result.carrierId).toBe('aramex-me')
    expect(result.serviceCode).toBe('PDX')
    expect(result.reference).toBe('ME-REF-001')
    expect(result.notes).toBe('Electronics')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Ali Sender')
    expect(result.originAddress?.city).toBe('Riyadh')
    expect(result.originAddress?.country).toBe('SA')
    expect(result.destinationAddress?.name).toBe('Sara Receiver')
    expect(result.destinationAddress?.city).toBe('Dubai')
    expect(result.destinationAddress?.country).toBe('AE')
  })

  it('maps weight and dimensions', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(3.0)
    expect(result.totalWeight?.unit).toBe('kg')
    expect(result.dimensions?.length).toBe(30)
    expect(result.dimensions?.width).toBe(20)
    expect(result.dimensions?.height).toBe(15)
    expect(result.dimensions?.unit).toBe('cm')
  })

  it('maps label URL', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).labelUrl).toContain('SHP-AME-001.pdf')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      ShipmentDetails: null,
      Shipper: null,
      Consignee: null,
      ShipmentLabel: null,
      ShipmentNumber: null,
      Reference1: null,
      Status: null,
      CreatedDate: null,
    })
    const result = transformShipment(raw)

    expect(result.totalWeight).toBeUndefined()
    expect(result.dimensions).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.status).toBe('UNKNOWN')
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string, string][] = [
      ['CREATED', 'PENDING'],
      ['PENDING', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['INTRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['EXCEPTION', 'EXCEPTION'],
      ['ON_HOLD', 'EXCEPTION'],
      ['SOMETHING_ELSE', 'UNKNOWN'],
    ]
    for (const [aramexStatus, expected] of cases) {
      const raw = makeShipment({ Status: aramexStatus })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})

// ─── transformTracking ───────────────────────────────────────────────────────

describe('Aramex ME transformTracking', () => {
  it('produces one event per tracking result', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'AME9876543210')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw, 'AME9876543210')[0]

    expect(event.trackingNumber).toBe('AME9876543210')
    expect(event.carrierId).toBe('aramex-me')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment information received')
    expect(event.location?.city).toBe('Riyadh')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata on every event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'AME9876543210')
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when TrackingResults is empty', () => {
    const raw = makeTrackingResponse({ TrackingResults: [] })
    const events = transformTracking(raw, 'AME9876543210')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('AME9876543210')
  })

  it('maps update codes correctly', () => {
    const cases: [string, string][] = [
      ['SH001', 'PRE_TRANSIT'],
      ['SH002', 'PRE_TRANSIT'],
      ['SH003', 'IN_TRANSIT'],
      ['SH005', 'OUT_FOR_DELIVERY'],
      ['SH006', 'DELIVERED'],
      ['SH009', 'UNKNOWN'],
      ['SH014', 'RETURN_TO_SENDER'],
      ['SH062', 'FAILURE'],
      ['XX999', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const raw = makeTrackingResponse({
        TrackingResults: [
          {
            WaybillNumber: 'AME9876543210',
            UpdateCode: code,
            UpdateDescription: 'test',
            UpdateDateTime: '2024-04-10T08:00:00Z',
            UpdateLocation: null,
            Comments: null,
          },
        ],
      })
      expect(transformTracking(raw, 'AME9876543210')[0].status).toBe(expected)
    }
  })

  it('handles null UpdateLocation gracefully', () => {
    const raw = makeTrackingResponse({
      TrackingResults: [
        {
          WaybillNumber: 'AME9876543210',
          UpdateCode: 'SH003',
          UpdateDescription: 'In transit',
          UpdateDateTime: '2024-04-11T14:00:00Z',
          UpdateLocation: null,
          Comments: null,
        },
      ],
    })
    expect(transformTracking(raw, 'AME9876543210')[0].location).toBeUndefined()
  })
})
