/**
 * Shared parser for the platform-credentials form body.
 *
 * `views/platforms/_credentials-form.ejs` is rendered by two routes — the
 * standalone platform page (`POST /platforms/:vertical/:slug`) and step 4 of
 * the setup wizard (`POST /setup/wizard/configure`). Both therefore receive the
 * same body shape, and both must parse it the same way.
 *
 * They did not. The parsing was duplicated, the wizard's copy assumed `scopes`
 * was a comma-separated string, and ticking more than one box crashed it with
 * `TypeError: scopes.split is not a function`. This module exists so the two
 * cannot diverge again.
 *
 * The shape is dictated by HTML forms, not by us:
 *   - each ticked checkbox posts its own `scopes=` field, so Fastify's
 *     urlencoded parser yields `string[]` for 2+, a bare `string` for exactly
 *     one, and `undefined` for none;
 *   - `scopesCustom` is a single free-text field, comma- or whitespace-separated.
 */

export interface PlatformConfigBody {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  /** `string[]` for 2+ ticked boxes, `string` for exactly one, absent for none. */
  scopes?: string | string[]
  /** Free-text fallback for scopes the catalogue does not list. */
  scopesCustom?: string
  /**
   * Present whenever the form rendered the sandbox control. An unticked
   * checkbox posts NOTHING, and the backend merges config — so `sandbox`
   * being absent is ambiguous on its own: it means either "unticked" or "this
   * form has no such field". Without this companion the flag could be set and
   * never cleared.
   */
  sandboxPresent?: string
  /** `'true'` when ticked; absent when not. */
  sandbox?: string
}

/**
 * Builds the config patch sent to `setPlatformConfig`.
 *
 * Every field is omitted rather than emptied when absent: the backend merges,
 * so an omitted key preserves the stored value. That distinction is load-bearing
 * for `clientSecret` in particular — the form re-renders with the secret field
 * blank, and sending `''` would wipe a working credential.
 */
export function buildPlatformConfig(body: PlatformConfigBody): Record<string, unknown> {
  const config: Record<string, unknown> = {}

  if (typeof body.clientId === 'string') config.clientId = body.clientId.trim()
  if (typeof body.redirectUri === 'string') config.redirectUri = body.redirectUri.trim()

  // Only send a secret the operator actually typed. Blank means "unchanged".
  if (typeof body.clientSecret === 'string' && body.clientSecret.length > 0) {
    config.clientSecret = body.clientSecret
  }

  // Either input being present means the operator interacted with the picker,
  // so an empty result is a deliberate "no scopes" rather than "don't change".
  const touchedCheckboxes = body.scopes !== undefined
  const touchedFreeText = typeof body.scopesCustom === 'string'
  if (touchedCheckboxes || touchedFreeText) {
    const checked = Array.isArray(body.scopes)
      ? body.scopes
      : typeof body.scopes === 'string'
        ? [body.scopes]
        : []
    const free = typeof body.scopesCustom === 'string' ? body.scopesCustom.split(/[\s,]+/) : []
    const merged = [...checked, ...free].map((s) => String(s).trim()).filter(Boolean)
    config.scopes = [...new Set(merged)]
  }

  // Only written when the form actually carried the control, so platforms
  // without a sandbox never acquire the key.
  if (body.sandboxPresent !== undefined) {
    config.sandbox = body.sandbox === 'true'
  }

  return config
}
