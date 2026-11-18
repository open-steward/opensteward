import { describe, it, expect } from 'vitest'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/mifiel/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { QUERY_RECORD_EXAMPLE, STAKEHOLDER_EXAMPLE } from './fixtures'

describe('mifiel transformEnvelope', () => {
  it('maps the documented query record onto the canonical schema', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(QUERY_RECORD_EXAMPLE))
    expect(out.id).toBe('32214f64-f695-4691-8f6c-073681b05543')
    expect(out.externalId).toBe('32214f64-f695-4691-8f6c-073681b05543')
    expect(out.subject).toBe('demo.pdf')
    expect(out.status).toBe('sent')
    expect(out.signingOrder).toBe('parallel')
    expect(out.signerIds).toEqual([STAKEHOLDER_EXAMPLE.id])
    expect(out.documentIds).toEqual(['32214f64-f695-4691-8f6c-073681b05543'])
    expect(out.createdAt).toBe('2021-07-21T17:05:36.821Z')
    expect(out.metadata).toEqual({ state: 'pending' })
    expect(out.platform).toBe('mifiel')
  })

  it('a document signed by all parties is completed, whatever its state', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope({ ...QUERY_RECORD_EXAMPLE, signed: true, state: 'x' }),
    )
    expect(out.status).toBe('completed')
  })

  it('an undocumented state maps to unknown, not to a guess', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope({ ...QUERY_RECORD_EXAMPLE, signed: false, state: 'archived' }),
    )
    expect(out.status).toBe('unknown')
  })

  it('only stakeholders of type Signer are signers (reviewers are not)', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope({
        ...QUERY_RECORD_EXAMPLE,
        stakeholders: [
          STAKEHOLDER_EXAMPLE,
          { ...STAKEHOLDER_EXAMPLE, id: 'rev-1', type: 'Reviewer' },
          { ...STAKEHOLDER_EXAMPLE, id: 'sig-2', type: 'signer' },
        ],
      }),
    )
    expect(out.signerIds).toEqual([STAKEHOLDER_EXAMPLE.id, 'sig-2'])
  })

  it('a Signer stakeholder without an id is an error, not a placeholder', () => {
    expect(() =>
      transformEnvelope({
        ...QUERY_RECORD_EXAMPLE,
        stakeholders: [{ ...STAKEHOLDER_EXAMPLE, id: null }],
      }),
    ).toThrow(/stakeholder of document .* has no id/)
  })

  it('a record without an id or file name is an error, not a placeholder', () => {
    expect(() => transformEnvelope({ ...QUERY_RECORD_EXAMPLE, id: '' })).toThrow(/no id/)
    expect(() => transformEnvelope({ ...QUERY_RECORD_EXAMPLE, file_file_name: null })).toThrow(
      /file_file_name/,
    )
  })
})
