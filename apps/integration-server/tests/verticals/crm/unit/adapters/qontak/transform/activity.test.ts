import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import { transformActivity } from '../../../../../../../src/verticals/crm/adapters/qontak/transform/activity'
import { tasksList, taskGet } from '../fixtures'

describe('qontak transformActivity (documented GET /qontak/crm/tasks example)', () => {
  it('maps a listed task and satisfies ActivitySchema', () => {
    const doc = tasksList.response[0]
    const a = ActivitySchema.parse(transformActivity(doc))
    expect(a.id).toBe('3')
    expect(a.type).toBe('task')
    expect(a.subject).toBe('Task name')
    expect(a.note).toBe('detail edit')
    expect(a.contact_id).toBe('88')
    expect(a.deal_id).toBe('3')
    expect(a.company_id).toBe('1')
    expect(a.owner_id).toBe('1')
    expect(a.due_date).toBe('2024-11-10T21:00:00.000Z')
    expect(a.metadata).toEqual(doc)
  })

  it('maps the single-task example, whose links are null', () => {
    const a = ActivitySchema.parse(transformActivity(taskGet.response))
    expect(a.id).toBe('1')
    expect(a.subject).toBe('Follow-up Meeting')
    expect(a.note).toBeUndefined()
    expect(a.contact_id).toBeUndefined()
    expect(a.deal_id).toBeUndefined()
  })
})
