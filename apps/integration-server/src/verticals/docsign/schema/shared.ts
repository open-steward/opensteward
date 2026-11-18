/**
 * Shared schema primitives for the docsign vertical.
 *
 * Document signing is strictly read-only metadata. The canonical schema
 * intentionally has no `content`, `url`, `previewUrl`, `signatureImage`,
 * or KYC-attachment field — absence is the firewall, same principle as
 * `PaymentMethod` having no `pan` in payments.
 */

import { z } from 'zod'

export const SigningOrderSchema = z.enum(['parallel', 'sequential'])
export type SigningOrder = z.infer<typeof SigningOrderSchema>
