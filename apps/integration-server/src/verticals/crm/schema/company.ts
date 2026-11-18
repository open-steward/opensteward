import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'
import { AddressSchema } from './shared'

export const CompanySchema = z
  .object({
    id: z.string().describe('Platform-specific company identifier.').meta({ example: 'co_acme' }),
    name: z.string().describe('Legal or display name of the organisation.').meta({ example: 'Acme Industries' }),
    domain: z.string().optional().describe('Primary web domain (e.g. `example.com`).').meta({ example: 'acme.example' }),
    phone: z.string().optional().describe('Main phone number.').meta({ example: '+14155550123' }),
    industry: z.string().optional().describe('Industry or sector. Platform-defined.').meta({ example: 'Manufacturing' }),
    size: z.number().int().min(0).optional().describe('Approximate headcount.').meta({ example: 350 }),
    owner_id: z.string().optional().describe('Platform user who owns the record.').meta({ example: 'usr_olivia' }),
    address: AddressSchema.optional().describe('Registered or primary postal address.'),
    tags: z.array(z.string()).optional().describe('Free-form labels.').meta({ example: ['vip', 'q1-expansion'] }),
    created_at: IsoDatetime.optional().describe('ISO 8601 timestamp when the company was created on the platform.').meta({ example: '2026-01-15T09:30:00Z' }),
    updated_at: IsoDatetime.optional().describe('ISO 8601 timestamp of the last modification.').meta({ example: '2026-02-01T14:20:00Z' }),
    accounting_organization_id: z
      .string()
      .optional()
      .describe('Cross-vertical link — Accounting Organization.id when the same entity is known there.').meta({ example: 'org_acme' }),
    metadata: z
      .record(z.string(), z.unknown())
      .describe('Complete unmodified raw platform response.'),
  })
  .describe('An organisation or account in the CRM.')
export type Company = z.infer<typeof CompanySchema>
