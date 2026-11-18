import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * actaSIGN task → canonical Signer.
 *
 * Source: the actaSIGN OpenAPI 3.0.3 document served at
 * https://my.actasign.ch/api-docs/ (schemas `RemoteTaskResponse`, `Group`,
 * `Person`), returned by GET /v2/requests/{requestUid}/tasks/{taskUid}
 * "Retrieve any task in the tenant". A task "is assigned to a one person or a
 * group of people"; it is the unit that is signed, so one task is one Signer.
 *
 * Only documented fields are read. The spec documents `status` by example
 * only ("active"), so status is derived from the documented lifecycle dates
 * (`assigned`, `completed`, `declined`, `delegated`, `recalled`) and the raw
 * value is kept in metadata.
 */
export interface RawActasignPerson {
  email: string
  fullname?: string
  mobile?: string
  language?: string
  roles?: string[]
}

export interface RawActasignGroup {
  displayName?: string
  people: RawActasignPerson[]
}

export interface RawActasignTask {
  requestUid?: string
  taskUid?: string
  clientRef?: string
  orchestrationMode?: string
  status?: string
  taskType?: string
  sealUid?: string
  recipients?: RawActasignGroup
  assigned?: string
  completed?: string
  declined?: string
  delegated?: string
  recalled?: string
  declineReason?: string
}

/** `taskType` enum as documented on `TenantWebhookEvent.taskType`. */
function mapRole(taskType: string | undefined): SignerRole {
  switch (taskType) {
    case 'ses':
    case 'aes':
    case 'aes_ch':
    case 'qes_ch':
    case 'qes_eu':
    case 'seal':
      return 'signer'
    case 'approve':
      return 'approver'
    case 'info':
      return 'cc'
    default:
      return 'unknown'
  }
}

/**
 * `completed` means signed only for a signature task. The spec's taskType
 * description says `info` "just informs the recipients and allows to access
 * the portfolio" and `approve` "approves task without an electronic
 * signature", and the canonical status has no approved/completed value, so a
 * completed non-signature task is 'unknown' and its date goes to metadata.
 */
function mapStatus(raw: RawActasignTask, role: SignerRole): SignerStatus {
  if (raw.declined) return 'declined'
  if (raw.completed) return role === 'signer' ? 'signed' : 'unknown'
  if (raw.recalled || raw.delegated) return 'unknown'
  if (raw.assigned) return 'sent'
  return 'created'
}

function signerName(group: RawActasignGroup | undefined, people: RawActasignPerson[]): string {
  if (people.length === 1) return pickStr(people[0]!.fullname) ?? people[0]!.email
  const display = pickStr(group?.displayName)
  if (display) return display
  if (people.length > 0) return people.map((p) => p.email).join(', ')
  throw new Error('actaSIGN task has no recipients to name the signer by')
}

export function transformSigner(raw: RawActasignTask): Signer {
  const taskUid = pickStr(raw.taskUid)
  const requestUid = pickStr(raw.requestUid)
  if (!taskUid) throw new Error('actaSIGN task response is missing taskUid')
  if (!requestUid) throw new Error('actaSIGN task response is missing requestUid')
  const people = raw.recipients?.people ?? []
  const role = mapRole(raw.taskType)
  const signed = role === 'signer'
  return {
    id: `${requestUid}:${taskUid}`,
    externalId: taskUid,
    envelopeId: requestUid,
    email: people.length === 1 ? people[0]!.email : undefined,
    name: signerName(raw.recipients, people),
    role,
    status: mapStatus(raw, role),
    sentAt: toIso(raw.assigned),
    signedAt: signed ? toIso(raw.completed) : undefined,
    declinedAt: toIso(raw.declined),
    declineReason: pickStr(raw.declineReason),
    platform: 'actasign',
    metadata: strMap({
      taskType: raw.taskType,
      status: raw.status,
      clientRef: raw.clientRef,
      orchestrationMode: raw.orchestrationMode,
      completedAt: signed ? undefined : toIso(raw.completed),
      delegatedAt: toIso(raw.delegated),
      recalledAt: toIso(raw.recalled),
      recipientEmails: people.length > 1 ? people.map((p) => p.email).join(',') : undefined,
    }),
    raw,
  }
}
