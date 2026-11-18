import { describe, it, expect } from 'vitest'
import {
  transformActivity,
  untransformActivity,
  type RawPipelineCrmActivity,
} from '../../../../../../../src/verticals/crm/adapters/pipeline-crm/transform/activity'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'

function makeRaw(overrides: Partial<RawPipelineCrmActivity> = {}): RawPipelineCrmActivity {
  return {
    id: 'act-1',
    type: 'Call',
    name: 'Discovery call',
    note: 'Discuss Q1 budget',
    person_id: 'c-42',
    company_id: 'co-7',
    deal_id: 'd-99',
    owner_id: 'usr-1',
    due_date: '2026-02-01T14:00:00.000Z',
    completed: false,
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-01-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('pipeline-crm transformActivity', () => {
  it('maps id', () => {
    expect(transformActivity(makeRaw()).id).toBe('act-1')
  })

  it('normalises type to lowercase', () => {
    expect(transformActivity(makeRaw()).type).toBe('call')
  })

  it('maps subject from name', () => {
    expect(transformActivity(makeRaw()).subject).toBe('Discovery call')
  })

  it('maps note', () => {
    expect(transformActivity(makeRaw()).note).toBe('Discuss Q1 budget')
  })

  it('maps contact_id from person_id', () => {
    expect(transformActivity(makeRaw()).contact_id).toBe('c-42')
  })

  it('maps company_id', () => {
    expect(transformActivity(makeRaw()).company_id).toBe('co-7')
  })

  it('maps deal_id', () => {
    expect(transformActivity(makeRaw()).deal_id).toBe('d-99')
  })

  it('maps owner_id', () => {
    expect(transformActivity(makeRaw()).owner_id).toBe('usr-1')
  })

  it('maps done from completed boolean', () => {
    expect(transformActivity(makeRaw({ completed: true })).done).toBe(true)
    expect(transformActivity(makeRaw({ completed: false })).done).toBe(false)
  })

  it('maps due_date as ISO datetime', () => {
    expect(transformActivity(makeRaw()).due_date).toBe('2026-02-01T14:00:00.000Z')
  })

  it('maps created_at as ISO datetime', () => {
    expect(transformActivity(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('passes ActivitySchema validation', () => {
    expect(() => ActivitySchema.parse(transformActivity(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformActivity(raw).metadata).toBe(raw)
  })

  it('untransformActivity round-trips subject to name', () => {
    expect(untransformActivity({ subject: 'My call' }).name).toBe('My call')
  })

  it('untransformActivity round-trips done to completed', () => {
    expect(untransformActivity({ done: true }).completed).toBe(true)
  })
})
