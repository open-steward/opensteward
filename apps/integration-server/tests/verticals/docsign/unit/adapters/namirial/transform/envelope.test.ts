import { describe, it, expect } from 'vitest'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/namirial/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { ENVELOPE_FILES_EXAMPLE, ENVELOPE_GET_EXAMPLE, ENVELOPE_ID } from '../fixtures'

describe('Namirial transformEnvelope (GET /v6/envelope/{id} + /files)', () => {
  it('maps the documented overview and files to a canonical Envelope', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope(ENVELOPE_GET_EXAMPLE, ENVELOPE_FILES_EXAMPLE),
    )
    expect(out.id).toBe(ENVELOPE_ID)
    expect(out.externalId).toBe(ENVELOPE_ID)
    expect(out.status).toBe('sent')
    expect(out.subject).toBe('Project proposal')
    expect(out.senderEmail).toBe('alice@example.com')
    expect(out.senderName).toBe('Alice Smith')
    expect(out.sentAt).toBe('2017-07-21T17:32:28.000Z')
    expect(out.platform).toBe('namirial')
    // SignAutomatic (activity 4) addresses no recipient.
    expect(out.signerIds).toEqual([
      `${ENVELOPE_ID}:a1000000-0000-0000-0000-000000000001`,
      `${ENVELOPE_ID}:a1000000-0000-0000-0000-000000000002`,
      `${ENVELOPE_ID}:a1000000-0000-0000-0000-000000000003`,
      `${ENVELOPE_ID}:a1000000-0000-0000-0000-000000000005`,
    ])
    expect(out.documentIds).toEqual([`${ENVELOPE_ID}:f2000000-0000-0000-0000-000000000001`])
  })

  it('is parallel when every Sign activity shares one SigningGroup', () => {
    expect(transformEnvelope(ENVELOPE_GET_EXAMPLE, ENVELOPE_FILES_EXAMPLE).signingOrder).toBe(
      'parallel',
    )
  })

  it('is sequential when Sign activities span SigningGroups', () => {
    const activities = ENVELOPE_GET_EXAMPLE.Activities!.map((a, i) =>
      a.Action?.Sign ? { ...a, Action: { Sign: { ...a.Action.Sign, SigningGroup: i + 1 } } } : a,
    )
    const out = EnvelopeSchema.parse(
      transformEnvelope(
        { ...ENVELOPE_GET_EXAMPLE, Activities: activities },
        ENVELOPE_FILES_EXAMPLE,
      ),
    )
    expect(out.signingOrder).toBe('sequential')
  })

  it('is sequential when SignAsP7M activities span SignAsP7MGroups', () => {
    const p7m = (id: string, group: number) => ({
      Id: id,
      Status: 'Pending' as const,
      Action: {
        SignAsP7M: {
          ContactInformation: { Email: `${id}@example.com`, GivenName: 'P', Surname: id },
          SignAsP7MGroup: group,
        },
      },
    })
    const envelope = (groups: number[]) =>
      EnvelopeSchema.parse(
        transformEnvelope(
          { ...ENVELOPE_GET_EXAMPLE, Activities: groups.map((g, i) => p7m(`p${i}`, g)) },
          ENVELOPE_FILES_EXAMPLE,
        ),
      )
    expect(envelope([1, 2]).signingOrder).toBe('sequential')
    expect(envelope([1, 1]).signingOrder).toBe('parallel')
  })

  it.each([
    ['Active', 'sent'],
    ['Completed', 'completed'],
    ['Canceled', 'voided'],
    ['Expired', 'expired'],
    ['Rejected', 'declined'],
  ] as const)('maps EnvelopeStatus %s to %s', (upstream, canonical) => {
    const out = EnvelopeSchema.parse(
      transformEnvelope(
        { ...ENVELOPE_GET_EXAMPLE, EnvelopeStatus: upstream },
        ENVELOPE_FILES_EXAMPLE,
      ),
    )
    expect(out.status).toBe(canonical)
  })

  it('throws instead of inventing an id or subject', () => {
    expect(() =>
      transformEnvelope({ ...ENVELOPE_GET_EXAMPLE, Id: undefined }, ENVELOPE_FILES_EXAMPLE),
    ).toThrow(/no Id/)
    expect(() =>
      transformEnvelope({ ...ENVELOPE_GET_EXAMPLE, Name: undefined }, ENVELOPE_FILES_EXAMPLE),
    ).toThrow(/no Name/)
    expect(transformEnvelope(ENVELOPE_GET_EXAMPLE, {}).documentIds).toEqual([])
  })
})
