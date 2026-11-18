/**
 * CaseComment and EmailMessage → Message. A case's conversation is both: the
 * comments agents add to it, and the emails sent and received on it.
 *
 * CaseComment:
 * https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_casecomment.htm
 * EmailMessage:
 * https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_emailmessage.htm
 * Audit fields (CreatedById, CreatedDate, LastModifiedDate):
 * https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/system_fields.htm
 */
import type { Message } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export const CASE_COMMENT_FIELDS = [
  'Id',
  'ParentId',
  'CommentBody',
  'IsPublished',
  'CreatedById',
  'CreatedDate',
  'LastModifiedDate',
] as const

export interface RawSalesforceCaseComment {
  attributes?: { type?: string; url?: string }
  Id: string
  ParentId?: string | null
  CommentBody?: string | null
  IsPublished?: boolean | null
  CreatedById?: string | null
  CreatedDate?: string | null
  LastModifiedDate?: string | null
}

/**
 * A comment is written by a User (CreatedById is "ID of the User who created
 * this record"). IsPublished: "Indicates whether the CaseComment is visible
 * to customers in the Self-Service portal (true) or not (false)" — so an
 * unpublished comment is internal.
 */
export function transformCaseComment(raw: RawSalesforceCaseComment): Message {
  return {
    id: raw.Id,
    externalId: raw.Id,
    ticketId: pickStr(raw.ParentId) ?? '',
    authorId: pickStr(raw.CreatedById) ?? '',
    authorType: 'user',
    body: pickStr(raw.CommentBody) ?? '',
    type: raw.IsPublished === true ? 'public' : 'internal',
    createdAt: toIso(raw.CreatedDate) ?? new Date(0).toISOString(),
    platform: 'salesforce-service',
    metadata: strMap({ sobject: 'CaseComment' }),
    raw,
  }
}

export const EMAIL_MESSAGE_FIELDS = [
  'Id',
  'ParentId',
  'Subject',
  'TextBody',
  'FromAddress',
  'FromId',
  'Incoming',
  'HasAttachment',
  'Status',
  'MessageDate',
  'CreatedById',
  'CreatedDate',
  'LastModifiedDate',
] as const

export interface RawSalesforceEmailMessage {
  attributes?: { type?: string; url?: string }
  Id: string
  ParentId?: string | null
  Subject?: string | null
  TextBody?: string | null
  FromAddress?: string | null
  FromId?: string | null
  Incoming?: boolean | null
  HasAttachment?: boolean | null
  Status?: string | null
  MessageDate?: string | null
  CreatedById?: string | null
  CreatedDate?: string | null
  LastModifiedDate?: string | null
}

/**
 * Incoming: "Indicates whether the email was received (true) or sent
 * (false)" — received mail is from the customer, sent mail from an agent.
 * FromId is "The contact, lead, or user who sent the email", when Salesforce
 * matched one; otherwise the sender is only FromAddress, an email address
 * rather than an id, so it stays in metadata and authorId falls back to the
 * sending user (CreatedById) for outgoing mail, or is left empty. TextBody is "The
 * body of the email, in plain text format" (HtmlBody is not read). Emails on
 * a case are what the customer sees, so they are public. HasAttachment is a
 * yes/no, not a count, so it is kept in metadata and attachmentCount is left
 * unset.
 */
export function transformEmailMessage(raw: RawSalesforceEmailMessage): Message {
  const incoming = raw.Incoming === true
  return {
    id: raw.Id,
    externalId: raw.Id,
    ticketId: pickStr(raw.ParentId) ?? '',
    authorId: pickStr(raw.FromId) ?? (incoming ? '' : (pickStr(raw.CreatedById) ?? '')),
    authorType: incoming ? 'contact' : 'user',
    body: pickStr(raw.TextBody) ?? '',
    type: 'public',
    createdAt: toIso(raw.MessageDate) ?? toIso(raw.CreatedDate) ?? new Date(0).toISOString(),
    platform: 'salesforce-service',
    metadata: strMap({
      sobject: 'EmailMessage',
      subject: raw.Subject,
      fromAddress: raw.FromAddress,
      status: raw.Status,
      hasAttachment: raw.HasAttachment,
    }),
    raw,
  }
}
