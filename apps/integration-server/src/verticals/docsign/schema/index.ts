/**
 * Canonical schema barrel for the docsign vertical. The OpenAPI generator
 * walks every Zod schema exported from this file and registers it under
 * `components.schemas`. Always re-export new schemas here.
 */

export { SigningOrderSchema } from './shared'
export type { SigningOrder } from './shared'

export { EnvelopeSchema, EnvelopeStatusSchema } from './envelope'
export type { Envelope, EnvelopeStatus } from './envelope'

export { SignerSchema, SignerRoleSchema, SignerStatusSchema } from './signer'
export type { Signer, SignerRole, SignerStatus } from './signer'

export { DocumentSchema } from './document'
export type { Document } from './document'

export {
  AuditTrailEntrySchema,
  AuditTrailEventTypeSchema,
} from './audit-trail-entry'
export type { AuditTrailEntry, AuditTrailEventType } from './audit-trail-entry'

export { TemplateSchema } from './template'
export type { Template } from './template'

export {
  WebhookEventSchema,
  WebhookResourceTypeSchema,
  WebhookActionSchema,
} from './webhook'
export type { WebhookEvent, WebhookResourceType, WebhookAction } from './webhook'
