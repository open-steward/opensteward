/**
 * Canonical schema barrel — the OpenAPI generator walks this file's exports
 * and emits one `components.schemas` entry per Zod schema it finds.
 */

export { WebhookEventSchema } from './webhook'
export { MoneySchema, AddressSchema, AttachmentSchema } from './shared'
export { ContactSchema } from './contact'
export { CompanySchema } from './company'
export { DealSchema } from './deal'
export { PipelineSchema, PipelineStageSchema } from './pipeline'
export { ActivitySchema } from './activity'
export { NoteSchema } from './note'
