import { describe, it, expect } from 'vitest'
import { NoteSchema } from '../../../../../../../src/verticals/crm/schema/note'
import {
  transformNote,
  untransformNote,
  type RawGainsightTimeline,
} from '../../../../../../../src/verticals/crm/adapters/gainsight/transform/note'

function makeRaw(overrides: Partial<RawGainsightTimeline> = {}): RawGainsightTimeline {
  return { Gsid: 'tl-1', Subject: 'Initial call', ...overrides }
}

describe('gainsight transformNote', () => {
  describe('id', () => {
    it('maps Gsid to string', () => {
      expect(transformNote(makeRaw({ Gsid: 'tl-abc' })).id).toBe('tl-abc')
    })

    it('falls back to ExternalId when Gsid is absent', () => {
      expect(transformNote(makeRaw({ Gsid: undefined, ExternalId: 'ext-note-5' })).id).toBe(
        'ext-note-5',
      )
    })

    it('is empty string when both Gsid and ExternalId are absent', () => {
      expect(transformNote(makeRaw({ Gsid: undefined, ExternalId: undefined })).id).toBe('')
    })
  })

  describe('content', () => {
    it('maps Notes when present', () => {
      expect(transformNote(makeRaw({ Notes: 'Call notes here', Subject: 'A call' })).content).toBe(
        'Call notes here',
      )
    })

    it('falls back to Subject when Notes is absent', () => {
      expect(transformNote(makeRaw({ Notes: undefined, Subject: 'Meeting summary' })).content).toBe(
        'Meeting summary',
      )
    })

    it('is empty string when both Notes and Subject are absent', () => {
      expect(transformNote(makeRaw({ Notes: undefined, Subject: undefined })).content).toBe('')
    })

    it('Notes wins over Subject when both are present', () => {
      const result = transformNote(makeRaw({ Notes: 'Detailed notes', Subject: 'Quick title' }))
      expect(result.content).toBe('Detailed notes')
    })
  })

  describe('company_id', () => {
    it('maps GsCompanyId to string', () => {
      expect(transformNote(makeRaw({ GsCompanyId: 'comp-gs-7' })).company_id).toBe('comp-gs-7')
    })

    it('is undefined when GsCompanyId is absent', () => {
      expect(transformNote(makeRaw({ GsCompanyId: undefined })).company_id).toBeUndefined()
    })
  })

  describe('owner_id', () => {
    it('maps AuthorId to string', () => {
      expect(transformNote(makeRaw({ AuthorId: 'user-gs-3' })).owner_id).toBe('user-gs-3')
    })

    it('is undefined when AuthorId is absent', () => {
      expect(transformNote(makeRaw({ AuthorId: undefined })).owner_id).toBeUndefined()
    })
  })

  describe('created_at / updated_at', () => {
    it('maps CreatedDate', () => {
      const result = transformNote(makeRaw({ CreatedDate: '2024-04-05T07:00:00Z' }))
      expect(result.created_at).toBeTruthy()
      expect(result.created_at).toContain('2024-04-05')
    })

    it('created_at is undefined when CreatedDate is absent', () => {
      expect(transformNote(makeRaw({ CreatedDate: undefined })).created_at).toBeUndefined()
    })

    it('maps ModifiedDate', () => {
      const result = transformNote(makeRaw({ ModifiedDate: '2024-08-19T16:00:00Z' }))
      expect(result.updated_at).toBeTruthy()
      expect(result.updated_at).toContain('2024-08-19')
    })

    it('updated_at is undefined when ModifiedDate is absent', () => {
      expect(transformNote(makeRaw({ ModifiedDate: undefined })).updated_at).toBeUndefined()
    })
  })

  describe('metadata', () => {
    it('is the raw object by reference', () => {
      const raw = makeRaw()
      expect(transformNote(raw).metadata).toBe(raw)
    })
  })

  describe('unmapped fields', () => {
    it('contact_id is undefined', () => {
      expect(transformNote(makeRaw()).contact_id).toBeUndefined()
    })

    it('deal_id is undefined', () => {
      expect(transformNote(makeRaw()).deal_id).toBeUndefined()
    })
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformNote(makeRaw({ Gsid: 'tl-abc' }))
    expect(() => NoteSchema.parse(result)).not.toThrow()
  })
})

describe('gainsight untransformNote', () => {
  it('maps content to "Notes"', () => {
    const result = untransformNote({ content: 'Discussed renewal terms' })
    expect(result.Notes).toBe('Discussed renewal terms')
  })

  it('maps company_id to "companyName" (not companyId)', () => {
    const result = untransformNote({ company_id: 'comp-gs-7' })
    expect(result.companyName).toBe('comp-gs-7')
    expect(result.companyId).toBeUndefined()
  })

  it('maps owner_id to "Author"', () => {
    const result = untransformNote({ owner_id: 'user-gs-3' })
    expect(result.Author).toBe('user-gs-3')
  })
})
