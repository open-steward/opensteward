/**
 * actaSIGN task → canonical Signer.
 *
 * Fixture built from the `RemoteTaskResponse`, `Group` and `Person` schemas in
 * the actaSIGN OpenAPI 3.0.3 document (info.version 3.64.0) served at
 * https://my.actasign.ch/api-docs/ (swagger-ui-init.js). Example values are
 * the spec's own (`taskType` "ses", `clientRef` "signer-1", UID
 * "lq0kp480rgm1uiibo6ud1y83", fullname "John Doe").
 */
import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawActasignTask,
} from '../../../../../../../src/verticals/docsign/adapters/actasign/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

const REQ = 'lq0kp480rgm1uiibo6ud1y83'

function task(over: Partial<RawActasignTask> = {}): RawActasignTask {
  return {
    requestUid: REQ,
    taskUid: 'tk0kp480rgm1uiibo6ud1y83',
    clientRef: 'signer-1',
    orchestrationMode: 'actasign',
    status: 'active',
    taskType: 'ses',
    recipients: {
      people: [{ email: 'john.doe@example.com', fullname: 'John Doe', roles: ['owner'] }],
    },
    assigned: '2026-01-02T10:00:00.000Z',
    ...over,
  }
}

describe('actasign transformSigner', () => {
  it('maps a documented single-recipient task and parses with SignerSchema', () => {
    const s = SignerSchema.parse(transformSigner(task()))
    expect(s.id).toBe(`${REQ}:tk0kp480rgm1uiibo6ud1y83`)
    expect(s.externalId).toBe('tk0kp480rgm1uiibo6ud1y83')
    expect(s.envelopeId).toBe(REQ)
    expect(s.email).toBe('john.doe@example.com')
    expect(s.name).toBe('John Doe')
    expect(s.role).toBe('signer')
    expect(s.status).toBe('sent')
    expect(s.sentAt).toBe('2026-01-02T10:00:00.000Z')
    expect(s.platform).toBe('actasign')
    expect(s.metadata).toMatchObject({ taskType: 'ses', status: 'active', clientRef: 'signer-1' })
  })

  it('status follows the documented lifecycle timestamps', () => {
    expect(transformSigner(task({ completed: '2026-01-04T10:00:00Z' })).status).toBe('signed')
    const d = SignerSchema.parse(
      transformSigner(task({ declined: '2026-01-04T10:00:00Z', declineReason: 'No' })),
    )
    expect(d.status).toBe('declined')
    expect(d.declinedAt).toBe('2026-01-04T10:00:00.000Z')
    expect(d.declineReason).toBe('No')
    expect(transformSigner(task({ assigned: undefined })).status).toBe('created')
    expect(transformSigner(task({ recalled: '2026-01-04T10:00:00Z' })).status).toBe('unknown')
    expect(transformSigner(task({ delegated: '2026-01-04T10:00:00Z' })).status).toBe('unknown')
  })

  it('a declined task stays declined even when it also carries a completed date', () => {
    const s = transformSigner(
      task({ completed: '2026-01-04T10:00:00Z', declined: '2026-01-03T10:00:00Z' }),
    )
    expect(s.status).toBe('declined')
  })

  it('a completed signature task carries signedAt from the documented completed date', () => {
    const s = SignerSchema.parse(transformSigner(task({ completed: '2026-01-04T10:00:00Z' })))
    expect(s.status).toBe('signed')
    expect(s.signedAt).toBe('2026-01-04T10:00:00.000Z')
  })

  // The spec's taskType description: "`info`: This task just informs the
  // recipients and allows to access the portfolio" and "`approve`: recipients
  // approves task without an electronic signature". Neither is a signature.
  it('a completed info or approve task is not reported as signed', () => {
    for (const taskType of ['info', 'approve']) {
      const s = SignerSchema.parse(
        transformSigner(task({ taskType, completed: '2026-01-04T10:00:00Z' })),
      )
      expect(s.status).toBe('unknown')
      expect(s.signedAt).toBeUndefined()
      expect(s.metadata.completedAt).toBe('2026-01-04T10:00:00.000Z')
    }
  })

  it('a completed task of an undocumented taskType is not reported as signed', () => {
    const s = transformSigner(task({ taskType: 'none', completed: '2026-01-04T10:00:00Z' }))
    expect(s.status).toBe('unknown')
    expect(s.signedAt).toBeUndefined()
  })

  it('role follows the documented taskType enum', () => {
    const role = (taskType: string) => transformSigner(task({ taskType })).role
    for (const t of ['ses', 'aes', 'aes_ch', 'qes_ch', 'qes_eu', 'seal'])
      expect(role(t)).toBe('signer')
    expect(role('approve')).toBe('approver')
    expect(role('info')).toBe('cc')
    expect(role('none')).toBe('unknown')
  })

  it('a person without a fullname is named by the required email', () => {
    const s = transformSigner(task({ recipients: { people: [{ email: 'a@example.com' }] } }))
    expect(s.name).toBe('a@example.com')
    expect(() => SignerSchema.parse(s)).not.toThrow()
  })

  it('a group task has no single email and is named by the group displayName', () => {
    const s = transformSigner(
      task({
        recipients: {
          displayName: 'Legal',
          people: [{ email: 'a@example.com' }, { email: 'b@example.com' }],
        },
      }),
    )
    expect(s.email).toBeUndefined()
    expect(s.name).toBe('Legal')
    expect(s.metadata.recipientEmails).toBe('a@example.com,b@example.com')
    expect(() => SignerSchema.parse(s)).not.toThrow()
  })

  it('throws rather than invent an id when taskUid or requestUid is missing', () => {
    expect(() => transformSigner(task({ taskUid: undefined }))).toThrow(/taskUid/)
    expect(() => transformSigner(task({ requestUid: undefined }))).toThrow(/requestUid/)
  })
})
