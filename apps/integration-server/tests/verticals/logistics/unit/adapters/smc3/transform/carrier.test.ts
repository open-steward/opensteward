import { describe, it, expect } from 'vitest'
import {
  transformCarrierServices,
  transformSingleCarrier,
  type Smc3CarrierServicesResponse,
  type Smc3CarrierService,
} from '../../../../../../../src/verticals/logistics/adapters/smc3/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeResponse(
  overrides: Partial<Smc3CarrierServicesResponse> = {},
): Smc3CarrierServicesResponse {
  return {
    carrierServices: [
      {
        scac: 'ABCD',
        carrierName: 'ABCD Freight',
        serviceCode: 'ABCD_LTL',
        serviceName: 'Standard LTL',
        transitDays: 3,
        isAvailable: true,
        effectiveDate: '2024-03-01T00:00:00Z',
      },
      {
        scac: 'ABCD',
        carrierName: 'ABCD Freight',
        serviceCode: 'ABCD_EXP',
        serviceName: 'Express LTL',
        transitDays: 1,
        isAvailable: true,
        effectiveDate: '2024-03-01T00:00:00Z',
      },
      {
        scac: 'WXYZ',
        carrierName: 'WXYZ Lines',
        serviceCode: 'WXYZ_STD',
        serviceName: 'WXYZ Standard',
        transitDays: 5,
        isAvailable: false,
        effectiveDate: '2024-03-01T00:00:00Z',
      },
    ],
    messageStatus: { message: 'OK', status: 'SUCCESS', code: '200' },
    ...overrides,
  }
}

function makeRows(overrides: Partial<Smc3CarrierService>[] = []): Smc3CarrierService[] {
  return [
    {
      scac: 'ABCD',
      carrierName: 'ABCD Freight',
      serviceCode: 'ABCD_LTL',
      serviceName: 'Standard LTL',
      transitDays: 3,
      isAvailable: true,
      effectiveDate: '2024-03-01T00:00:00Z',
      ...overrides[0],
    },
  ]
}

describe('smc3 transformCarrierServices', () => {
  it('groups rows by SCAC into one Carrier per SCAC', () => {
    const results = transformCarrierServices(makeResponse())
    expect(results).toHaveLength(2)
    const abcd = results.find((c) => c.id === 'ABCD')
    expect(abcd).toBeDefined()
    expect(abcd!.services).toHaveLength(2)
  })

  it('maps id and code to SCAC', () => {
    const results = transformCarrierServices(makeResponse())
    const abcd = results.find((c) => c.id === 'ABCD')!
    expect(abcd.id).toBe('ABCD')
    expect(abcd.code).toBe('ABCD')
  })

  it('maps name from carrierName', () => {
    const results = transformCarrierServices(makeResponse())
    const abcd = results.find((c) => c.id === 'ABCD')!
    expect(abcd.name).toBe('ABCD Freight')
  })

  it('maps isActive from isAvailable', () => {
    const results = transformCarrierServices(makeResponse())
    const wxyz = results.find((c) => c.id === 'WXYZ')!
    expect(wxyz.isActive).toBe(false)
  })

  it('maps services with transitDaysMin/Max from transitDays', () => {
    const results = transformCarrierServices(makeResponse())
    const abcd = results.find((c) => c.id === 'ABCD')!
    const ltl = abcd.services!.find((s) => s.code === 'ABCD_LTL')!
    expect(ltl.transitDaysMin).toBe(3)
    expect(ltl.transitDaysMax).toBe(3)
  })

  it('skips rows with missing or blank scac', () => {
    const results = transformCarrierServices(
      makeResponse({
        carrierServices: [
          { scac: '', carrierName: 'Empty', serviceCode: 'X', serviceName: 'X' },
          { scac: null, carrierName: 'Null', serviceCode: 'Y', serviceName: 'Y' },
          { scac: 'GOOD', carrierName: 'Good', serviceCode: 'G_LTL', serviceName: 'Good LTL' },
        ],
      }),
    )
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('GOOD')
  })

  it('returns empty array when carrierServices is null', () => {
    expect(transformCarrierServices(makeResponse({ carrierServices: null }))).toEqual([])
  })

  it('produces schema-valid Carrier objects', () => {
    const results = transformCarrierServices(makeResponse())
    for (const r of results) {
      expect(() => CarrierSchema.parse(r)).not.toThrow()
    }
  })
})

describe('smc3 transformSingleCarrier', () => {
  it('maps id and code to the provided scac', () => {
    const result = transformSingleCarrier('ABCD', makeRows())
    expect(result.id).toBe('ABCD')
    expect(result.code).toBe('ABCD')
  })

  it('maps name and isActive from first row', () => {
    const result = transformSingleCarrier('ABCD', makeRows())
    expect(result.name).toBe('ABCD Freight')
    expect(result.isActive).toBe(true)
  })

  it('maps services from all rows', () => {
    const rows: Smc3CarrierService[] = [
      {
        scac: 'ABCD',
        carrierName: 'ABCD',
        serviceCode: 'SVC1',
        serviceName: 'Svc One',
        transitDays: 2,
      },
      {
        scac: 'ABCD',
        carrierName: 'ABCD',
        serviceCode: 'SVC2',
        serviceName: 'Svc Two',
        transitDays: 4,
      },
    ]
    const result = transformSingleCarrier('ABCD', rows)
    expect(result.services).toHaveLength(2)
    expect(result.services![0].code).toBe('SVC1')
    expect(result.services![1].code).toBe('SVC2')
  })

  it('omits services with no serviceCode', () => {
    const rows: Smc3CarrierService[] = [
      { scac: 'ABCD', carrierName: 'ABCD', serviceCode: null },
      { scac: 'ABCD', carrierName: 'ABCD', serviceCode: 'OK', serviceName: 'OK' },
    ]
    const result = transformSingleCarrier('ABCD', rows)
    expect(result.services).toHaveLength(1)
  })

  it('produces schema-valid Carrier', () => {
    const result = transformSingleCarrier('ABCD', makeRows())
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })
})
