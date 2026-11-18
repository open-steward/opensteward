import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity, untransformActivity, type RawSalesforceTask } from '../../../../../../../src/verticals/crm/adapters/salesforce/transform/activity'

function makeRaw(overrides: Partial<RawSalesforceTask> = {}): RawSalesforceTask {
  return { Id: 'TASK001', ...overrides }
}

describe('salesforce transformActivity', () => {
  it('maps Id to id', () => {
    expect(transformActivity(makeRaw()).id).toBe('TASK001')
  })

  it('sets type to task', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('marks done when Status is Completed', () => {
    expect(transformActivity(makeRaw({ Status: 'Completed' })).done).toBe(true)
    expect(transformActivity(makeRaw({ Status: 'Open' })).done).toBe(false)
  })

  it('maps Subject to subject and Description to note', () => {
    const result = transformActivity(makeRaw({ Subject: 'Follow up', Description: 'Call them' }))
    expect(result.subject).toBe('Follow up')
    expect(result.note).toBe('Call them')
  })

  it('maps AccountId to company_id', () => {
    expect(transformActivity(makeRaw({ AccountId: '001XYZ' })).company_id).toBe('001XYZ')
  })

  it('maps WhatId to deal_id only when it is an Opportunity id', () => {
    expect(transformActivity(makeRaw({ WhatId: '006ABC' })).deal_id).toBe('006ABC')
    expect(transformActivity(makeRaw({ WhatId: '001XYZ' })).deal_id).toBeUndefined()
    expect(transformActivity(makeRaw()).deal_id).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('salesforce untransformActivity', () => {
  it('maps done to Status string', () => {
    expect(untransformActivity({ done: true }).Status).toBe('Completed')
    expect(untransformActivity({ done: false }).Status).toBe('Not Started')
  })

  it('strips time from due_date', () => {
    const result = untransformActivity({ due_date: '2024-06-01T12:00:00Z' })
    expect(result.ActivityDate).toBe('2024-06-01')
  })

  it('writes deal_id to WhatId, preferring it over company_id', () => {
    expect(untransformActivity({ deal_id: '006ABC' }).WhatId).toBe('006ABC')
    expect(untransformActivity({ deal_id: '006ABC', company_id: '001XYZ' }).WhatId).toBe('006ABC')
  })

  it('falls back to company_id for WhatId when there is no deal_id', () => {
    expect(untransformActivity({ company_id: '001XYZ' }).WhatId).toBe('001XYZ')
  })

  it('never writes AccountId — it is read-only on Task', () => {
    expect(untransformActivity({ company_id: '001XYZ' }).AccountId).toBeUndefined()
  })
})
