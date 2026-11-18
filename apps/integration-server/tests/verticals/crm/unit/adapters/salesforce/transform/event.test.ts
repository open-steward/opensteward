import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformEvent,
  untransformEvent,
  type RawSalesforceEvent,
} from '../../../../../../../src/verticals/crm/adapters/salesforce/transform/activity'

function makeRaw(overrides: Partial<RawSalesforceEvent> = {}): RawSalesforceEvent {
  return { Id: 'EVENT001', ...overrides }
}

describe('salesforce transformEvent', () => {
  it('maps Id to id', () => {
    expect(transformEvent(makeRaw()).id).toBe('EVENT001')
  })

  it('sets type to meeting', () => {
    expect(transformEvent(makeRaw()).type).toBe('meeting')
  })

  it('maps Subject to subject and Description to note', () => {
    const result = transformEvent(makeRaw({ Subject: 'Kickoff', Description: 'Intro call' }))
    expect(result.subject).toBe('Kickoff')
    expect(result.note).toBe('Intro call')
  })

  it('maps StartDateTime to due_date', () => {
    const result = transformEvent(makeRaw({ StartDateTime: '2026-02-01T14:20:00.000Z' }))
    expect(result.due_date).toBe('2026-02-01T14:20:00.000Z')
  })

  it('maps DurationInMinutes to duration_minutes', () => {
    expect(transformEvent(makeRaw({ DurationInMinutes: 45 })).duration_minutes).toBe(45)
  })

  it('maps WhoId to contact_id and AccountId to company_id', () => {
    const result = transformEvent(makeRaw({ WhoId: '003ABC', AccountId: '001XYZ' }))
    expect(result.contact_id).toBe('003ABC')
    expect(result.company_id).toBe('001XYZ')
  })

  it('maps WhatId to deal_id only when it is an Opportunity id', () => {
    expect(transformEvent(makeRaw({ WhatId: '006ABC' })).deal_id).toBe('006ABC')
    expect(transformEvent(makeRaw({ WhatId: '001XYZ' })).deal_id).toBeUndefined()
  })

  it('marks done when EndDateTime is in the past', () => {
    expect(transformEvent(makeRaw({ EndDateTime: '2000-01-01T00:00:00.000Z' })).done).toBe(true)
  })

  it('marks not done when EndDateTime is in the future', () => {
    expect(transformEvent(makeRaw({ EndDateTime: '2999-01-01T00:00:00.000Z' })).done).toBe(false)
  })

  it('leaves done unset when there is no EndDateTime, rather than guessing', () => {
    expect(transformEvent(makeRaw()).done).toBeUndefined()
  })

  it('has no Status field to read — Event has none', () => {
    // The whole reason Event gets its own raw type/transform: reusing Task's
    // TASK_SOQL field list (which selects Status) fails the query outright,
    // because Status does not exist on Event.
    expect('Status' in makeRaw()).toBe(false)
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformEvent(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformEvent(makeRaw({ EndDateTime: '2000-01-01T00:00:00.000Z' }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })

  it('satisfies the schema when optional fields are absent', () => {
    const result = transformEvent(makeRaw())
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('salesforce untransformEvent', () => {
  it('maps due_date to StartDateTime without truncating time, unlike Task', () => {
    // Event's StartDateTime is a full datetime, not a date-only field like
    // Task's ActivityDate, so this must NOT split on 'T'.
    const result = untransformEvent({ due_date: '2026-02-01T14:20:00.000Z' })
    expect(result.StartDateTime).toBe('2026-02-01T14:20:00.000Z')
  })

  it('maps duration_minutes to DurationInMinutes', () => {
    expect(untransformEvent({ duration_minutes: 30 }).DurationInMinutes).toBe(30)
  })

  it('maps contact_id to WhoId', () => {
    expect(untransformEvent({ contact_id: '003ABC' }).WhoId).toBe('003ABC')
  })

  it('writes deal_id to WhatId, preferring it over company_id', () => {
    expect(untransformEvent({ deal_id: '006ABC' }).WhatId).toBe('006ABC')
    expect(untransformEvent({ deal_id: '006ABC', company_id: '001XYZ' }).WhatId).toBe('006ABC')
  })

  it('falls back to company_id for WhatId when there is no deal_id', () => {
    expect(untransformEvent({ company_id: '001XYZ' }).WhatId).toBe('001XYZ')
  })

  it('never writes AccountId — it is read-only, derived from WhatId/WhoId', () => {
    const result = untransformEvent({ company_id: '001XYZ', deal_id: '006ABC', contact_id: '003ABC' })
    expect(result.AccountId).toBeUndefined()
    expect('AccountId' in result).toBe(false)
  })
})
