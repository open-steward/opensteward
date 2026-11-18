import { KNOWN_VERTICALS, VERTICAL_LABELS } from '../verticals'

/**
 * Single source of truth for the "safe default" scope set used by the
 * standalone `/api-keys/new` mint flow and the wizard step 7 mint flow.
 *
 * The default deliberately omits `vertical:write` so that a developer who
 * accepts the recommended preset gets a key that:
 *   - Reads any vertical's data (covered by per-vertical scopes + vertical:read)
 *   - Manages customers / connect-links / connections / webhook subscriptions
 *   - **Cannot mutate vertical data** until the operator explicitly adds
 *     `vertical:write` (a regulatory-compliance friendly default)
 *
 * The two other scope modes still exist:
 *   - `'all'` → `*` wildcard. Operator must opt in.
 *   - `'custom'` → operator picks every scope manually.
 */
export const SAFE_DEFAULT_SCOPES: readonly string[] = [
  'customers:read',
  'customers:write',
  'customers:read_pii',
  'connect-links:write',
  'connections:read',
  'connections:write',
  'webhooks:read',
  'webhooks:write',
  // Derived, not transcribed: a vertical added to KNOWN_VERTICALS is covered
  // by the preset automatically — a hand-copied list would drift.
  ...KNOWN_VERTICALS.map((v) => `vertical:${v}`),
  'vertical:read',
  // 'vertical:write' deliberately omitted — operator must explicitly opt in
]

/**
 * The vertical touch-scope checkboxes the mint screens render, in list order.
 * Derived here so a new vertical appears in the picker and in the preset
 * together — hand-maintained copies would drift apart.
 */
export const VERTICAL_SCOPE_ITEMS: ReadonlyArray<{ name: string; label: string }> =
  KNOWN_VERTICALS.map((name) => ({ name, label: VERTICAL_LABELS[name] }))
