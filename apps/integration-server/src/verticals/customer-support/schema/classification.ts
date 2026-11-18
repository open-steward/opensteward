/**
 * Field classification for every listable customer-support resource — see
 * docs/security/data-classification.md.
 */
import { FIELD_RULES as R, type ResourceClassification } from '@opensteward/shared'
import {
  ContactSchema,
  MacroSchema,
  TagSchema,
  TeamSchema,
  TicketSchema,
  UserSchema,
} from './index'

export const RESOURCE_SCHEMAS = {
  tickets: TicketSchema,
  contacts: ContactSchema,
  users: UserSchema,
  tags: TagSchema,
  teams: TeamSchema,
  macros: MacroSchema,
}

export const CLASSIFICATION: Record<string, ResourceClassification> = {
  // The subject is the customer's own words.
  tickets: { '*': R.internal, subject: R.pii },
  contacts: { '*': R.internal, email: R.piiEmail, name: R.piiName, phone: R.piiPhone },
  // Agents are people too.
  users: { '*': R.internal, email: R.piiEmail, name: R.piiName },
  tags: { '*': R.internal },
  teams: { '*': R.internal },
  macros: { '*': R.internal },
}
