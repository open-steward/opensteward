/**
 * Logo source configuration, shared by docs-server and admin so both validate
 * identically.
 *
 * Logos are not shipped with OpenSteward. Brandfetch's Logo API terms prohibit
 * what committing them would be — "programmatic access to logo images is not
 * permitted", and caching requires a written agreement — and they are also
 * 1,474 other companies' trademarks. Operators opt in instead. See
 * docs/operations/platform-logos.md.
 *
 * This lives in `shared` rather than `platforms-ui` because platforms-ui is a
 * browser component package with no node types; reading `process.env` there
 * would be the wrong layer.
 */

/**
 * Where platform logos come from.
 *
 *   'none'  (default) monogram tiles only. No external requests, no account,
 *           works air-gapped. The only mode with no legal surface at all.
 *   'cdn'   hotlink Brandfetch. The mode Brandfetch sanctions ("we require
 *           logo links to be directly embedded"). Needs a client ID. Costs
 *           privacy: every tile tells Brandfetch the viewer's origin and
 *           which platforms they browse.
 *   'local' serve files fetched earlier to disk. Private and air-gap safe,
 *           but it is caching, which Brandfetch's terms say needs an
 *           agreement with them — the operator's own call.
 */
export type LogoSource = 'none' | 'cdn' | 'local'

export interface LogoConfig {
  logoSource: LogoSource
  brandfetchClientId?: string
}

/**
 * Operator-set values that take precedence over the environment, normally the
 * `logos.source` / `logos.brandfetch_client_id` runtime settings.
 *
 * Raw and unvalidated on purpose: an override goes through exactly the same
 * checks as the environment variable it replaces, so a bad value saved through
 * the admin UI degrades to monograms the same way a bad `.env` does.
 *
 * A blank or whitespace-only override falls through to the environment. Both
 * settings seed as empty strings, so treating "" as a value would let an
 * unvisited settings row shadow a deployment's configured `.env`.
 */
export interface LogoConfigOverrides {
  source?: string | null
  brandfetchClientId?: string | null
}

export interface ResolveLogoConfigOpts {
  /**
   * Where the fall-back warnings go. Defaults to `console.warn`, which is what
   * every boot-time caller wants.
   *
   * Callers that resolve per request should pass `request.log.warn` so a
   * misconfigured deployment logs through the redacted pino stream rather than
   * printing one raw line per page view. Pass `false` to silence them: the
   * admin UI resolves the config purely to *render* the degraded state on
   * screen, and warning about a condition the operator is currently looking at
   * would fill the log with noise.
   */
  warn?: ((message: string) => void) | false
}

/**
 * Read logo config from the environment.
 *
 * `process.env.LOGO_SOURCE` and `process.env.BRANDFETCH_CLIENT_ID` are
 * referenced literally rather than through an injected env object, because
 * that is how `scripts/generate-env-example.ts` discovers env vars (it greps
 * for `process.env.X`). An indirection would keep both out of `.env.example`
 * and so invisible to operators.
 *
 * An unrecognised LOGO_SOURCE, or 'cdn' with no client ID, falls back to
 * 'none' with a warning. Failing to monograms is the right failure mode: the
 * catalog stays usable, and a deployment never makes an external request it
 * was not explicitly configured to make.
 */
export function resolveLogoConfig(
  overrides?: LogoConfigOverrides,
  opts?: ResolveLogoConfigOpts,
): LogoConfig {
  const warn = opts?.warn === false ? () => {} : (opts?.warn ?? console.warn)

  // `process.env.LOGO_SOURCE` and `process.env.BRANDFETCH_CLIENT_ID` stay
  // written out literally — see the doc comment above. Only the source of the
  // two raw strings changes here; every check below is untouched, so an
  // admin-saved value and an env value fail in exactly the same way.
  const raw = (overrides?.source?.trim() || process.env.LOGO_SOURCE || 'none').trim().toLowerCase()
  const brandfetchClientId =
    overrides?.brandfetchClientId?.trim() || process.env.BRANDFETCH_CLIENT_ID?.trim() || undefined

  if (raw !== 'none' && raw !== 'cdn' && raw !== 'local') {
    warn(
      `[logos] LOGO_SOURCE="${raw}" is not one of none|cdn|local — falling back to "none". ` +
        'See docs/operations/platform-logos.md.',
    )
    return { logoSource: 'none' }
  }

  if (raw === 'cdn' && !brandfetchClientId) {
    warn(
      '[logos] LOGO_SOURCE=cdn needs BRANDFETCH_CLIENT_ID — falling back to "none". ' +
        'Get a free client ID at https://brandfetch.com/developers.',
    )
    return { logoSource: 'none' }
  }

  return { logoSource: raw, brandfetchClientId }
}
