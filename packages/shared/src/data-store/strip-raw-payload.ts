/**
 * Keeping upstream payloads out of the cache and off the wire.
 *
 * Unstripped, canonical resources carry the platform's entire unmodified
 * response. For most verticals that duplicates fields the canonical schema
 * already exposes, but two carry financial identifiers it does not:
 *
 *   payments    — 88 `bank_account`, 22 `iban`, 16 `cardNumber` across adapters,
 *                 in `raw`. The schema exposes only `last4`.
 *   accounting  — 17 adapters declare `iban` / `bank_account` / `routing_number`
 *                 (crunch, firefly-iii, moss). `metadata` IS the payload here,
 *                 and there is no canonical IBAN field.
 *
 * So those two are opt-in, off by default, per vertical. The other seven are
 * deliberately untouched — this function returns their records unchanged, by
 * identity, so it costs nothing on their hot path.
 *
 * WHERE THIS RUNS MATTERS. It is applied at the storage and serialisation
 * boundary, never inside a transform. 2,186 of accounting's 2,400 test files
 * assert `expect(transform(raw).metadata).toBe(raw)` — reference identity, a
 * pattern CONTRIBUTING mandates — and those assert transform *purity*, which
 * stays true. Moving this into transforms would break them en masse and touch
 * ~4,250 adapter files.
 *
 * Two things are NOT behind the flag, because no operator may legitimately opt
 * into them — see `scrubPaymentSecrets`.
 */

/** `raw` carries the payload here, and the flag decides whether it survives. */
const RAW_FIELD_VERTICAL = 'payments'

/** `metadata` IS the payload here — there is no separate `raw` field. */
const DUMP_METADATA_VERTICAL = 'accounting'

/**
 * Sensitive authentication data. Stripped unconditionally, flag or no flag.
 *
 * PCI DSS 3.3.1 prohibits storing these after authorisation — no exception for
 * encryption, none for a compliant operator, only card issuers. A feature flag
 * cannot make it acceptable, so it does not get to.
 *
 * `network-international` and `unzer` both declare a bare `cvv`/`cvc` on their
 * raw types today.
 *
 * Note this is the security *code*, not a verification *result*: `cvvResponse`
 * and `avsResponse` carry a match indicator like `M`, are not SAD, and are
 * deliberately absent from this list.
 */
const SAD_KEYS = new Set([
  'cvv',
  'cvv2',
  'cvc',
  'cvc2',
  'csc',
  'securitycode',
  'cardverificationvalue',
  'track1',
  'track2',
  'trackdata',
  'magstripe',
  'pin',
  'pinblock',
])

/**
 * Names that mean SAD sometimes and something ordinary the rest of the time.
 *
 * `cid` is American Express's card ID — genuinely SAD — and also the single
 * most common abbreviation for "customer id" or "correlation id". Stripping it
 * on the name alone would silently delete identifiers from records that have
 * nothing to do with cards, and a silently missing id is a miserable bug to
 * trace. So these strip only when the *value* has the shape of a security
 * code: three or four digits and nothing else.
 *
 * No payments adapter declares `cid` today. This is for the one that will.
 */
const AMBIGUOUS_SAD_KEYS = new Set(['cid'])

/** A card security code is 3–4 digits. A customer id is almost never that. */
function looksLikeSecurityCode(value: unknown): boolean {
  return typeof value === 'string' && /^\d{3,4}$/.test(value)
}

/** Deepest nesting walked before giving up. Upstream payloads are not this deep. */
const MAX_DEPTH = 12

/** A PAN is 13–19 digits and passes Luhn. Separators are ignored. */
function looksLikeFullPan(value: string): boolean {
  const digits = value.replace(/[ -]/g, '')
  if (!/^\d{13,19}$/.test(digits)) return false
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

/**
 * Remove card secrets from a payments record, whether or not the flag is on.
 *
 * Two jobs:
 *
 *  - **SAD**, per the list above. Unconditional by regulation.
 *  - **Full PANs**, by shape rather than by field name. `helcim` documents its
 *    `cardNumber` as *"F6L4 — never the full PAN"* and `paymob` its `pan` as a
 *    *"PAN suffix"*, and both sit in curated `metadata` which the flag does not
 *    reach. They are very probably telling the truth; the problem is that
 *    nothing checks, so an upstream shape change would land a real PAN in the
 *    cache silently. Checking the value converts that trust into enforcement
 *    and leaves the truncated forms — which PCI permits — untouched.
 *
 * Returns the same object when there was nothing to remove, so the common case
 * allocates nothing.
 */
function scrubPaymentSecrets(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
    return typeof value === 'string' && looksLikeFullPan(value) ? undefined : value
  }

  if (Array.isArray(value)) {
    let changed = false
    const out = value.map((entry) => {
      const scrubbed = scrubPaymentSecrets(entry, depth + 1)
      if (scrubbed !== entry) changed = true
      return scrubbed
    })
    return changed ? out : value
  }

  let changed = false
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalised = key.toLowerCase().replace(/[_-]/g, '')
    if (SAD_KEYS.has(normalised)) {
      changed = true
      continue
    }
    if (AMBIGUOUS_SAD_KEYS.has(normalised) && looksLikeSecurityCode(entry)) {
      changed = true
      continue
    }
    const scrubbed = scrubPaymentSecrets(entry, depth + 1)
    if (scrubbed === undefined && entry !== undefined) {
      changed = true
      continue
    }
    if (scrubbed !== entry) changed = true
    out[key] = scrubbed
  }
  return changed ? out : value
}

/**
 * Apply the vertical's payload policy to one canonical record.
 *
 * `keepRawPayload` is the operator's per-vertical setting, read per request.
 * Records from the seven unflagged verticals are returned untouched by
 * identity.
 */
export function stripRawPayload<T>(vertical: string, record: T, keepRawPayload: boolean): T {
  if (record === null || typeof record !== 'object') return record

  if (vertical === RAW_FIELD_VERTICAL) {
    // The floor runs either way; only `raw` is behind the flag.
    const scrubbed = scrubPaymentSecrets(record) as T
    if (keepRawPayload) return scrubbed
    if (!('raw' in (scrubbed as object))) return scrubbed
    const { raw: _raw, ...rest } = scrubbed as Record<string, unknown>
    return rest as T
  }

  if (vertical === DUMP_METADATA_VERTICAL && !keepRawPayload) {
    if (!('metadata' in (record as object))) return record
    // Optional on all 13 accounting schemas, so omitting the key validates.
    const { metadata: _metadata, ...rest } = record as Record<string, unknown>
    return rest as T
  }

  return record
}

/** Convenience for the list paths, preserving identity when nothing changed. */
export function stripRawPayloads<T>(vertical: string, records: T[], keepRawPayload: boolean): T[] {
  let changed = false
  const out = records.map((record) => {
    const stripped = stripRawPayload(vertical, record, keepRawPayload)
    if (stripped !== record) changed = true
    return stripped
  })
  return changed ? out : records
}

/** Which verticals the flag applies to. Everything else is a no-op. */
export const RAW_PAYLOAD_VERTICALS: readonly string[] = [RAW_FIELD_VERTICAL, DUMP_METADATA_VERTICAL]
