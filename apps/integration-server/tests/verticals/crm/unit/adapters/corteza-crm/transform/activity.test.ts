import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawCortezaTask,
} from '../../../../../../../src/verticals/crm/adapters/corteza-crm/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawCortezaTask> = {}): RawCortezaTask {
  return {
    recordID: 'rec-1',
    moduleID: 'mod-1',
    namespaceID: 'ns-1',
    values: [],
    ...overrides,
  }
}

// Fixture shape: the record in docs.cortezaproject.org "Working With Low Code
// Records" ({ recordID, moduleID, values: [{ name, value }], namespaceID }),
// plus createdAt/updatedAt from server/compose/types/record.go. Field names
// are the module's in corteza-server provision/700_crm/1100_modules.yaml.
describe('corteza-crm transformActivity', () => {
  const doc = makeRaw({
    recordID: '312345678901234888',
    moduleID: '212345678901234004',
    namespaceID: '112345678901234567',
    values: [
      { name: 'Subject', value: 'Follow-up call' },
      { name: 'Description', value: 'Discuss Q1 goals' },
      { name: 'OwnerId', value: '412345678901234567' },
      { name: 'ContactId', value: '312345678901234567' },
      { name: 'AccountId', value: '312345678901234001' },
      { name: 'OpportunityId', value: '312345678901234777' },
      { name: 'ActivityDate', value: '2026-03-01T09:00:00Z' },
      { name: 'Status', value: 'Open' },
    ],
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-02T10:00:00Z',
  })

  it('maps the documented record to an ActivitySchema-valid activity', () => {
    expect(ActivitySchema.parse(transformActivity(doc))).toMatchObject({
      id: '312345678901234888',
      type: 'task',
      subject: 'Follow-up call',
      note: 'Discuss Q1 goals',
      owner_id: '412345678901234567',
      contact_id: '312345678901234567',
      company_id: '312345678901234001',
      deal_id: '312345678901234777',
      due_date: '2026-03-01T09:00:00.000Z',
      done: false,
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-02T10:00:00.000Z',
    })
  })

  it('Status "Completed" is done', () => {
    const raw = makeRaw({ values: [{ name: 'Status', value: 'Completed' }] })
    expect(ActivitySchema.parse(transformActivity(raw)).done).toBe(true)
  })

  it('reads no WhoId field (the Task module has none)', () => {
    const raw = makeRaw({ values: [{ name: 'WhoId', value: 'x' }] })
    expect(transformActivity(raw).contact_id).toBeUndefined()
  })

  it('preserves raw as metadata', () => {
    expect(transformActivity(doc).metadata).toBe(doc)
  })
})

describe('corteza-crm untransformActivity', () => {
  it('maps subject → Subject field', () => {
    const values = untransformActivity({ subject: 'Call client' })
    expect(values.find((v) => v.name === 'Subject')?.value).toBe('Call client')
  })

  it('maps done=true → Status=Completed', () => {
    const values = untransformActivity({ done: true })
    expect(values.find((v) => v.name === 'Status')?.value).toBe('Completed')
  })

  it('maps done=false → Status=Not Started', () => {
    const values = untransformActivity({ done: false })
    expect(values.find((v) => v.name === 'Status')?.value).toBe('Not Started')
  })

  it('maps contact_id → WhoId field', () => {
    const values = untransformActivity({ contact_id: 'cont-11' })
    expect(values.find((v) => v.name === 'WhoId')?.value).toBe('cont-11')
  })

  it('round-trips subject and done', () => {
    const raw = makeRaw({
      values: [
        { name: 'Subject', value: 'Discovery call' },
        { name: 'Status', value: 'Completed' },
      ],
    })
    const activity = transformActivity(raw)
    const back = untransformActivity(activity)
    expect(back.find((v) => v.name === 'Subject')?.value).toBe('Discovery call')
    expect(back.find((v) => v.name === 'Status')?.value).toBe('Completed')
  })
})
