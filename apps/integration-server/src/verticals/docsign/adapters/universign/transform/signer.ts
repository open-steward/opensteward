/**
 * Universign transaction participant → canonical Signer.
 *
 * Universign has no signer resource: participants live in the transaction's
 * `participants[ ]`, their role in `instructions`, and their progress in
 * `actions[ ]` ("The Transaction object", https://apps.universign.com/docs/api/).
 */
import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { emailOrUndefined, pickStr, scopedId, strMap, toIso } from './shared'
import type {
  RawUniversignAction,
  RawUniversignParticipant,
  RawUniversignTransaction,
} from './types'

/**
 * - `instructions.signatures[ ]` link a signer to a field; a field of type
 *   `signature` is "if the participant needs to sign the document", `visa` "if
 *   the participant only needs to consult the document".
 * - `instructions.reviews[ ].reviewer` "The reviewer's email address."
 * - `instructions.editions[ ].editor` "The editor's email address or designation".
 *
 * A participant with only visa fields, or no instruction at all, has no
 * canonical role.
 */
function mapRole(tx: RawUniversignTransaction, participant: string): SignerRole {
  const fieldType = new Map<string, string | undefined>()
  for (const d of tx.documents ?? []) for (const f of d.fields ?? []) fieldType.set(f.id, f.type)
  const ins = tx.instructions
  if (
    (ins?.signatures ?? []).some(
      (s) => s.signer === participant && fieldType.get(s.field) === 'signature',
    )
  ) {
    return 'signer'
  }
  if ((ins?.reviews ?? []).some((r) => r.reviewer === participant)) return 'approver'
  if ((ins?.editions ?? []).some((e) => e.editor === participant)) return 'editor'
  return 'unknown'
}

/**
 * A draft transaction has sent nothing. Otherwise the participant's action
 * says where they are: `open` ("the participant can perform his/her action"),
 * `waiting` ("the participant cannot perform his/her action yet") or `closed`
 * ("the action is completed"); a participant `state` of `completed` says the
 * same as a closed action. Completion is a signature only for a signer.
 */
function mapStatus(
  tx: RawUniversignTransaction,
  p: RawUniversignParticipant,
  action: RawUniversignAction | undefined,
  role: SignerRole,
): SignerStatus {
  if (tx.state === 'draft') return 'created'
  const done = p.state === 'completed' || action?.state === 'closed'
  if (done) return role === 'signer' ? 'signed' : 'unknown'
  switch (action?.state) {
    case 'waiting':
      return 'created'
    case 'open':
      return 'sent'
    default:
      return 'unknown'
  }
}

export function transformSigner(p: RawUniversignParticipant, tx: RawUniversignTransaction): Signer {
  const action = (tx.actions ?? []).find((a) => a.actor === p.email)
  const role = mapRole(tx, p.email)
  const status = mapStatus(tx, p, action, role)
  return {
    id: scopedId(tx.id, p.email),
    externalId: p.email,
    envelopeId: tx.id,
    email: emailOrUndefined(p.email),
    // `full_name` ("as it will display in the signature") is optional; an
    // unknown participant has a `designation` instead. Failing both, the
    // participant's own identifier (`email`) is the only name Universign has.
    name: pickStr(p.full_name) ?? pickStr(p.designation) ?? p.email,
    role,
    status,
    sentAt: toIso(action?.started_at),
    signedAt: status === 'signed' ? toIso(action?.closed_at) : undefined,
    platform: 'universign',
    metadata: strMap({
      participantState: p.state,
      actionState: action?.state,
      actionId: action?.id,
      minSignatureLevel: p.min_signature_level,
    }),
    raw: p,
  }
}
