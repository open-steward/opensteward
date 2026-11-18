/**
 * transformShipment over the documented "Retrieve a Job" body
 * (GET /jobs/id/{jobID}, https://app.cigotracker.com/reference/cigo-swagger.json).
 */
import { describe, it, expect } from 'vitest'
import { transformShipment } from '../../../../../../../src/verticals/logistics/adapters/cigo-tracker/transform/shipment'
import type { CigoJobResponse } from '../../../../../../../src/verticals/logistics/adapters/cigo-tracker/types'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'
import { RETRIEVE_JOB_EXAMPLE } from '../fixtures/job'

function withJob(overrides: Record<string, unknown>): CigoJobResponse {
  return { ...RETRIEVE_JOB_EXAMPLE, job: { ...RETRIEVE_JOB_EXAMPLE.job, ...overrides } }
}

describe('cigo-tracker transformShipment', () => {
  it('maps the documented job fields and parses as a Shipment', () => {
    const s = ShipmentSchema.parse(transformShipment(RETRIEVE_JOB_EXAMPLE))
    expect(s).toEqual({
      id: 'f4e922d54b98a878488d2754fd4cfc0e',
      status: 'DELIVERED',
      trackingNumber: 'P35UWX-GPIP6C-7ZZSJ2',
      reference: 'J-WJG318322',
      destinationAddress: {
        name: 'John Doe',
        street1: '275 Notre-Dame St. East, Montreal, QC, H2Y 1C6',
        street2: 'Suite 101',
        state: 'QC',
        postalCode: 'H2Y 1C6',
        country: 'CA',
        phone: '(000) 000-0001',
        email: 'john.doe@example.com',
      },
      notes: 'A sample comment regarding the Job for John Doe!',
      metadata: RETRIEVE_JOB_EXAMPLE,
    })
  })

  it('maps every documented job status', () => {
    const cases: Array<[string, string]> = [
      ['staging', 'PENDING'],
      ['new', 'PENDING'],
      ['in progress', 'OUT_FOR_DELIVERY'],
      ['completed', 'DELIVERED'],
      ['incomplete', 'EXCEPTION'],
      ['damaged', 'EXCEPTION'],
      ['partially completed', 'EXCEPTION'],
      ['resolved', 'UNKNOWN'],
      ['cancelled', 'CANCELLED'],
      ['something else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(ShipmentSchema.parse(transformShipment(withJob({ status }))).status).toBe(expected)
    }
  })

  it('leaves out a geocoded country that is not an ISO 3166-1 alpha-2 code', () => {
    const raw = withJob({
      post_staging: {
        ...RETRIEVE_JOB_EXAMPLE.job!.post_staging,
        geocoding: { country_code: 'CAN', subdivision_code: 'QC' },
      },
    })
    const s = ShipmentSchema.parse(transformShipment(raw))
    expect(s.destinationAddress?.country).toBeUndefined()
    expect(s.destinationAddress?.state).toBe('QC')
  })

  it('a staging job (no post_staging) has no tracking number or geocoding', () => {
    const s = ShipmentSchema.parse(
      transformShipment(withJob({ status: 'staging', post_staging: undefined })),
    )
    expect(s.status).toBe('PENDING')
    expect(s.trackingNumber).toBeUndefined()
    expect(s.destinationAddress?.country).toBeUndefined()
  })

  it('throws on a body without job.job_id', () => {
    expect(() => transformShipment({ statusCode: 200, status: 'OK' })).toThrow(/job\.job_id/)
  })
})
