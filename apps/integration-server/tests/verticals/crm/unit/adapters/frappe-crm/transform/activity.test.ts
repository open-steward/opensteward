import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawFrappeTask,
} from '../../../../../../../src/verticals/crm/adapters/frappe-crm/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawFrappeTask> = {}): RawFrappeTask {
  return { name: 'CRM-TASK-2024-00001', ...overrides }
}

describe('frappe-crm transformActivity', () => {
  it('maps name doc id to string id', () => {
    expect(transformActivity(makeRaw({ name: 'CRM-TASK-0001' })).id).toBe('CRM-TASK-0001')
  })

  it('hardcodes type as task', () => {
    expect(transformActivity(makeRaw()).type).toBe('task')
  })

  it('maps title to subject', () => {
    expect(transformActivity(makeRaw({ title: 'Follow up' })).subject).toBe('Follow up')
  })

  it('maps description to note', () => {
    expect(transformActivity(makeRaw({ description: 'Call notes' })).note).toBe('Call notes')
  })

  it('maps assigned_to to owner_id', () => {
    expect(transformActivity(makeRaw({ assigned_to: 'user@example.com' })).owner_id).toBe(
      'user@example.com',
    )
  })

  it('maps CRM Lead reference to contact_id', () => {
    const result = transformActivity(
      makeRaw({ reference_doctype: 'CRM Lead', reference_docname: 'CRM-LEAD-0001' }),
    )
    expect(result.contact_id).toBe('CRM-LEAD-0001')
    expect(result.deal_id).toBeUndefined()
  })

  it('maps CRM Deal reference to deal_id', () => {
    const result = transformActivity(
      makeRaw({ reference_doctype: 'CRM Deal', reference_docname: 'CRM-DEAL-0001' }),
    )
    expect(result.deal_id).toBe('CRM-DEAL-0001')
    expect(result.contact_id).toBeUndefined()
  })

  it('maps Done status to done=true', () => {
    expect(transformActivity(makeRaw({ status: 'Done' })).done).toBe(true)
  })

  it('maps Canceled status to done=true', () => {
    expect(transformActivity(makeRaw({ status: 'Canceled' })).done).toBe(true)
  })

  it('maps Todo status to done=false', () => {
    expect(transformActivity(makeRaw({ status: 'Todo' })).done).toBe(false)
  })

  it('converts due_date ISO to IsoDatetime', () => {
    const result = transformActivity(makeRaw({ due_date: '2024-03-31T00:00:00.000Z' }))
    expect(result.due_date).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('converts creation/modified to created_at/updated_at', () => {
    const result = transformActivity(
      makeRaw({
        creation: '2023-11-01 10:00:00.000000',
        modified: '2023-11-14 22:00:00.000000',
      }),
    )
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformActivity(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('passes ActivitySchema validation with full input', () => {
    const raw: RawFrappeTask = {
      name: 'CRM-TASK-2024-00001',
      title: 'Follow up',
      description: 'Call notes',
      status: 'Todo',
      assigned_to: 'user@example.com',
      reference_doctype: 'CRM Lead',
      reference_docname: 'CRM-LEAD-0001',
      due_date: '2024-03-31T00:00:00.000Z',
      creation: '2023-11-01T10:00:00.000Z',
      modified: '2023-11-14T22:00:00.000Z',
    }
    const result = transformActivity(raw)
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('frappe-crm untransformActivity', () => {
  it('maps subject back to title', () => {
    expect(untransformActivity({ subject: 'Follow up' }).title).toBe('Follow up')
  })

  it('maps note back to description', () => {
    expect(untransformActivity({ note: 'Call notes' }).description).toBe('Call notes')
  })

  it('maps owner_id back to assigned_to', () => {
    expect(untransformActivity({ owner_id: 'user@example.com' }).assigned_to).toBe(
      'user@example.com',
    )
  })

  it('maps done=true to status Done', () => {
    expect(untransformActivity({ done: true }).status).toBe('Done')
  })

  it('maps done=false to status Todo', () => {
    expect(untransformActivity({ done: false }).status).toBe('Todo')
  })

  it('sets CRM Lead reference when contact_id provided', () => {
    const result = untransformActivity({ contact_id: 'CRM-LEAD-0001' })
    expect(result.reference_doctype).toBe('CRM Lead')
    expect(result.reference_docname).toBe('CRM-LEAD-0001')
  })

  it('sets CRM Deal reference when deal_id provided (and no contact_id)', () => {
    const result = untransformActivity({ deal_id: 'CRM-DEAL-0001' })
    expect(result.reference_doctype).toBe('CRM Deal')
    expect(result.reference_docname).toBe('CRM-DEAL-0001')
  })

  it('prefers contact_id over deal_id for reference', () => {
    const result = untransformActivity({ contact_id: 'CRM-LEAD-0001', deal_id: 'CRM-DEAL-0001' })
    expect(result.reference_doctype).toBe('CRM Lead')
  })

  it('omits unset fields', () => {
    const result = untransformActivity({})
    expect(result).not.toHaveProperty('title')
    expect(result).not.toHaveProperty('status')
  })
})
