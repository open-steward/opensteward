import { z } from 'zod'
import { ExternalId, Iso4217Currency } from '@opensteward/shared'
import { AddressSchema } from './shared'

export const OrganizationSchema = z.object({
  id: ExternalId.optional().meta({ example: 'org_acme' }),
  name: z.string().optional().meta({ example: 'Acme Industries' }),
  legalName: z.string().optional().meta({ example: 'Acme Industries, Inc.' }),
  organizationCode: z.string().optional().meta({ example: 'acme-industries' }),
  taxNumber: z.string().optional().meta({ example: 'US-123456789' }),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  timezone: z.string().optional().describe('IANA tz database identifier (e.g. `America/New_York`).').meta({ example: 'America/Los_Angeles' }),
  website: z.url().optional().meta({ example: 'https://www.acme.example' }),
  fiscalYearEndMonth: z.number().int().min(1).max(12).optional().describe('1 = January, 12 = December.').meta({ example: 12 }),
  parentId: z.string().optional().meta({ example: 'org_acme_holdings' }),
  address: AddressSchema.optional(),
  createdAt: z.date().optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: z.date().optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type Organization = z.infer<typeof OrganizationSchema>
