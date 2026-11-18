/**
 * Secret validation — enforces strong secrets at startup.
 *
 * Production: fail-fast with a readable error when a secret is missing,
 * too short, denylisted (common placeholder strings), or has low Shannon
 * entropy. Non-production: same checks downgraded to a single
 * `console.warn` so `pnpm dev` and a fresh `docker compose up` keep
 * working with whatever the operator put in `.env`.
 */

/**
 * Denylist of placeholder strings we've seen in docker-compose defaults,
 * tutorials, and ".env.example" files. Anything matching is treated as
 * "unset" — even if it happens to be long enough to clear the length
 * check.
 */
const DENYLIST = new Set<string>([
  'changeme',
  'change-me',
  'changeme123',
  'secret',
  'password',
  'admin',
  'admin123',
  'jwt-secret',
  'session-secret',
  'store-secret',
  'bootstrap-token',
])

/**
 * Substrings that mark a value as a placeholder wherever they appear.
 *
 * `DENYLIST` above is exact-match, so its entries silently stop matching
 * whenever the compose defaults are renamed. Prose placeholders also clear
 * every other check — over 32 chars, not denylisted, and entropy of
 * 3.56-3.78 against a 3.5 floor — so these markers are what catches shipped
 * placeholders; containers set `NODE_ENV=production`, which makes this
 * function a boot-time throw rather than a warning.
 *
 * Matching a marker anywhere in the value (case-insensitively) survives a
 * rename of the defaults. Kept deliberately unambiguous — no bare `example`
 * or `todo`, which could plausibly occur inside a real generated secret.
 */
const PLACEHOLDER_MARKERS = [
  'change-me',
  'changeme',
  'replace-me',
  'replaceme',
  'placeholder',
  'your-secret',
  'yoursecret',
  'insert-secret',
] as const

/**
 * Shannon entropy in bits per character. A random base64 string clears
 * ~5.5 bits/char; a hand-typed phrase usually under 4. The floor is 3.5 (see
 * MIN_ENTROPY_BITS_PER_CHAR) — high enough to reject `aaaaaaaaaaaa…`, low
 * enough to accept hex, whose theoretical maximum is 4.0 bits/char and which
 * measures ~3.9 in practice.
 */
function shannonEntropy(s: string): number {
  if (s.length === 0) return 0
  const counts = new Map<string, number>()
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let h = 0
  for (const c of counts.values()) {
    const p = c / s.length
    h -= p * Math.log2(p)
  }
  return h
}

// Threshold chosen empirically: rejects "aaaaa…" (0 bits) and obvious
// placeholders, accepts both hex (4 bits/char theoretical max, ~3.9
// observed) and base64 (~5.5+ observed). It cannot be raised to 4.0: hex
// tops out AT 4.0 theoretically and measures just under it, so a 4.0 floor
// would reject `openssl rand -hex 32`. Note this threshold alone does not
// stop shipped placeholders — prose placeholders measure 3.56-3.78, above
// the floor — which is what PLACEHOLDER_MARKERS is for.
const MIN_ENTROPY_BITS_PER_CHAR = 3.5

export interface AssertSecretOptions {
  /** Minimum length in characters. Default: 32. */
  minLength?: number
  /** When true, the assertion enforces in production and warns in dev. Default: true. */
  envAware?: boolean
  /** Override `process.env.NODE_ENV` for tests. */
  nodeEnv?: string
}

/**
 * Validate an operator-supplied secret. In production the validation is
 * a hard error. In non-production it's a `console.warn` so the dev
 * workflow keeps working with placeholder secrets.
 *
 * Returns the secret on success. Throws (production) or returns the
 * value as-given (non-production) on failure.
 */
export function assertSecret(
  name: string,
  value: string | undefined,
  optsOrMinLength?: number | AssertSecretOptions,
): string {
  const opts: AssertSecretOptions =
    typeof optsOrMinLength === 'number' ? { minLength: optsOrMinLength } : (optsOrMinLength ?? {})
  const minLength = opts.minLength ?? 32
  const envAware = opts.envAware ?? true
  const nodeEnv = opts.nodeEnv ?? process.env['NODE_ENV']
  const isProduction = envAware && nodeEnv === 'production'

  const reasons: string[] = []
  if (!value) {
    reasons.push('is not set')
  } else {
    if (value.length < minLength) reasons.push(`is ${value.length} chars (minimum ${minLength})`)
    const lowered = value.toLowerCase()
    if (DENYLIST.has(lowered)) {
      reasons.push('matches a known placeholder string')
    } else {
      const marker = PLACEHOLDER_MARKERS.find((m) => lowered.includes(m))
      if (marker) reasons.push(`contains the placeholder marker "${marker}"`)
    }
    if (value.length > 0 && shannonEntropy(value) < MIN_ENTROPY_BITS_PER_CHAR) {
      reasons.push(
        `has low entropy (${shannonEntropy(value).toFixed(2)} bits/char, minimum ${MIN_ENTROPY_BITS_PER_CHAR})`,
      )
    }
  }

  if (reasons.length === 0) return value!

  const detail = reasons.join('; ')
  const msg =
    `${name} ${detail}. ` +
    `Set it to a cryptographically random string of at least ${minLength} characters ` +
    `(e.g. \`openssl rand -base64 48\`).`

  if (isProduction) {
    throw new Error(msg)
  }
  // Dev: warn loudly but keep the workflow moving.
  console.warn(`[secrets] ${msg}`)
  return value ?? ''
}
