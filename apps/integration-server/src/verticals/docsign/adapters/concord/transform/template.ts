/**
 * Concord template -> canonical Template.
 *
 * Concord has no separate template resource: "An Agreement is a contract,
 * disregarding its status. A draft, a contract in progress, a negotiation,
 * an executed document, a template are Agreements."
 * (https://api.doc.concordnow.com/concord-openapi-bundled.yaml, tag Agreement).
 * A template is an agreement in stage `TEMPLATE` or `TEMPLATE_AUTO`, so it is
 * read from the same two shapes as an envelope.
 *
 * Neither shape carries a document count. documentCount is therefore passed
 * in: the adapter reads it as the length of the template agreement's
 * "List the attachments" reply (GET .../agreements/{agreementUid}/attachments,
 * Listtheattachmentsresponse, required `attachments`), which is the same set
 * of records listDocuments returns for that agreement.
 *
 * Neither shape names signer roles, and the spec documents no template role
 * list, so signerRoles is [].
 */
import type { Template } from '../../../schema/template'
import type { RawConcordAgreement, RawConcordAgreementListItem } from './envelope'
import { msToIso, requireStr, strMap } from './shared'

export const TEMPLATE_STAGES: readonly string[] = ['TEMPLATE', 'TEMPLATE_AUTO']

function requireCount(count: number, id: string): number {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`concord template ${id} has no attachment count`)
  }
  return count
}

/** The agreement's stage, or a 404 when it is not a template stage. */
export function requireTemplateStatus(status: unknown, id: string): string {
  const s = requireStr(status, `agreement ${id} status`)
  if (!TEMPLATE_STAGES.includes(s)) {
    throw Object.assign(new Error(`concord agreement ${id} is not a template (status ${s})`), {
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  }
  return s
}

export function transformTemplate(
  raw: RawConcordAgreementListItem,
  attachmentCount: number,
): Template {
  const id = requireStr(raw.uuid, 'agreement uuid')
  const status = requireTemplateStatus(raw.status, id)
  return {
    id,
    externalId: id,
    name: requireStr(raw.title, `agreement ${id} title`),
    description: raw.description || undefined,
    signerRoles: [],
    documentCount: requireCount(attachmentCount, id),
    createdAt: msToIso(raw.createdAt),
    updatedAt: msToIso(raw.modifiedAt),
    platform: 'concord',
    metadata: strMap({
      concordStatus: status,
      createdBy: raw.createdBy,
      createdByName: raw.createdByName,
      organizationId: raw.organizationId,
      folderId: raw.folderId,
    }),
    raw,
  }
}

export function transformTemplateAgreement(
  raw: RawConcordAgreement,
  attachmentCount: number,
): Template {
  const id = requireStr(raw.uid, 'agreement uid')
  const meta = raw.metadata
  if (!meta || typeof meta !== 'object') throw new Error(`concord agreement ${id} has no metadata`)
  const status = requireTemplateStatus(meta.status, id)
  return {
    id,
    externalId: id,
    name: requireStr(meta.title, `agreement ${id} title`),
    description: meta.description || undefined,
    signerRoles: [],
    documentCount: requireCount(attachmentCount, id),
    createdAt: msToIso(raw.creation?.date),
    platform: 'concord',
    metadata: strMap({
      concordStatus: status,
      organizationId: meta.organization?.id,
      folderId: raw.folderId,
    }),
    raw,
  }
}
