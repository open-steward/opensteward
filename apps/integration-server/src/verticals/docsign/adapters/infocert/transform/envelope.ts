/**
 * GoSign5 `Dossier` → canonical Envelope.
 *
 * Every field read here is a property of the `Dossier` schema in the GoSign5
 * OpenAPI (https://devportal.infocert.digital/gosign/documentation/GoSign5).
 */
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import type { SigningOrder } from '../../../schema/shared'
import { pickStr, strMap, toIso } from './shared'
import { redactTask, signerId, tasksInOrder } from './signer'

/** GoSign5 `Document`. */
export interface RawGoSign5Document {
  mimeType?: string
  originalFilename?: string
  title?: string
  order?: number
  visibilityLevel?: string
  externalId?: string
  fileStatus?: string
  numberPages?: number
  createdBy?: string
  createdAt?: string
  [key: string]: unknown
}

/** GoSign5 `Actor` = oneOf `ActorRole` | `ActorUser`. */
export interface RawGoSign5Actor {
  roleExternalId?: string
  userExternalId?: string
  name?: string
}

/** GoSign5 `Task`. */
export interface RawGoSign5Task {
  externalId?: string
  order?: number
  taskAction?: string
  taskActionType?: string
  type?: string
  actions?: Array<{ documentExternalId?: string; type?: string; [key: string]: unknown }>
  howMany?: number
  actors?: RawGoSign5Actor[]
  status?: string
  /** `TaskAuthorization` (readOnly): pin, email, phoneNumber, authorizationType. */
  authorization?: { pin?: string; email?: string; phoneNumber?: string; authorizationType?: string }
  [key: string]: unknown
}

/** GoSign5 `Dossier`. */
export interface RawGoSign5Dossier {
  externalId?: string
  customId?: string
  code?: string
  loadedBy?: string
  loadedByRole?: string
  loadedByUser?: string
  type?: string
  sysGenerator?: string
  subject?: string
  starred?: boolean
  useType?: string
  status?: string
  loadingMethod?: string
  expireAt?: string
  dossierIsLocked?: boolean
  dossierIsTemplate?: boolean
  documents?: RawGoSign5Document[]
  messages?: { text?: string; [key: string]: unknown }
  process?: { tasks?: RawGoSign5Task[]; [key: string]: unknown }
  [key: string]: unknown
}

/**
 * `DossierStatus` enum: DRAFT, IN_PROGRESS, WORKED, TO_REJECT, REJECTED,
 * DELETED, STORED, TEMPORARY, CANCELLED. The spec describes none of them
 * beyond the name, so only the unambiguous ones are mapped; the rest are
 * `unknown`, with the upstream value kept in `metadata.gosignStatus`.
 */
function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'DRAFT':
      return 'draft'
    case 'IN_PROGRESS':
      return 'sent'
    case 'WORKED':
      return 'completed'
    case 'REJECTED':
      return 'declined'
    case 'CANCELLED':
      return 'voided'
    default:
      return 'unknown'
  }
}

/**
 * `Task.order` is "Number that determines the parallelism of the task": tasks
 * sharing an order run in parallel, distinct orders run in sequence. With one
 * task (or none) there is nothing to sequence. With several tasks and any
 * `order` missing, the spec gives no answer, so this throws.
 */
function signingOrderOf(dossierId: string, tasks: RawGoSign5Task[]): SigningOrder {
  if (tasks.length <= 1) return 'parallel'
  const orders = tasks.map((t) => t.order)
  if (orders.some((o) => typeof o !== 'number')) {
    throw new Error(`infocert: GoSign5 Dossier ${dossierId} has a task with no order`)
  }
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawGoSign5Dossier): Envelope {
  const id = pickStr(raw.externalId)
  if (!id) throw new Error('infocert: GoSign5 Dossier has no externalId')
  const subject = pickStr(raw.subject)
  if (subject === undefined) throw new Error(`infocert: GoSign5 Dossier ${id} has no subject`)

  const tasks = raw.process?.tasks ?? []
  const signingOrder = signingOrderOf(id, tasks)
  const signerIds: string[] = []
  for (const task of tasksInOrder(tasks)) {
    for (const actor of task.actors ?? []) {
      if (actor.userExternalId) signerIds.push(signerId(task, actor.userExternalId))
    }
  }
  const documentIds: string[] = []
  for (const d of raw.documents ?? []) {
    if (!d.externalId) throw new Error(`infocert: GoSign5 Dossier ${id} has a document with no externalId`)
    documentIds.push(d.externalId)
  }

  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject,
    message: pickStr(raw.messages?.text),
    senderId: pickStr(raw.loadedBy),
    senderName: pickStr(raw.loadedByUser),
    signingOrder,
    signerIds,
    documentIds,
    expiresAt: toIso(raw.expireAt),
    platform: 'infocert',
    metadata: strMap({
      code: raw.code,
      customId: raw.customId,
      type: raw.type,
      useType: raw.useType,
      loadingMethod: raw.loadingMethod,
      gosignStatus: raw.status,
    }),
    raw: raw.process?.tasks
      ? { ...raw, process: { ...raw.process, tasks: raw.process.tasks.map(redactTask) } }
      : raw,
  }
}
