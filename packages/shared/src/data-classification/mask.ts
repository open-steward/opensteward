/**
 * Applying a field classification to a stored record.
 *
 * Runs at the read boundary of the data-access surface (viewer, detail,
 * export), AFTER `stripRawPayload`: that removes what may never be stored or
 * served for a vertical, this hides what THIS reader may not see.
 *
 * Never mutates its input — the record may be shared with a cache.
 */
import { createHmac, hkdfSync } from 'node:crypto'
import {
  DEFAULT_RULE_KEY,
  IMPLICIT_PII_FIELDS,
  type FieldClass,
  type FieldRule,
  type MaskKind,
  type MaskOptions,
  type ResourceClassification,
} from './types'

export const REDACTED = '[REDACTED]'

/** HKDF info label for the masking key. Changing it re-keys every `hmac` mask. */
export const DATA_MASK_KEY_LABEL = 'opensteward-data-mask-v1'

/** Hex characters kept from an `hmac` mask (64 bits — joinable, not reversible). */
const HMAC_HEX_LENGTH = 16

/**
 * Derive the key for `hmac` masks from the deployment's STORE_SECRET.
 *
 * A separate key (HKDF, labelled) rather than the secret itself, so a masked
 * value can never be used to test guesses against the encryption key.
 */
export function deriveMaskKey(storeSecret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', storeSecret, Buffer.alloc(0), DATA_MASK_KEY_LABEL, 32))
}

// ── Path handling ─────────────────────────────────────────────────────────

interface Segment {
  key: string
  array: boolean
}

function parsePath(path: string): Segment[] {
  return path.split('.').map((raw) => {
    const array = raw.endsWith('[]')
    return { key: array ? raw.slice(0, -2) : raw, array }
  })
}

/** Segment keys without array markers: `emails[].email` → ['emails', 'email']. */
function plainSegments(path: string): string[] {
  return parsePath(path).map((s) => s.key)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)
}

type Visitor = (parent: Record<string, unknown> | unknown[], key: string | number) => void

/** Call `fn` for every location in `container` the path segments address. */
function visit(container: unknown, segs: Segment[], idx: number, fn: Visitor): void {
  if (!isPlainObject(container)) return
  const seg = segs[idx]!
  const last = idx === segs.length - 1
  const keys = seg.key === '*' ? Object.keys(container) : [seg.key]
  for (const key of keys) {
    if (!(key in container)) continue
    const value = container[key]
    if (seg.array) {
      if (!Array.isArray(value)) {
        // `x[]` on a non-array: treat the field itself as the leaf.
        if (last) fn(container, key)
        continue
      }
      if (last) {
        fn(container, key)
        continue
      }
      for (const el of value) visit(el, segs, idx + 1, fn)
    } else if (last) {
      fn(container, key)
    } else {
      visit(value, segs, idx + 1, fn)
    }
  }
}

// ── Masks ────────────────────────────────────────────────────────────────

function maskEmail(s: string): string {
  const at = s.lastIndexOf('@')
  if (at <= 0) return '***'
  return `${s[0]}***${s.slice(at)}`
}

function maskPhone(s: string): string {
  const digits = s.replace(/\D/g, '').length
  let seen = 0
  return s.replace(/\d/g, (d) => {
    seen++
    return seen > digits - 2 ? d : '*'
  })
}

function maskName(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w[0]}***`)
    .join(' ')
}

const COUNTRY_KEY = /^country(code)?$/i

function maskAddress(v: unknown): unknown {
  if (v === null || v === undefined) return v
  if (Array.isArray(v)) return v.map(maskAddress)
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      if (COUNTRY_KEY.test(k)) out[k] = val
      else if (val === null || val === undefined) out[k] = val
      else if (typeof val === 'object') out[k] = maskAddress(val)
      else out[k] = '***'
    }
    return out
  }
  return '***'
}

function hmacHex(value: unknown, key: string | Buffer): string {
  const input = typeof value === 'string' ? value : JSON.stringify(value)
  return createHmac('sha256', key).update(input).digest('hex').slice(0, HMAC_HEX_LENGTH)
}

/** Render one value under a mask. Null/undefined pass through (absence is not sensitive). */
export function maskValue(value: unknown, kind: MaskKind, hmacKey?: string | Buffer): unknown {
  if (value === null || value === undefined) return value
  switch (kind) {
    case 'redact':
      return REDACTED
    case 'hmac':
      if (hmacKey === undefined || hmacKey.length === 0) {
        // No key → cannot produce a stable token; fail closed to redaction.
        return REDACTED
      }
      return hmacHex(value, hmacKey)
    case 'address':
      return maskAddress(value)
    case 'email':
    case 'phone':
    case 'name': {
      if (Array.isArray(value)) return value.map((v) => maskValue(v, kind, hmacKey))
      if (typeof value === 'number' && kind === 'phone') return maskPhone(String(value))
      if (typeof value !== 'string') return REDACTED
      if (kind === 'email') return maskEmail(value)
      if (kind === 'phone') return maskPhone(value)
      return maskName(value)
    }
  }
}

// ── Rule resolution ──────────────────────────────────────────────────────

const RANK: Record<FieldClass, number> = {
  public: 0,
  internal: 1,
  financial: 2,
  pii: 3,
  secret: 4,
}

const IMPLICIT_RULE: FieldRule = { class: 'pii', mask: 'redact' }
const INTERNAL_RULE: FieldRule = { class: 'internal' }

/** Every explicitly classified path (the `'*'` default excluded). */
export function classifiedPaths(classification: ResourceClassification): string[] {
  return Object.keys(classification).filter((k) => k !== DEFAULT_RULE_KEY)
}

/** Whether the pattern (possibly with `*`) addresses exactly `path`'s segments. */
function segmentsMatch(pattern: string[], path: string[]): boolean {
  if (pattern.length !== path.length) return false
  return pattern.every((p, i) => p === '*' || p === path[i])
}

/**
 * The rule that governs a top-level field no explicit path mentions: implicit
 * PII for the upstream payload, else the `'*'` default, else `internal`.
 */
function fallbackRule(topLevel: string, classification: ResourceClassification): FieldRule {
  if (IMPLICIT_PII_FIELDS.includes(topLevel)) return IMPLICIT_RULE
  return classification[DEFAULT_RULE_KEY] ?? INTERNAL_RULE
}

/**
 * The most specific rule for a dotted path (array markers ignored): an exact or
 * wildcard match, else the nearest classified ancestor, else the fallback for
 * its top-level field.
 */
export function resolveFieldRule(path: string, classification: ResourceClassification): FieldRule {
  const segs = plainSegments(path)
  const entries = classifiedPaths(classification).map((k) => ({
    segs: plainSegments(k),
    rule: classification[k]!,
  }))
  for (let len = segs.length; len >= 1; len--) {
    const prefix = segs.slice(0, len)
    const exact = entries.find((e) => e.segs.join('.') === prefix.join('.'))
    if (exact) return exact.rule
    const wild = entries.find((e) => segmentsMatch(e.segs, prefix))
    if (wild) return wild.rule
  }
  // A path under a top-level field some rule addresses more deeply
  // (`billingAddress.city` classified, `billingAddress` asked) is governed by
  // the fallback, which is what applyMasking does too.
  return fallbackRule(segs[0]!, classification)
}

export function resolveFieldClass(
  path: string,
  classification: ResourceClassification,
): FieldClass {
  return resolveFieldRule(path, classification).class
}

/**
 * The most restrictive class that touches a path: its own rule, any
 * classified ancestor's, and any classified descendant's. A filter on `a`
 * reads everything under `a`, and a filter on `a.b` under a masked `a` reads
 * what the mask hid — so both directions count. Also what a guard should ask
 * of a top-level field whose sensitive parts are classified one level down
 * (`telephones[].telephone`).
 */
export function effectiveFieldClass(
  path: string,
  classification: ResourceClassification,
): FieldClass {
  const segs = plainSegments(path)
  let worst = resolveFieldClass(path, classification)
  const consider = (c: FieldClass) => {
    if (RANK[c] > RANK[worst]) worst = c
  }
  for (let len = segs.length - 1; len >= 1; len--) {
    consider(resolveFieldClass(segs.slice(0, len).join('.'), classification))
  }
  for (const key of classifiedPaths(classification)) {
    const ks = plainSegments(key)
    if (ks.length > segs.length && segmentsMatch(ks.slice(0, segs.length), segs)) {
      consider(classification[key]!.class)
    }
  }
  return worst
}

/**
 * Whether a reader may filter or search on `path`.
 *
 * A filter on a masked field is an oracle: `email contains "jane"` answers
 * the question the mask exists to refuse. So `pii` is searchable only with
 * `revealPii`, `secret` never, and `financial` only while it is not masked.
 */
export function isSearchable(
  path: string,
  classification: ResourceClassification,
  revealPii: boolean,
  maskFinancial = false,
): boolean {
  const cls = effectiveFieldClass(path, classification)
  if (cls === 'secret') return false
  if (cls === 'pii') return revealPii
  if (cls === 'financial') return !maskFinancial
  return true
}

// ── applyMasking ─────────────────────────────────────────────────────────

type Action = 'keep' | 'mask' | 'remove'

function actionFor(rule: FieldRule, opts: MaskOptions): Action {
  switch (rule.class) {
    case 'secret':
      return 'remove'
    case 'pii':
      return opts.revealPii ? 'keep' : 'mask'
    case 'financial':
      return opts.maskFinancial ? 'mask' : 'keep'
    default:
      return 'keep'
  }
}

/**
 * A copy of `record` as this reader may see it:
 *
 *   secret     → removed, always
 *   pii        → masked unless `revealPii` (mask per rule, default `redact`)
 *   financial  → masked only with `maskFinancial`
 *   `metadata` / `raw` → pii/redact unless classified otherwise
 *
 * Rules apply shallowest first, so a masked parent hides its children
 * wholesale; a `secret` below a revealed parent is still removed.
 */
export function applyMasking<T>(
  record: T,
  classification: ResourceClassification,
  opts: MaskOptions = {},
): T {
  if (!isPlainObject(record)) return record
  const out = structuredClone(record) as Record<string, unknown>

  const rules: Array<{ segs: Segment[]; rule: FieldRule }> = classifiedPaths(classification).map(
    (k) => ({ segs: parsePath(k), rule: classification[k]! }),
  )
  // Top-level fields no explicit rule starts with fall to implicit / default.
  const addressed = new Set(rules.map((r) => r.segs[0]!.key))
  // The upstream payload stays implicit PII unless the field ITSELF is
  // classified — a rule for `metadata.foo` does not vouch for the rest of it.
  for (const key of Object.keys(out)) {
    const implicit = IMPLICIT_PII_FIELDS.includes(key) && classification[key] === undefined
    if (!implicit && addressed.has(key)) continue
    rules.push({ segs: [{ key, array: false }], rule: fallbackRule(key, classification) })
  }
  rules.sort((a, b) => a.segs.length - b.segs.length)

  for (const { segs, rule } of rules) {
    const action = actionFor(rule, opts)
    if (action === 'keep') continue
    const kind = rule.mask ?? 'redact'
    visit(out, segs, 0, (parent, key) => {
      if (Array.isArray(parent)) return
      if (action === 'remove') {
        delete parent[key as string]
        return
      }
      parent[key as string] = maskValue(parent[key as string], kind, opts.hmacKey)
    })
  }
  return out as T
}
