/**
 * Nitro Sign `Participant` → canonical Signer.
 *
 * Schema: `Participant` in https://api.gonitro.dev/openapi.json —
 * properties `ID` ("The unique identifier of the participant"), `email`,
 * `role`, `authentication` (oneOf `AccessCode` | `SMS`). It declares no name
 * and no status.
 */
import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/nitro-sign/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { PARTICIPANT_ACCESS_CODE, PARTICIPANT_CC, PARTICIPANT_SMS } from '../fixtures'

const ENV = '6e60b9f4-e7dd-4daf-af64-5ab274a8e1fd'

describe('nitro-sign transformSigner', () => {
  it('maps a documented Participant and parses with SignerSchema', () => {
    const s = SignerSchema.parse(transformSigner(PARTICIPANT_ACCESS_CODE, ENV))
    expect(s.id).toBe(`${ENV}:participant-111`)
    expect(s.externalId).toBe('participant-111')
    expect(s.envelopeId).toBe(ENV)
    expect(s.email).toBe('user@gonitro.com')
    // Participant declares no name; the email is not passed off as one.
    expect(s.name).toBe('')
    expect(s.role).toBe('signer')
    expect(s.platform).toBe('nitro-sign')
    expect(s.metadata).toEqual({ role: 'SIGNER', authenticationType: 'AccessCode' })
  })

  it('reports status unknown: a Participant documents no status', () => {
    expect(SignerSchema.parse(transformSigner(PARTICIPANT_SMS, ENV)).status).toBe('unknown')
  })

  it('maps the documented cc role in either spelling', () => {
    expect(SignerSchema.parse(transformSigner(PARTICIPANT_CC, ENV)).role).toBe('cc')
    expect(transformSigner({ ...PARTICIPANT_CC, role: 'CC' }, ENV).role).toBe('cc')
  })

  it('maps an undocumented role to unknown rather than guessing signer', () => {
    expect(
      SignerSchema.parse(transformSigner({ ...PARTICIPANT_CC, role: 'WITNESS' }, ENV)).role,
    ).toBe('unknown')
  })

  it('keeps authentication secrets (access code, phone number) out of raw', () => {
    const a = transformSigner(PARTICIPANT_ACCESS_CODE, ENV)
    const b = transformSigner(PARTICIPANT_SMS, ENV)
    expect(JSON.stringify(a)).not.toContain('123456')
    expect(JSON.stringify(b)).not.toContain('1234567890')
    expect(b.metadata['authenticationType']).toBe('SMS')
  })

  it('omits email and names nobody when the participant has no email', () => {
    const { email: _e, ...noEmail } = PARTICIPANT_SMS
    const s = SignerSchema.parse(transformSigner(noEmail, ENV))
    expect(s.email).toBeUndefined()
    expect(s.name).toBe('')
  })

  it('throws on a participant with no ID instead of inventing one', () => {
    const { ID: _id, ...noId } = PARTICIPANT_CC
    expect(() => transformSigner(noId, ENV)).toThrow(/ID/)
  })
})
