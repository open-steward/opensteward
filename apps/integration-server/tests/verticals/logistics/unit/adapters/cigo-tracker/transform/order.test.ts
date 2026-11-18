/**
 * transformOrder over the documented "Retrieve a Job" body
 * (GET /jobs/id/{jobID}, https://app.cigotracker.com/reference/cigo-swagger.json).
 */
import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/logistics/adapters/cigo-tracker/transform/order'
import type { CigoJobResponse } from '../../../../../../../src/verticals/logistics/adapters/cigo-tracker/types'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import { RETRIEVE_JOB_EXAMPLE } from '../fixtures/job'

function withJob(overrides: Record<string, unknown>): CigoJobResponse {
  return { ...RETRIEVE_JOB_EXAMPLE, job: { ...RETRIEVE_JOB_EXAMPLE.job, ...overrides } }
}

describe('cigo-tracker transformOrder', () => {
  it('maps the documented job and action fields and parses as an Order', () => {
    const o = OrderSchema.parse(transformOrder(RETRIEVE_JOB_EXAMPLE))
    expect(o).toEqual({
      id: 'f4e922d54b98a878488d2754fd4cfc0e',
      status: 'DELIVERED',
      orderNumber: 'J-WJG318322',
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
      lineItems: [
        {
          id: '97a7f7052349acb9db2fb28b19df3ba5',
          sku: 'ASG819723891263',
          description: 'Astin Sofa - Grey',
          quantity: 2,
        },
      ],
      notes: 'A sample comment regarding the Job for John Doe!',
      metadata: RETRIEVE_JOB_EXAMPLE,
    })
  })

  it('maps no amounts or currency: CIGO documents none for action values or balances', () => {
    const o = transformOrder(RETRIEVE_JOB_EXAMPLE)
    expect(o.currency).toBeUndefined()
    expect(o.totalAmount).toBeUndefined()
    expect(o.lineItems?.[0]?.unitAmount).toBeUndefined()
    expect(o.lineItems?.[0]?.totalAmount).toBeUndefined()
  })

  it('maps every documented job status, unmapped ones to lowercase unknown', () => {
    const cases: Array<[string, string]> = [
      ['staging', 'PENDING'],
      ['new', 'PENDING'],
      ['in progress', 'SHIPPED'],
      ['completed', 'DELIVERED'],
      ['cancelled', 'CANCELLED'],
      ['incomplete', 'unknown'],
      ['damaged', 'unknown'],
      ['partially completed', 'unknown'],
      ['resolved', 'unknown'],
    ]
    for (const [status, expected] of cases) {
      expect(OrderSchema.parse(transformOrder(withJob({ status }))).status).toBe(expected)
    }
  })

  it('a job without actions has no line items', () => {
    const o = OrderSchema.parse(transformOrder({ ...RETRIEVE_JOB_EXAMPLE, actions: undefined }))
    expect(o.lineItems).toBeUndefined()
  })

  it('throws on a body without job.job_id', () => {
    expect(() => transformOrder({ statusCode: 200, status: 'OK', job: {} })).toThrow(/job\.job_id/)
  })
})
