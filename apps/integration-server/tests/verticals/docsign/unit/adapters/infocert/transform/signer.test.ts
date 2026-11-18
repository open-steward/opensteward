/**
 * GoSign5 `Dossier.process.tasks[].actors[]` → canonical Signer.
 * `Task`, `ActorUser`, `TaskStatus` and `ActionType` are read from the GoSign5
 * OpenAPI (https://devportal.infocert.digital/gosign/documentation/GoSign5).
 */
import { describe, it, expect } from 'vitest'
import { transformSigners } from '../../../../../../../src/verticals/docsign/adapters/infocert/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { DOSSIER_EXAMPLE } from '../dossier.fixture'

const TASK = DOSSIER_EXAMPLE.process!.tasks![0]!

describe('infocert transformSigners (GoSign5 task actors)', () => {
  it('maps each user actor of each task', () => {
    const out = transformSigners(DOSSIER_EXAMPLE, 'dossier-1').map((s) => SignerSchema.parse(s))
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      id: 'tid1672671:XYZ4242',
      externalId: 'XYZ4242',
      envelopeId: 'dossier-1',
      name: 'John Smith',
      role: 'signer',
      status: 'signed',
      platform: 'infocert',
      metadata: { taskExternalId: 'tid1672671', taskStatus: 'DONE', taskOrder: '1' },
    })
    expect(out[0]!.email).toBeUndefined()
    expect(out[1]).toMatchObject({
      id: 'tid1672672:ABC1111',
      name: 'Jane Roe',
      role: 'approver',
      status: 'sent',
    })
  })

  it('does not call a DONE task signed for every actor when fewer were needed', () => {
    const task = {
      ...TASK,
      howMany: 1,
      actors: [
        { userExternalId: 'U1', name: 'One' },
        { userExternalId: 'U2', name: 'Two' },
      ],
    }
    const out = transformSigners({ ...DOSSIER_EXAMPLE, process: { tasks: [task] } }, 'd')
    expect(out.map((s) => SignerSchema.parse(s).status)).toEqual(['unknown', 'unknown'])
  })

  it('does not call an actor of a DONE approval task signed', () => {
    const task = { ...TASK, actions: [{ documentExternalId: 'd1', type: 'APPROVE' }] }
    const out = transformSigners({ ...DOSSIER_EXAMPLE, process: { tasks: [task] } }, 'd')
    expect(SignerSchema.parse(out[0]).role).toBe('approver')
    expect(out[0]!.status).toBe('unknown')
  })

  it('applies the documented howMany default of 1 when howMany is absent', () => {
    const one = { ...TASK, howMany: undefined }
    const two = {
      ...one,
      actors: [
        { userExternalId: 'U1', name: 'One' },
        { userExternalId: 'U2', name: 'Two' },
      ],
    }
    const single = transformSigners({ ...DOSSIER_EXAMPLE, process: { tasks: [one] } }, 'd')
    expect(SignerSchema.parse(single[0]).status).toBe('signed')
    const pair = transformSigners({ ...DOSSIER_EXAMPLE, process: { tasks: [two] } }, 'd')
    expect(pair.map((s) => s.status)).toEqual(['unknown', 'unknown'])
  })

  it.each([
    ['SIGN', 'signer'],
    ['INITIALS', 'signer'],
    ['GRAPHOMETRIC', 'signer'],
    ['AUTOMATIC_SIGNATURE', 'signer'],
    ['SEAL', 'signer'],
    ['APPROVE', 'approver'],
    ['VIEW', 'unknown'],
  ] as const)('maps ActionType %s → role %s', (type, role) => {
    const task = { ...TASK, actions: [{ documentExternalId: 'd1', type }] }
    const out = transformSigners({ ...DOSSIER_EXAMPLE, process: { tasks: [task] } }, 'd')
    expect(SignerSchema.parse(out[0]).role).toBe(role)
  })

  it('lists task actors in Task.order', () => {
    const [a, b] = DOSSIER_EXAMPLE.process!.tasks!
    const out = transformSigners({ ...DOSSIER_EXAMPLE, process: { tasks: [b!, a!] } }, 'd')
    expect(out.map((s) => SignerSchema.parse(s).id)).toEqual([
      'tid1672671:XYZ4242',
      'tid1672672:ABC1111',
    ])
  })

  it('drops TaskAuthorization.pin from raw and maps no email', () => {
    const task = {
      ...TASK,
      authorization: { pin: '123456', email: 'john@doe.com', authorizationType: 'PIN' },
    }
    const out = transformSigners({ ...DOSSIER_EXAMPLE, process: { tasks: [task] } }, 'd')
    const s = SignerSchema.parse(out[0])
    expect(JSON.stringify(s.raw)).not.toContain('123456')
    expect(JSON.stringify(s.raw)).toContain('john@doe.com')
    expect(s.email).toBeUndefined()
  })

  it.each([
    ['CLOSED_BY_PROCESS', 'unknown'],
    ['CANCELLED', 'unknown'],
  ] as const)('maps TaskStatus %s → %s', (status, expected) => {
    const out = transformSigners(
      { ...DOSSIER_EXAMPLE, process: { tasks: [{ ...TASK, status }] } },
      'd',
    )
    expect(SignerSchema.parse(out[0]).status).toBe(expected)
  })

  it('skips role actors, which name no person', () => {
    const task = { ...TASK, actors: [{ roleExternalId: 'XYZ4242' }] }
    expect(transformSigners({ ...DOSSIER_EXAMPLE, process: { tasks: [task] } }, 'd')).toEqual([])
  })

  it('throws rather than inventing a name when ActorUser.name is absent', () => {
    const task = { ...TASK, actors: [{ userExternalId: 'XYZ4242' }] }
    expect(() => transformSigners({ ...DOSSIER_EXAMPLE, process: { tasks: [task] } }, 'd')).toThrow(
      /name/,
    )
  })

  it('throws rather than inventing an id when the task externalId is absent', () => {
    const task = { ...TASK, externalId: undefined }
    expect(() => transformSigners({ ...DOSSIER_EXAMPLE, process: { tasks: [task] } }, 'd')).toThrow(
      /externalId/,
    )
  })
})
