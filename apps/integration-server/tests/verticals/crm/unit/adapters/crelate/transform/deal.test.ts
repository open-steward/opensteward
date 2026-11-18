/**
 * Crelate v3 job → canonical Deal. The fixture uses only fields of
 * `RetrieveJobs` / `JobsBase` in
 * https://app.crelate.com/api3/docs/v3/crelate-openapi.json.
 */
import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawCrelateJob,
} from '../../../../../../../src/verticals/crm/adapters/crelate/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

const DOCUMENTED: RawCrelateJob = {
  Id: '9b1c3f7e-1111-4000-8000-000000000001',
  Name: 'Senior Developer',
  AccountId: { Id: '62bae789-24c8-4407-3f13-deab8172db08', Title: 'Crelate Retail' },
  SalesWorkflowItemStatusId: { Id: 'bbbbbbbb-0000-4000-8000-000000000005', Title: 'Negotiation' },
  WorkflowTypeId: { Id: 'F6EF012F-998D-4132-B38B-A17A00B2B958', Title: 'Recruiting' },
  Owners: [{ Id: 'aaaaaaaa-0000-4000-8000-000000000004', IsPrimary: true }],
  Probability: 60,
  PotentialValue: 25000,
  EstimatedCloseDate: '2023-09-30T00:00:00Z',
  CreatedOn: '2023-06-23T18:12:07.522503Z',
  ModifiedOn: '2023-07-01T09:00:00Z',
}

describe('crelate transformDeal (v3 RetrieveJobs)', () => {
  it('parses against DealSchema', () => {
    const out = DealSchema.parse(transformDeal(DOCUMENTED))
    expect(out).toMatchObject({
      id: '9b1c3f7e-1111-4000-8000-000000000001',
      title: 'Senior Developer',
      stage: 'Negotiation',
      stage_id: 'bbbbbbbb-0000-4000-8000-000000000005',
      company_id: '62bae789-24c8-4407-3f13-deab8172db08',
      owner_id: 'aaaaaaaa-0000-4000-8000-000000000004',
      probability: 60,
    })
    expect(out.close_date).toMatch(/^2023-09-30T00:00:00/)
    expect(out.metadata).toEqual(DOCUMENTED)
  })

  it('omits value: v3 documents no currency for PotentialValue', () => {
    expect(transformDeal(DOCUMENTED).value).toBeUndefined()
  })

  it('does not take the Recruiting WorkflowTypeId as the Sales-board pipeline', () => {
    expect(transformDeal(DOCUMENTED).pipeline_id).toBeUndefined()
  })

  it('drops a probability outside 0..100 rather than failing the parse', () => {
    const out = DealSchema.parse(transformDeal({ Id: 'j-1', Probability: 140 }))
    expect(out.probability).toBeUndefined()
  })

  it('never invents an id', () => {
    expect(() => transformDeal({ Name: 'No Id' })).toThrow(/without an Id/)
  })
})

describe('crelate untransformDeal (retired-v1 write body, unchanged)', () => {
  it('maps title, stage_id, pipeline_id and value.amount', () => {
    const out = untransformDeal({
      title: 'Enterprise Placement',
      stage_id: 'stat-5',
      pipeline_id: 'wf-3',
      value: { amount: 5000, currency: 'USD' },
    })
    expect(out).toMatchObject({
      name: 'Enterprise Placement',
      status_id: 'stat-5',
      workflow_id: 'wf-3',
      potential_value: 5000,
    })
  })
})
