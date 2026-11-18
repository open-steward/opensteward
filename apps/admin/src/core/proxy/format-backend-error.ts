/**
 * Shared with three callers (connect links, the setup wizard, connections),
 * which is why it lives here rather than inside one route file: every page
 * that POSTs to admin-api needs the same translation from an axios error into
 * a sentence an operator can read.
 */
/**
 * Best-effort extraction of a human-readable message from an axios error
 * chain. Handles three shapes that bubble up from admin-api / integration-
 * server:
 *
 *   1. Plain string: `error: 'something went wrong'`
 *   2. Error object with `.message`: `error: { message: '...', code: '...' }`
 *   3. Zod VALIDATION envelope: `error: { code: 'VALIDATION', issues: [
 *        { path: ['createdBy'], code: 'unrecognized_keys', message: '...' }
 *      ]}` — flattened into `field: message` lines so the admin sees what
 *      the upstream actually objected to.
 */
export function formatBackendError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: unknown } }).response?.data
  if (!data || typeof data !== 'object') {
    const msg = (err as { message?: string }).message
    return typeof msg === 'string' && msg.length > 0 ? msg : fallback
  }
  const errBody = (data as { error?: unknown }).error
  if (!errBody) return fallback
  if (typeof errBody === 'string') return errBody
  if (typeof errBody === 'object') {
    const code = (errBody as { code?: string }).code
    const issues = (errBody as { issues?: Array<Record<string, unknown>> }).issues
    if (code === 'VALIDATION' && Array.isArray(issues) && issues.length > 0) {
      const lines = issues.map((i) => {
        const path = Array.isArray(i.path) && i.path.length > 0 ? i.path.join('.') : '(body)'
        const message = typeof i.message === 'string' ? i.message : 'invalid'
        return `${path}: ${message}`
      })
      return `Validation failed — ${lines.join('; ')}`
    }
    const message = (errBody as { message?: string }).message
    if (typeof message === 'string') return message
  }
  return fallback
}

/**
 * The `error.code` the upstream answered with, when it sent one — so a caller
 * can act on the shape (`DUPLICATE_LABEL` names a field to flag) without
 * pattern-matching the sentence `formatBackendError` built for the operator.
 */
export function backendErrorCode(err: unknown): string | null {
  const data = (err as { response?: { data?: unknown } }).response?.data
  const errBody = data && typeof data === 'object' ? (data as { error?: unknown }).error : null
  const code = errBody && typeof errBody === 'object' ? (errBody as { code?: unknown }).code : null
  return typeof code === 'string' ? code : null
}
