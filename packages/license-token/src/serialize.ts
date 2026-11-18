import type { TokenPurpose } from './constants'
import {
  FooterSchema,
  LicensePayloadSchema,
  RevocationPayloadSchema,
  type Footer,
  type LicensePayload,
  type RevocationPayload,
} from './schema'

const utf8 = new TextEncoder()

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((k) => [k, sortKeys(record[k])]),
    )
  }
  return value
}

/**
 * The payload bytes buildSigningInput and assembleToken both use: schema-validated (which also
 * drops duplicate features and revoked IDs), then JSON with keys sorted at every level. That
 * makes the bytes independent of input key order and of zod's output order. Throws a ZodError
 * when the payload does not match the purpose's schema.
 */
export function canonicalPayloadBytes(
  payload: LicensePayload | RevocationPayload,
  purpose: TokenPurpose = 'license',
): Uint8Array {
  const parsed =
    purpose === 'license'
      ? LicensePayloadSchema.parse(payload)
      : RevocationPayloadSchema.parse(payload)
  return utf8.encode(JSON.stringify(sortKeys(parsed)))
}

export function canonicalFooterBytes(footer: Footer): Uint8Array {
  return utf8.encode(JSON.stringify(sortKeys(FooterSchema.parse(footer))))
}
