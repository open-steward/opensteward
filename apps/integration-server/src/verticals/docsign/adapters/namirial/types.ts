/**
 * Namirial eSignAnyWhere API v6 response shapes, field for field from the
 * swagger definitions at
 * https://demo.esignanywhere.net/swagger/jsons/swagger.v6.json.
 * Every field is optional there (no `required` lists on response models).
 */

/** `EnvelopeFindEnvelope` — one row of `POST /v6/envelope/find`. */
export interface RawNamirialFoundEnvelope {
  Status?: 'Active' | 'Completed' | 'Canceled' | 'Expired' | 'Rejected'
  Id?: string
  Name?: string
  MetaData?: string
  EnvelopeBulkParentId?: string
  IsExpiringSoon?: boolean
}

/** `EnvelopeFindResponse`. */
export interface RawNamirialEnvelopeFindResponse {
  Envelopes?: RawNamirialFoundEnvelope[]
}

/** `EnvelopeGetContactInformation`. */
export interface RawNamirialContactInformation {
  Email?: string
  GivenName?: string
  Surname?: string
  PhoneNumber?: string
  LanguageCode?: string
}

/** `EnvelopeGetAction` — exactly one member is set per activity. */
export interface RawNamirialEnvelopeAction {
  SendCopy?: { ContactInformation?: RawNamirialContactInformation; CopyingGroup?: number }
  SignAutomatic?: { ProfileId?: string; RenderingLanguageCode?: string }
  Sign?: {
    ContactInformation?: RawNamirialContactInformation
    LongLivedDisposableCertificateWarnings?: Array<{ RequestId?: string; RemoteDeviceId?: string }>
    SigningGroup?: number
  }
  View?: { ContactInformation?: RawNamirialContactInformation; ViewingGroup?: number }
  SignAsP7M?: { ContactInformation?: RawNamirialContactInformation; SignAsP7MGroup?: number }
}

/** `EnvelopeGetActivity`. */
export interface RawNamirialEnvelopeActivity {
  Id?: string
  Status?: 'Pending' | 'Completed' | 'Rejected' | 'Delegated'
  StatusReason?: string
  FinishedDate?: string
  OpenedDate?: string
  Action?: RawNamirialEnvelopeAction
}

/** `EnvelopeGetResponse` — `GET /v6/envelope/{envelopeId}`. */
export interface RawNamirialEnvelope {
  Id?: string
  EnvelopeStatus?: 'Active' | 'Completed' | 'Canceled' | 'Expired' | 'Rejected'
  Name?: string
  SentDate?: string
  EnvelopeBulkParentId?: string
  Activities?: RawNamirialEnvelopeActivity[]
  SenderUserInformation?: { Email?: string; GivenName?: string; Surname?: string }
}

/** `EnvelopeGetFilesDocument`. */
export interface RawNamirialEnvelopeDocument {
  FileId?: string
  FileName?: string
  AuditTrailFileId?: string
  Attachments?: Array<{ FileId?: string; FileName?: string }>
  PageCount?: number
  DocumentNumber?: number
}

/** `EnvelopeGetFilesResponse` — `GET /v6/envelope/{envelopeId}/files`. */
export interface RawNamirialEnvelopeFiles {
  Documents?: RawNamirialEnvelopeDocument[]
  AuditTrail?: { FileId?: string; XmlFileId?: string }
  LegalDocuments?: Array<{
    FileId?: string
    FileName?: string
    ActivityId?: string
    Email?: string
  }>
}

/** `EnvelopeGetHistoryEvent`. */
export interface RawNamirialHistoryEvent {
  CreationDate?: string
  Type?: string
  AffectedRecipient?: { Id?: string; Email?: string; GivenName?: string; Surname?: string }
  Completed?: boolean
  CompletedOn?: string
  IsInErrorState?: boolean
  NextAttemptOn?: string
  Attempt?: number
  RemainingAttempts?: number
  ContextInformation?: string
  TraceId?: string
}

/** `EnvelopeGetHistoryResponse` — `GET /v6/envelope/{envelopeId}/history`. */
export interface RawNamirialEnvelopeHistory {
  Events?: RawNamirialHistoryEvent[]
  EnvelopeHasBeenDeleted?: boolean
  EnvelopeDeletionDate?: string
}

/** `TemplateFindTemplate` — one row of `POST /v6/template/find`. */
export interface RawNamirialFoundTemplate {
  Id?: string
  Name?: string
  MetaData?: string
}

/** `TemplateFindResponse`. */
export interface RawNamirialTemplateFindResponse {
  Templates?: RawNamirialFoundTemplate[]
}

/** `TemplateGetActivity` (only the members the transform reads are typed). */
export interface RawNamirialTemplateActivity {
  Id?: string
  Action?: {
    SignPlaceholder?: { SigningGroup?: number; PlaceholderLabel?: string }
    [kind: string]: unknown
  }
}

/** `TemplateGetResponse` — `GET /v6/template/{templateId}`. */
export interface RawNamirialTemplate {
  Id?: string
  Name?: string
  CreationDate?: string
  Activities?: RawNamirialTemplateActivity[]
}

/** `TemplateGetFilesResponse` — `GET /v6/template/{templateId}/files`. */
export interface RawNamirialTemplateFiles {
  Documents?: Array<{
    FileName?: string
    PageCount?: number
    Pages?: unknown[]
    DocumentNumber?: number
  }>
}
