/**
 * Field classification for every listable CRM resource — see
 * docs/security/data-classification.md. CRM schemas are snake_case.
 */
import { FIELD_RULES as R, type ResourceClassification } from '@opensteward/shared'
import {
  ActivitySchema,
  CompanySchema,
  ContactSchema,
  DealSchema,
  NoteSchema,
  PipelineSchema,
} from './index'

export const RESOURCE_SCHEMAS = {
  contacts: ContactSchema,
  companies: CompanySchema,
  deals: DealSchema,
  pipelines: PipelineSchema,
  activities: ActivitySchema,
  notes: NoteSchema,
}

export const CLASSIFICATION: Record<string, ResourceClassification> = {
  contacts: {
    '*': R.internal,
    first_name: R.piiName,
    last_name: R.piiName,
    name: R.piiName,
    email: R.piiEmail,
    phone: R.piiPhone,
    mobile: R.piiPhone,
    address: R.piiAddress,
  },
  // A company can be a sole trader — its phone and address are a person's.
  companies: { '*': R.internal, phone: R.piiPhone, address: R.piiAddress },
  deals: { '*': R.internal, value: R.financial },
  pipelines: { '*': R.internal },
  activities: { '*': R.internal, subject: R.pii, note: R.pii },
  notes: { '*': R.internal, content: R.pii },
}
