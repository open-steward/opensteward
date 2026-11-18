/**
 * Shared schema primitives used across canonical resource shapes in this
 * vertical. Keep this file small — it is a starter set. Add a new file under
 * `src/core/schema/` for each top-level canonical resource.
 */

import { z } from 'zod'
import { Iso4217Currency } from '@opensteward/shared'

export const MoneySchema = z
  .object({
    amount: z.number().min(0).describe('Amount in the currency, non-negative.').meta({ example: 1200000 }),
    currency: Iso4217Currency.meta({ example: 'USD' }),
  })
  .describe('Monetary value with explicit currency.')
export type Money = z.infer<typeof MoneySchema>

export { AddressSchema } from '@opensteward/shared'
export type { Address } from '@opensteward/shared'

export const AttachmentSchema = z
  .object({
    id: z.string().describe('Platform-specific attachment identifier.').meta({ example: 'att_q1_proposal' }),
    filename: z.string().describe('Original filename as uploaded.').meta({ example: 'acme-q1-expansion-proposal.pdf' }),
    url: z.url().describe('Signed download URL, if the platform exposes one.').meta({ example: 'https://app.acme.example/attachments/att_q1_proposal.pdf' }),
    mimeType: z.string().describe('MIME type (e.g. `application/pdf`).').meta({ example: 'application/pdf' }),
  })
  .describe('File attachment metadata.')
export type Attachment = z.infer<typeof AttachmentSchema>
