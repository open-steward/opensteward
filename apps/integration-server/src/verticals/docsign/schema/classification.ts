/**
 * Field classification for every listable docsign resource — see
 * docs/security/data-classification.md.
 */
import { FIELD_RULES as R, type ResourceClassification } from '@opensteward/shared'
import { EnvelopeSchema, TemplateSchema } from './index'

export const RESOURCE_SCHEMAS = {
  envelopes: EnvelopeSchema,
  templates: TemplateSchema,
}

export const CLASSIFICATION: Record<string, ResourceClassification> = {
  envelopes: {
    '*': R.internal,
    senderEmail: R.piiEmail,
    senderName: R.piiName,
    // Free text written to the signers, usually naming them.
    subject: R.pii,
    message: R.pii,
  },
  templates: { '*': R.internal },
}
