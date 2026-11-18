/**
 * GoSign5 `Dossier.process.tasks[].actors[]` → canonical Signer.
 *
 * GoSign5 (https://devportal.infocert.digital/gosign/documentation/GoSign5)
 * has no signer resource. A dossier's `process` holds `tasks`, each with
 * `actors` (oneOf `ActorRole` { roleExternalId } | `ActorUser`
 * { userExternalId, name }), `actions[].type` (`ActionType`: SIGN, APPROVE,
 * VIEW, …), `howMany` ("Number of actors needed to close the task, default
 * 1"), `order` ("Number that determines the parallelism of the task") and a
 * read-only `status` (`TaskStatus`: WORKING, DONE, CLOSED_BY_PROCESS,
 * CANCELLED).
 *
 * One Signer per `ActorUser` per task. `ActorRole` actors name a role, not a
 * person, and carry no name, so they are not signers.
 *
 * Email: `ActorUser` has no email. The only documented email is the task's
 * read-only `authorization` (`TaskAuthorization.email`, "User email"), which
 * belongs to the task, not to a named actor, so it is not mapped.
 * `TaskAuthorization.pin` ("Authorization pin") is dropped from `raw`.
 */
import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { strMap } from './shared'
import type { RawGoSign5Actor, RawGoSign5Dossier, RawGoSign5Task } from './envelope'

/** ActionTypes that put a signature (or seal) on the document. */
const SIGNING_ACTIONS = new Set(['SIGN', 'INITIALS', 'GRAPHOMETRIC', 'AUTOMATIC_SIGNATURE', 'SEAL'])

/** A user may act in several tasks of one dossier; the task makes the id unique. */
export function signerId(task: RawGoSign5Task, userExternalId: string): string {
  if (!task.externalId) throw new Error('infocert: GoSign5 Task has no externalId')
  return `${task.externalId}:${userExternalId}`
}

/** A copy of the task without `authorization.pin`, a credential. */
export function redactTask(task: RawGoSign5Task): RawGoSign5Task {
  if (!task.authorization) return task
  const { pin: _pin, ...authorization } = task.authorization
  return { ...task, authorization }
}

/**
 * Tasks in `order` (ascending, stable) when every task has one; otherwise in
 * the order the dossier lists them.
 */
export function tasksInOrder(tasks: RawGoSign5Task[]): RawGoSign5Task[] {
  if (tasks.some((t) => typeof t.order !== 'number')) return tasks
  return [...tasks].sort((a, b) => (a.order as number) - (b.order as number))
}

function roleOf(task: RawGoSign5Task): SignerRole {
  const types = (task.actions ?? []).map((a) => a.type)
  if (types.some((t) => t !== undefined && SIGNING_ACTIONS.has(t))) return 'signer'
  if (types.includes('APPROVE')) return 'approver'
  return 'unknown'
}

function statusOf(task: RawGoSign5Task, role: SignerRole): SignerStatus {
  if (task.status === 'WORKING') return 'sent'
  if (task.status === 'DONE' && role === 'signer') {
    // A task closes once `howMany` actors (spec `default: 1`) have acted. With
    // more actors than that, which of them signed is not in the dossier.
    const needed = task.howMany ?? 1
    if ((task.actors?.length ?? 0) <= needed) return 'signed'
  }
  return 'unknown'
}

export function transformSigner(
  task: RawGoSign5Task,
  actor: RawGoSign5Actor & { userExternalId: string },
  envelopeId: string,
): Signer {
  const id = signerId(task, actor.userExternalId)
  if (!actor.name) throw new Error(`infocert: GoSign5 ActorUser ${actor.userExternalId} has no name`)
  const role = roleOf(task)
  return {
    id,
    externalId: actor.userExternalId,
    envelopeId,
    name: actor.name,
    role,
    status: statusOf(task, role),
    platform: 'infocert',
    metadata: strMap({
      taskExternalId: task.externalId,
      taskStatus: task.status,
      taskOrder: task.order,
    }),
    raw: { task: redactTask(task), actor },
  }
}

export function transformSigners(dossier: RawGoSign5Dossier, envelopeId: string): Signer[] {
  const out: Signer[] = []
  for (const task of tasksInOrder(dossier.process?.tasks ?? [])) {
    for (const actor of task.actors ?? []) {
      const userExternalId = actor.userExternalId
      if (!userExternalId) continue
      out.push(transformSigner(task, { ...actor, userExternalId }, envelopeId))
    }
  }
  return out
}
