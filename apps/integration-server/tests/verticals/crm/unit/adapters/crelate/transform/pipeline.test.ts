/**
 * Crelate workflow type + `RetrieveWorkflowStatuses` rows → canonical Pipeline.
 * Status fields (Id, Name, SortOrder, WorkflowTypeId) are those of
 * `RetrieveWorkflowStatuses` in https://app.crelate.com/api3/docs/v3/crelate-openapi.json;
 * the type is one documented in GET /workflowstatuses' `workflow_type_ids`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawCrelateWorkflowStatus,
} from '../../../../../../../src/verticals/crm/adapters/crelate/transform/pipeline'
import { WORKFLOW_TYPES } from '../../../../../../../src/verticals/crm/adapters/crelate/constants'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

const SALES = { Id: '56544447-B7A1-40D9-BAAF-A6B000FACCC7', Name: 'Sales' }
const lookup = { Id: SALES.Id, Title: 'Sales' }

const STATUSES: RawCrelateWorkflowStatus[] = [
  { Id: 's-won', Name: 'Won', SortOrder: 30, WorkflowTypeId: lookup },
  { Id: 's-lead', Name: 'Lead', SortOrder: 10, WorkflowTypeId: lookup },
  { Id: 's-unsorted', Name: 'Parked', SortOrder: null, WorkflowTypeId: lookup },
  { Id: 's-neg', Name: 'Negotiation', SortOrder: 20, WorkflowTypeId: lookup },
]

describe('crelate transformPipeline', () => {
  it('parses against PipelineSchema, stages in SortOrder', () => {
    const out = PipelineSchema.parse(transformPipeline(SALES, STATUSES))
    expect(out.id).toBe(SALES.Id)
    expect(out.name).toBe('Sales')
    expect(out.stages).toEqual([
      { id: 's-lead', name: 'Lead', order: 0 },
      { id: 's-neg', name: 'Negotiation', order: 1 },
      { id: 's-won', name: 'Won', order: 2 },
      { id: 's-unsorted', name: 'Parked', order: 3 },
    ])
    expect(out.metadata).toEqual({ Id: SALES.Id, Name: 'Sales', WorkflowStatuses: STATUSES })
  })

  it('a type with no statuses has no stages', () => {
    expect(PipelineSchema.parse(transformPipeline(SALES, [])).stages).toEqual([])
  })

  it('never invents a stage id', () => {
    expect(() => transformPipeline(SALES, [{ Name: 'No Id' }])).toThrow(/without an Id/)
  })

  it('the documented workflow types are exactly the four GUIDs of workflow_type_ids', () => {
    expect(WORKFLOW_TYPES.map((t) => `${t.Name}=${t.Id}`)).toEqual([
      'Recruiting=F6EF012F-998D-4132-B38B-A17A00B2B958',
      'EmploymentSearch=07DF70FE-C56E-4EC5-B656-A22000D149EF',
      'Sales=56544447-B7A1-40D9-BAAF-A6B000FACCC7',
      'BusinessDevelopment=0027E210-1E59-4715-A19C-B13B00EB4FB0',
    ])
  })
})
