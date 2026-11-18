/**
 * Pins the fall-back semantics of `resolveLogoConfig`.
 *
 * These rules hold regardless of the admin-managed logo settings:
 * an unrecognised mode falls back to `none` with a warning, `cdn` without a
 * client ID falls back to `none` with a warning, and a deployment never makes
 * an external request it was not explicitly configured to make.
 *
 * The two warning strings are asserted character-for-character because
 * `docs/operations/platform-logos.md` (Troubleshooting) tells operators to
 * grep their logs for them verbatim. Changing the wording here silently
 * invalidates that page.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resolveLogoConfig } from '../../src/config/logo-source'

const CDN_WARNING =
  '[logos] LOGO_SOURCE=cdn needs BRANDFETCH_CLIENT_ID — falling back to "none". ' +
  'Get a free client ID at https://brandfetch.com/developers.'

function unknownWarning(raw: string): string {
  return (
    `[logos] LOGO_SOURCE="${raw}" is not one of none|cdn|local — falling back to "none". ` +
    'See docs/operations/platform-logos.md.'
  )
}

describe('resolveLogoConfig', () => {
  const saved = { ...process.env }
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    delete process.env.LOGO_SOURCE
    delete process.env.BRANDFETCH_CLIENT_ID
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
    process.env = { ...saved }
  })

  describe('environment only (no overrides)', () => {
    it('defaults to none and warns about nothing', () => {
      expect(resolveLogoConfig()).toEqual({ logoSource: 'none' })
      expect(warn).not.toHaveBeenCalled()
    })

    it('accepts each valid mode', () => {
      process.env.LOGO_SOURCE = 'local'
      expect(resolveLogoConfig()).toEqual({ logoSource: 'local', brandfetchClientId: undefined })

      process.env.LOGO_SOURCE = 'cdn'
      process.env.BRANDFETCH_CLIENT_ID = 'abc123'
      expect(resolveLogoConfig()).toEqual({ logoSource: 'cdn', brandfetchClientId: 'abc123' })
      expect(warn).not.toHaveBeenCalled()
    })

    it('is case-insensitive and trims', () => {
      process.env.LOGO_SOURCE = '  LOCAL  '
      expect(resolveLogoConfig().logoSource).toBe('local')
    })

    it('falls back to none with the documented warning on an unknown mode', () => {
      process.env.LOGO_SOURCE = 'cnd'
      expect(resolveLogoConfig()).toEqual({ logoSource: 'none' })
      expect(warn).toHaveBeenCalledWith(unknownWarning('cnd'))
    })

    it('falls back to none with the documented warning when cdn has no client ID', () => {
      process.env.LOGO_SOURCE = 'cdn'
      expect(resolveLogoConfig()).toEqual({ logoSource: 'none' })
      expect(warn).toHaveBeenCalledWith(CDN_WARNING)
    })

    it('treats a blank client ID as absent', () => {
      process.env.LOGO_SOURCE = 'cdn'
      process.env.BRANDFETCH_CLIENT_ID = '   '
      expect(resolveLogoConfig()).toEqual({ logoSource: 'none' })
      expect(warn).toHaveBeenCalledWith(CDN_WARNING)
    })
  })

  describe('overrides (admin-managed settings)', () => {
    it('lets a DB value win over the environment', () => {
      process.env.LOGO_SOURCE = 'none'
      expect(resolveLogoConfig({ source: 'local' }).logoSource).toBe('local')
    })

    it('lets a DB client ID win over the environment', () => {
      process.env.BRANDFETCH_CLIENT_ID = 'from-env'
      const cfg = resolveLogoConfig({ source: 'cdn', brandfetchClientId: 'from-db' })
      expect(cfg).toEqual({ logoSource: 'cdn', brandfetchClientId: 'from-db' })
    })

    it('falls through to the environment when an override is empty', () => {
      // The seeded default for both settings is an empty string, so a blank
      // override must not shadow a configured environment variable.
      process.env.LOGO_SOURCE = 'cdn'
      process.env.BRANDFETCH_CLIENT_ID = 'from-env'
      const cfg = resolveLogoConfig({ source: '', brandfetchClientId: '   ' })
      expect(cfg).toEqual({ logoSource: 'cdn', brandfetchClientId: 'from-env' })
    })

    it('falls through to the environment when an override is null', () => {
      process.env.LOGO_SOURCE = 'local'
      expect(resolveLogoConfig({ source: null, brandfetchClientId: null }).logoSource).toBe('local')
    })

    it('applies the same fall-backs to override values', () => {
      expect(resolveLogoConfig({ source: 'cnd' })).toEqual({ logoSource: 'none' })
      expect(warn).toHaveBeenCalledWith(unknownWarning('cnd'))

      warn.mockClear()
      expect(resolveLogoConfig({ source: 'cdn' })).toEqual({ logoSource: 'none' })
      expect(warn).toHaveBeenCalledWith(CDN_WARNING)
    })
  })

  describe('warning sink', () => {
    it('routes warnings to a supplied sink instead of console', () => {
      const lines: string[] = []
      const cfg = resolveLogoConfig({ source: 'cdn' }, { warn: (m) => lines.push(m) })
      expect(cfg).toEqual({ logoSource: 'none' })
      expect(lines).toEqual([CDN_WARNING])
      expect(warn).not.toHaveBeenCalled()
    })

    it('silences warnings entirely when passed false, without changing the result', () => {
      const cfg = resolveLogoConfig({ source: 'cdn' }, { warn: false })
      expect(cfg).toEqual({ logoSource: 'none' })
      expect(warn).not.toHaveBeenCalled()
    })
  })
})
