import type { KeyMap } from '@opensteward/license-token'
import { PRODUCTION_KEYS } from './keys.production'

/**
 * The license key ring.
 *
 * Development keys exist only where the keys.dev module exists: a source build,
 * or an image built with OPENSTEWARD_BUILD_PROFILE=development. The production
 * build profile deletes the compiled module, so in a production image this ring
 * is exactly the five production kids. Nothing at runtime can add a key: this
 * module reads no environment variable and takes no key from a caller, and
 * `includeDevKeys: false` can only remove.
 */

/** Development kids are named dev…; production kids never are. */
export const isDevKid = (kid: string): boolean => kid.startsWith('dev')

function loadDevKeys(): KeyMap {
  try {
    // A guarded require, never an import: the module's absence is the normal
    // state of a production image, not a crash at load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./keys.dev') as { DEV_KEYS?: KeyMap }
    return Object.fromEntries(Object.entries(mod.DEV_KEYS ?? {}).filter(([kid]) => isDevKid(kid)))
  } catch {
    return {}
  }
}

/** True when this build trusts development license keys (logged loudly at startup). */
export function devKeysPresent(): boolean {
  return Object.keys(loadDevKeys()).length > 0
}

/**
 * kid → public key for verifyLicense: PRODUCTION_KEYS verbatim (a placeholder
 * stays in and fails at verify time as BAD_KEY, never a throw), plus this
 * build's development kids. Not exported from the licensing barrel: callers go
 * through LicenseManager or inspectLicense.
 */
export function getKeyring(opts: { includeDevKeys?: boolean } = {}): KeyMap {
  return Object.freeze({
    ...PRODUCTION_KEYS,
    ...(opts.includeDevKeys === false ? {} : loadDevKeys()),
  })
}
