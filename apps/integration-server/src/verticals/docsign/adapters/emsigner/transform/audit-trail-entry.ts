/**
 * emSigner document log -> canonical AuditTrailEntry.
 *
 * GET /api/GetDocumentLog (https://api.emsigner.com/swagger/docs/v1) returns
 * `DocumentLogView[]` — { DocumentName, DocumentLogs: DocumentLog[] } — and a
 * DocumentLog is { DateTime (date-time), UserEmail, Action, IPAddress,
 * OSandBrowser }. The Postman collection
 * (https://documenter.getpostman.com/view/40123569/2sAYBbe8yV) describes it
 * as "the activity log of a document, including actions performed, user
 * details, and timestamps."
 *
 * No emSigner doc lists the values of `Action`, so eventType is 'unknown'
 * and `Action` is the description. The id is the entry's position in the
 * workflow's log, flattened in reply order (`<workflowId>:<index>`).
 *
 * occurredAt is required, and DateTime is its only source. The Swagger
 * declares it `"format": "date-time"`, which in Swagger 2.0 is RFC 3339
 * date-time and carries an offset. One without a zone is outside that
 * format and throws rather than being placed in this process's zone.
 */
import type { AuditTrailEntry } from '../../../schema/audit-trail-entry'
import type { RawEmSignerDocumentLog } from '../types'
import { emailOrUndefined, isoOrUndefined, optStr, strMap } from './shared'

export function transformAuditTrailEntry(
  raw: RawEmSignerDocumentLog,
  documentName: string | undefined,
  workflowId: string,
  index: number,
): AuditTrailEntry {
  const id = `${workflowId}:${index}`
  const occurredAt = isoOrUndefined(raw.DateTime)
  if (!occurredAt) {
    throw new Error(
      `emsigner log entry ${id} has no DateTime with a zone (got ${JSON.stringify(raw.DateTime)})`,
    )
  }
  return {
    id,
    externalId: id,
    envelopeId: workflowId,
    occurredAt,
    eventType: 'unknown',
    description: optStr(raw.Action) ?? '',
    actorEmail: emailOrUndefined(raw.UserEmail),
    actorIp: optStr(raw.IPAddress),
    platform: 'emsigner',
    metadata: strMap({ documentName, osAndBrowser: raw.OSandBrowser }),
    raw,
  }
}
