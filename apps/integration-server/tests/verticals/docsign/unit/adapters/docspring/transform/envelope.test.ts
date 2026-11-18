import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawDocSpringSubmission,
} from '../../../../../../../src/verticals/docsign/adapters/docspring/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import {
  SUBMISSION_EXAMPLE,
  LIST_SUBMISSION_EXAMPLE,
  DATA_REQUEST_SUBMISSION_EXAMPLE,
} from '../fixtures'

describe('docspring transformEnvelope', () => {
  it('maps the documented processed submission to a completed Envelope', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope(SUBMISSION_EXAMPLE as unknown as RawDocSpringSubmission),
    )
    expect(out.id).toBe('sub_1234567890abcdef01')
    expect(out.externalId).toBe('sub_1234567890abcdef01')
    expect(out.status).toBe('completed')
    expect(out.templateId).toBe('tpl_1234567890abcdef01')
    expect(out.completedAt).toBe('2020-05-14T02:00:00.000Z')
    expect(out.expiresAt).toBe('2018-10-27T13:00:00.000Z')
    expect(out.signerIds).toEqual([])
    expect(out.documentIds).toEqual([])
    expect(out.subject).toBe('')
    expect(out.signingOrder).toBe('parallel')
    expect(out.metadata).toEqual({ state: 'processed', test: 'true', templateType: 'pdf' })
    expect(out.platform).toBe('docspring')
  })

  it('maps a list element the same way', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope(LIST_SUBMISSION_EXAMPLE as unknown as RawDocSpringSubmission),
    )
    expect(out.id).toBe('sub_1234567890abcdef01')
    expect(out.status).toBe('completed')
  })

  it('a submission waiting for data requests is sent, lists its data request ids, and is not completed', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope(DATA_REQUEST_SUBMISSION_EXAMPLE as unknown as RawDocSpringSubmission),
    )
    expect(out.status).toBe('sent')
    expect(out.signerIds).toEqual(['drq_1234567890abcdef01'])
    expect(out.completedAt).toBeUndefined()
  })

  it('an expired submission is expired whatever its state', () => {
    const raw = { ...SUBMISSION_EXAMPLE, expired: true } as unknown as RawDocSpringSubmission
    expect(EnvelopeSchema.parse(transformEnvelope(raw)).status).toBe('expired')
  })

  it('a state outside the mapped ones is unknown, not guessed', () => {
    const raw = { ...SUBMISSION_EXAMPLE, state: 'pending' } as unknown as RawDocSpringSubmission
    const out = EnvelopeSchema.parse(transformEnvelope(raw))
    expect(out.status).toBe('unknown')
    expect(out.completedAt).toBeUndefined()
  })

  it('throws on a null id rather than inventing one', () => {
    const raw = { ...SUBMISSION_EXAMPLE, id: null } as unknown as RawDocSpringSubmission
    expect(() => transformEnvelope(raw)).toThrow(/submission id/)
  })
})
