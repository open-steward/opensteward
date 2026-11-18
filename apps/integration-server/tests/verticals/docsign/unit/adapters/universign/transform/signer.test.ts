import { describe, it, expect } from 'vitest'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/universign/transform/signer'
import type { RawUniversignTransaction } from '../../../../../../../src/verticals/docsign/adapters/universign/transform/types'
import { CANCEL_TRANSACTION, START_TRANSACTION } from '../fixtures'

const tx = (v: unknown) => v as RawUniversignTransaction

function signersOf(t: RawUniversignTransaction) {
  return (t.participants ?? []).map((p) => SignerSchema.parse(transformSigner(p, t)))
}

describe('universign transformSigner (documented participants / instructions / actions)', () => {
  it('maps the "Start a transaction" participants and survives SignerSchema', () => {
    const [john, unknownP, jean, jane] = signersOf(tx(START_TRANSACTION))
    expect(jane!.id).toBe('tx_YLyDVeWbgW0z:jane@universign.com')
    expect(jane!.externalId).toBe('jane@universign.com')
    expect(jane!.envelopeId).toBe('tx_YLyDVeWbgW0z')
    expect(jane!.email).toBe('jane@universign.com')
    expect(jane!.role).toBe('signer')
    // action act_W4ZB4zng09ldY is "open"
    expect(jane!.status).toBe('sent')
    expect(jane!.metadata).toMatchObject({
      actionId: 'act_W4ZB4zng09ldY',
      minSignatureLevel: 'level1',
    })
    // jean signs after jane: action "waiting"
    expect(jean!.role).toBe('signer')
    expect(jean!.status).toBe('created')
    // No instruction names John or the unknown participant.
    expect(john!.role).toBe('unknown')
    expect(john!.status).toBe('unknown')
    // "the temporary ID of the unknown participant" is not an e-mail.
    expect(unknownP!.email).toBeUndefined()
    expect(unknownP!.name).toBe('$UnknownParticipant')
  })

  it('reads sentAt from the action started_at', () => {
    const jane = signersOf(tx(CANCEL_TRANSACTION)).find(
      (s) => s.externalId === 'jane@universign.com',
    )
    expect(jane!.sentAt).toBe('2026-09-21T13:51:36.863Z')
  })

  it('a closed action of a signer is signed at closed_at', () => {
    const t = tx({
      ...START_TRANSACTION,
      actions: [
        {
          id: 'act_1',
          actor: 'jane@universign.com',
          state: 'closed',
          started_at: '2026-09-21T13:51:36.863Z',
          closed_at: '2026-09-21T14:00:00.000Z',
          tasks: [],
        },
      ],
    })
    const jane = signersOf(t).find((s) => s.externalId === 'jane@universign.com')
    expect(jane!.status).toBe('signed')
    expect(jane!.signedAt).toBe('2026-09-21T14:00:00.000Z')
  })

  it('every participant of a draft is created; reviewers approve; editors edit', () => {
    const t = tx({
      ...START_TRANSACTION,
      state: 'draft',
      instructions: {
        ...START_TRANSACTION.instructions,
        reviews: [{ reviewer: 'John@universign.com', recipient: 'jane@universign.com' }],
        editions: [{ editor: '$UnknownParticipant', recipient: [] }],
      },
    })
    const [john, unknownP] = signersOf(t)
    expect(john!.role).toBe('approver')
    expect(unknownP!.role).toBe('editor')
    expect(signersOf(t).every((s) => s.status === 'created')).toBe(true)
  })

  it('prefers full_name, then designation', () => {
    const t = tx({
      ...START_TRANSACTION,
      participants: [
        { email: 'a@example.com', full_name: 'Ann A' },
        { email: '$1720534563486', designation: 'Employee' },
      ],
    })
    expect(signersOf(t).map((s) => s.name)).toEqual(['Ann A', 'Employee'])
  })

  it('full_name wins over designation when both are present', () => {
    const t = tx({
      ...START_TRANSACTION,
      participants: [{ email: '$1720534563486', designation: 'Employee', full_name: 'Ann A' }],
    })
    expect(signersOf(t).map((s) => s.name)).toEqual(['Ann A'])
  })

  it('a signature instruction on a visa field does not make a signer', () => {
    // Field type: "signature (if the participant needs to sign the document) -
    // visa (if the participant only needs to consult the document)".
    const t = tx({
      ...START_TRANSACTION,
      documents: START_TRANSACTION.documents.map((d) => ({
        ...d,
        fields: d.fields.map((f) => (f.id === 'fld_wWow' ? { ...f, type: 'visa' } : f)),
      })),
    })
    const signers = signersOf(t)
    expect(signers.find((s) => s.externalId === 'jane@universign.com')!.role).toBe('unknown')
    expect(signers.find((s) => s.externalId === 'jean@universign.com')!.role).toBe('signer')
  })

  it('a participant state of completed is a signature for a signer', () => {
    const t = tx({
      ...START_TRANSACTION,
      participants: START_TRANSACTION.participants.map((p) =>
        p.email === 'jane@universign.com' ? { ...p, state: 'completed' } : p,
      ),
    })
    const jane = signersOf(t).find((s) => s.externalId === 'jane@universign.com')
    // Her action act_W4ZB4zng09ldY is still "open"; the participant state decides.
    expect(jane!.status).toBe('signed')
  })

  it('a closed action of a non-signer is not signed and has no signedAt', () => {
    const t = tx({
      ...START_TRANSACTION,
      instructions: {
        ...START_TRANSACTION.instructions,
        reviews: [{ reviewer: 'John@universign.com', recipient: 'jane@universign.com' }],
      },
      actions: [
        {
          id: 'act_1',
          actor: 'John@universign.com',
          state: 'closed',
          started_at: '2026-09-21T13:51:36.863Z',
          closed_at: '2026-09-21T14:00:00.000Z',
          tasks: [],
        },
      ],
    })
    const john = signersOf(t).find((s) => s.externalId === 'John@universign.com')
    expect(john!.role).toBe('approver')
    expect(john!.status).toBe('unknown')
    expect(john!.signedAt).toBeUndefined()
    expect(john!.sentAt).toBe('2026-09-21T13:51:36.863Z')
  })
})
