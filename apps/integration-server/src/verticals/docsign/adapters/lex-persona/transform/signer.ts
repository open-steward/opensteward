/**
 * Goodflag Signature step recipient → canonical `Signer`.
 *
 * Recipients live in `Workflow.steps[].recipients[]`
 * (https://docs.goodflag.com/wm/api-reference/documentation-api/token-portail/workflows/retrieve-workflow.md).
 * A recipient has no id of its own; `email` is required and a step's `id` is
 * required, so a signer is identified as `<stepId>:<email>`: the same person
 * may be a recipient of two steps.
 */
import type { Signer, SignerStatus } from '../../../schema/signer'
import type { RawGoodflagRecipient, RawGoodflagStep, RawGoodflagWorkflow } from './envelope'
import { str } from './shared'

export function signerIdOf(
  step: Pick<RawGoodflagStep, 'id'>,
  r: Pick<RawGoodflagRecipient, 'email'>,
): string {
  return `${step.id}:${r.email}`
}

/**
 * The API documents no per-recipient status. What it does document:
 * `isStarted` "Indique si l'étape est démarrée" (an unstarted step has sent
 * nothing), and `currentRecipientEmails` "La liste des adresses email des
 * destinataires actuellement invités à signer ou valider". Anything else
 * (signed, refused, or a step finished on `requiredRecipients` without this
 * recipient) cannot be told apart, so it is `unknown`.
 */
function mapStatus(
  step: RawGoodflagStep,
  r: RawGoodflagRecipient,
  workflow: RawGoodflagWorkflow,
): SignerStatus {
  if (!step.isStarted) return 'created'
  if ((workflow.currentRecipientEmails ?? []).includes(r.email)) return 'sent'
  return 'unknown'
}

export function transformSigner(
  r: RawGoodflagRecipient,
  step: RawGoodflagStep,
  stepIndex: number,
  workflow: RawGoodflagWorkflow,
): Signer {
  const id = signerIdOf(step, r)
  const metadata: Record<string, string> = {
    stepId: step.id,
    stepType: step.stepType,
    consentPageId: r.consentPageId,
  }
  if (str(r.userId)) metadata['userId'] = r.userId as string
  if (str(r.country)) metadata['country'] = r.country
  if (str(r.organizationId)) metadata['organizationId'] = r.organizationId as string
  return {
    id,
    externalId: id,
    envelopeId: workflow.id,
    email: r.email,
    // firstName and lastName are both required on a Workflow recipient.
    name: `${r.firstName} ${r.lastName}`.trim(),
    // "stepType … Le type de l'étape : signature ou approval."
    role: step.stepType === 'approval' ? 'approver' : 'signer',
    status: mapStatus(step, r, workflow),
    // Steps run in order; recipients within a step act in parallel.
    routingOrder: stepIndex + 1,
    platform: 'lex-persona',
    metadata,
    raw: r,
  }
}

/** Every recipient of every step, in step order. */
export function signersOf(workflow: RawGoodflagWorkflow): Signer[] {
  return (workflow.steps ?? []).flatMap((step, i) =>
    step.recipients.map((r) => transformSigner(r, step, i, workflow)),
  )
}
