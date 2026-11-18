import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  transformActivity,
  untransformActivity,
  type RawGainsightCta,
} from '../../../../../../../src/verticals/crm/adapters/gainsight/transform/activity'

function makeRaw(overrides: Partial<RawGainsightCta> = {}): RawGainsightCta {
  return { gsid: 'cta-1', ...overrides }
}

describe('gainsight transformActivity', () => {
  describe('id', () => {
    it('maps gsid to string', () => {
      expect(transformActivity(makeRaw({ gsid: 'abc-123' })).id).toBe('abc-123')
    })

    it('falls back to empty string when gsid is absent', () => {
      expect(transformActivity(makeRaw({ gsid: undefined })).id).toBe('')
    })
  })

  describe('type', () => {
    it('pickName handles a plain string type', () => {
      expect(transformActivity(makeRaw({ type: 'Meeting' })).type).toBe('Meeting')
    })

    it('pickName handles an object with name property', () => {
      expect(transformActivity(makeRaw({ type: { name: 'Meeting' } })).type).toBe('Meeting')
    })

    it('pickName handles an object with undefined name', () => {
      expect(transformActivity(makeRaw({ type: { name: undefined } })).type).toBeUndefined()
    })

    it('undefined raw.type produces undefined type', () => {
      expect(transformActivity(makeRaw({ type: undefined })).type).toBeUndefined()
    })
  })

  describe('subject', () => {
    it('maps name field', () => {
      expect(transformActivity(makeRaw({ name: 'Follow up call' })).subject).toBe('Follow up call')
    })

    it('is undefined when name is absent', () => {
      expect(transformActivity(makeRaw({ name: undefined })).subject).toBeUndefined()
    })
  })

  describe('company_id', () => {
    it('maps companyId to string', () => {
      expect(transformActivity(makeRaw({ companyId: 'comp-9' })).company_id).toBe('comp-9')
    })

    it('is undefined when companyId is absent', () => {
      expect(transformActivity(makeRaw({ companyId: undefined })).company_id).toBeUndefined()
    })
  })

  describe('owner_id', () => {
    it('maps ownerId to string', () => {
      expect(transformActivity(makeRaw({ ownerId: 'user-7' })).owner_id).toBe('user-7')
    })

    it('is undefined when ownerId is absent', () => {
      expect(transformActivity(makeRaw({ ownerId: undefined })).owner_id).toBeUndefined()
    })
  })

  describe('due_date', () => {
    it('maps DueDate via toIsoDatetime', () => {
      const result = transformActivity(makeRaw({ DueDate: '2024-06-01T00:00:00Z' }))
      expect(result.due_date).toBeTruthy()
      expect(result.due_date).toContain('2024-06-01')
    })

    it('is undefined when DueDate is absent', () => {
      expect(transformActivity(makeRaw({ DueDate: undefined })).due_date).toBeUndefined()
    })
  })

  describe('done', () => {
    it('is false when status is the string "Open"', () => {
      expect(transformActivity(makeRaw({ status: 'Open' })).done).toBe(false)
    })

    it('is true when status is the string "Closed"', () => {
      expect(transformActivity(makeRaw({ status: 'Closed' })).done).toBe(true)
    })

    it('is true when status is an object with name "Closed"', () => {
      expect(transformActivity(makeRaw({ status: { name: 'Closed' } })).done).toBe(true)
    })

    it('is false when status is an object with name "Open"', () => {
      expect(transformActivity(makeRaw({ status: { name: 'Open' } })).done).toBe(false)
    })

    it('is undefined when status is absent', () => {
      expect(transformActivity(makeRaw({ status: undefined })).done).toBeUndefined()
    })
  })

  describe('created_at / updated_at', () => {
    it('maps createdDate', () => {
      const result = transformActivity(makeRaw({ createdDate: '2024-01-15T10:00:00Z' }))
      expect(result.created_at).toBeTruthy()
      expect(result.created_at).toContain('2024-01-15')
    })

    it('created_at is undefined when createdDate is absent', () => {
      expect(transformActivity(makeRaw({ createdDate: undefined })).created_at).toBeUndefined()
    })

    it('maps modifiedDate', () => {
      const result = transformActivity(makeRaw({ modifiedDate: '2024-02-20T12:00:00Z' }))
      expect(result.updated_at).toBeTruthy()
      expect(result.updated_at).toContain('2024-02-20')
    })

    it('updated_at is undefined when modifiedDate is absent', () => {
      expect(transformActivity(makeRaw({ modifiedDate: undefined })).updated_at).toBeUndefined()
    })
  })

  describe('metadata', () => {
    it('is the raw object by reference', () => {
      const raw = makeRaw()
      expect(transformActivity(raw).metadata).toBe(raw)
    })
  })

  it('does not throw on empty input', () => {
    expect(() => transformActivity({})).not.toThrow()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformActivity(makeRaw({ gsid: 'abc-123' }))
    expect(() => ActivitySchema.parse(result)).not.toThrow()
  })
})

describe('gainsight untransformActivity', () => {
  it('maps subject to "Name" (capital N)', () => {
    const result = untransformActivity({ subject: 'Onboarding call' })
    expect(result.Name).toBe('Onboarding call')
  })

  it('maps type to "type"', () => {
    const result = untransformActivity({ type: 'Meeting' })
    expect(result.type).toBe('Meeting')
  })

  it('maps due_date to "DueDate" sliced to 10 chars', () => {
    const result = untransformActivity({ due_date: '2024-06-01T00:00:00Z' })
    expect(result.DueDate).toBe('2024-06-01')
  })

  it('maps owner_id to "ownerId"', () => {
    const result = untransformActivity({ owner_id: 'user-42' })
    expect(result.ownerId).toBe('user-42')
  })

  it('maps company_id to "companyId"', () => {
    const result = untransformActivity({ company_id: 'comp-5' })
    expect(result.companyId).toBe('comp-5')
  })

  it('maps done=true to status "Closed"', () => {
    const result = untransformActivity({ done: true })
    expect(result.status).toBe('Closed')
  })

  it('maps done=false to status "Open"', () => {
    const result = untransformActivity({ done: false })
    expect(result.status).toBe('Open')
  })
})
