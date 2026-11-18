import { describe, it, expect } from 'vitest'
import {
  recipientActivities,
  transformSigner,
} from '../../../../../../../src/verticals/docsign/adapters/namirial/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { ENVELOPE_GET_EXAMPLE, ENVELOPE_ID } from '../fixtures'

const activities = ENVELOPE_GET_EXAMPLE.Activities!
const signers = () =>
  recipientActivities(activities).map((a) => SignerSchema.parse(transformSigner(a, ENVELOPE_ID)))

describe('Namirial transformSigner (EnvelopeGetActivity)', () => {
  it('maps every recipient activity and skips SignAutomatic', () => {
    expect(signers().map((s) => s.externalId)).toEqual([
      'a1000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000002',
      'a1000000-0000-0000-0000-000000000003',
      'a1000000-0000-0000-0000-000000000005',
    ])
  })

  it('maps a completed Sign activity to a signed signer', () => {
    const bob = signers()[0]!
    expect(bob).toMatchObject({
      id: `${ENVELOPE_ID}:a1000000-0000-0000-0000-000000000001`,
      envelopeId: ENVELOPE_ID,
      email: 'bob@example.com',
      name: 'Bob Builder',
      role: 'signer',
      status: 'signed',
      deliveredAt: '2017-07-22T08:55:00.000Z',
      signedAt: '2017-07-22T09:00:00.000Z',
      platform: 'namirial',
    })
    expect(bob.metadata).toEqual({
      action: 'Sign',
      activityStatus: 'Completed',
      group: '1',
      languageCode: 'EN',
    })
  })

  it('maps a rejected activity to declined with its StatusReason', () => {
    const eve = signers()[1]!
    expect(eve).toMatchObject({
      status: 'declined',
      declinedAt: '2017-07-23T10:00:00.000Z',
      declineReason: 'Budget not approved',
    })
    expect(eve.signedAt).toBeUndefined()
  })

  it('maps View to an unknown role and SendCopy to cc; unopened Pending is unknown', () => {
    const [, , grace, alice] = signers()
    expect(grace).toMatchObject({ role: 'unknown', status: 'unknown' })
    expect(alice).toMatchObject({ role: 'cc', status: 'unknown' })
  })

  it('does not report a completed View activity as signed', () => {
    const out = SignerSchema.parse(
      transformSigner(
        { ...activities[2]!, Status: 'Completed', FinishedDate: '2017-07-24T08:00:00Z' },
        ENVELOPE_ID,
      ),
    )
    expect(out.status).toBe('unknown')
    expect(out.signedAt).toBeUndefined()
  })

  it('maps a completed SignAsP7M activity to a signed signer', () => {
    const out = SignerSchema.parse(
      transformSigner(
        {
          Id: 'a1000000-0000-0000-0000-000000000009',
          Status: 'Completed',
          FinishedDate: '2017-07-24T08:00:00Z',
          Action: {
            SignAsP7M: {
              ContactInformation: { Email: 'p7m@example.com', GivenName: 'Pia', Surname: 'Rossi' },
              SignAsP7MGroup: 1,
            },
          },
        },
        ENVELOPE_ID,
      ),
    )
    expect(out).toMatchObject({ role: 'signer', status: 'signed' })
    expect(out.signedAt).toBe('2017-07-24T08:00:00.000Z')
  })

  it('maps an opened Pending activity to delivered', () => {
    const out = SignerSchema.parse(
      transformSigner({ ...activities[2]!, OpenedDate: '2017-07-24T08:00:00Z' }, ENVELOPE_ID),
    )
    expect(out.status).toBe('delivered')
  })

  it('throws for an activity without Id or recipient name', () => {
    expect(() => transformSigner({ ...activities[0]!, Id: undefined }, ENVELOPE_ID)).toThrow(
      /without an Id/,
    )
    expect(() =>
      transformSigner(
        { ...activities[0]!, Action: { Sign: { ContactInformation: {} } } },
        ENVELOPE_ID,
      ),
    ).toThrow(/no GivenName or Surname/)
    expect(() => transformSigner(activities[3]!, ENVELOPE_ID)).toThrow(/addresses no recipient/)
  })
})
