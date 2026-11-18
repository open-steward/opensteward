/**
 * A small, hand-written catalog source for the analytics tests: one resource
 * type exercising every column type, mask kind, nested rule, secret, name
 * collision and the implicit-PII upstream payload, and one payments type whose
 * `raw` payload SQL strips.
 */
import { z } from 'zod'
import { FIELD_RULES as R, type ResourceClassification } from '@opensteward/shared'
import { buildCatalogFrom, type CatalogSource } from '../../src/analytics/view-catalog'

export const ContactFixtureSchema = z.object({
  id: z.string(),
  first_name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  national_id: z.string().nullish(),
  address: z.object({ line1: z.string(), city: z.string(), country: z.string() }).nullish(),
  amount: z.number().nullish(),
  active: z.boolean().optional(),
  created_at: z.iso.datetime().nullish(),
  updated_at: z.iso.datetime().nullish(),
  birthDate: z.iso.date().nullish(),
  due_date: z.string().nullish(),
  telephones: z.array(z.object({ telephone: z.string(), kind: z.string() })).optional(),
  api_token: z.string().optional(),
  stage: z.enum(['lead', 'customer']).optional(),
  data: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()),
})

export const CONTACT_CLASSIFICATION: ResourceClassification = {
  '*': R.internal,
  first_name: R.piiName,
  email: R.piiEmail,
  phone: R.piiPhone,
  national_id: R.piiHmac,
  address: R.piiAddress,
  amount: R.financial,
  birthDate: R.pii,
  'telephones[].telephone': R.piiPhone,
  api_token: R.secret,
}

export const ChargeFixtureSchema = z.object({
  id: z.string(),
  amount: z.number(),
  customer_email: z.string().nullish(),
  raw: z.record(z.string(), z.unknown()).optional(),
})

export const CHARGE_CLASSIFICATION: ResourceClassification = {
  '*': R.internal,
  customer_email: R.piiEmail,
}

export const FIXTURE_SOURCES: CatalogSource[] = [
  {
    vertical: 'crm',
    resourceType: 'contacts',
    schema: ContactFixtureSchema,
    classification: CONTACT_CLASSIFICATION,
  },
  {
    vertical: 'payments',
    resourceType: 'charges',
    schema: ChargeFixtureSchema,
    classification: CHARGE_CLASSIFICATION,
  },
]

export const fixtureCatalog = () => buildCatalogFrom(FIXTURE_SOURCES)

export const FIXTURE_TABLES = {
  resources: { schema: 'public', name: 'resources' },
  credentials: { schema: 'public', name: 'credentials' },
  syncJobs: { schema: 'public', name: 'sync_jobs' },
  tenants: { schema: 'public', name: 'tenants' },
}
