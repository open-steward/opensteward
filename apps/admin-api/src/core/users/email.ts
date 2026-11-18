/**
 * Console-user email addresses.
 *
 * One schema for every way an address arrives — an admin typing it, an OIDC
 * `email` claim, a SAML attribute, a SCIM `emails` entry — so an address the
 * console would refuse from an admin is never stored because an IdP sent it.
 *
 * An email address is PII. It is never written to an audit entry (writers
 * record `emailChanged: true` instead), and `LOG_REDACT_PATHS` redacts any
 * `email` field a log line carries.
 */
import { z } from 'zod'

/** RFC 5321 caps a forward path at 256 octets, the address itself at 254. */
export const EMAIL_MAX_LENGTH = 254

export const EmailAddress = z
  .string()
  .trim()
  .max(EMAIL_MAX_LENGTH)
  .email()
  .meta({ description: 'Email address (trimmed, at most 254 characters).', example: 'olivia@northwind.example' })

/** A valid, trimmed address, or null for anything else (absent, blank, junk). */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const parsed = EmailAddress.safeParse(value)
  return parsed.success ? parsed.data : null
}
