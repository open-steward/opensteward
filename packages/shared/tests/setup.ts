/**
 * Global test setup for the shared package.
 *
 * The admin-secret guard (`adminGuard`) fails CLOSED when `ADMIN_SECRET` is
 * unset — this opt-in is the only thing that opens it without one. Many router
 * unit tests here exercise `/admin/*` handlers in isolation without wiring a
 * secret, which is a legitimate trusted-local context. Declare that context
 * explicitly with the same opt-in an operator would use for local dev, so the
 * suite tests router logic rather than re-testing the guard on every file.
 *
 * The guard's fail-closed path is covered directly in
 * `tests/control-plane/admin-guard.test.ts`, which removes this flag.
 */
process.env['OST_ALLOW_UNAUTH_ADMIN'] = '1'

import { registerHooks } from 'node:module'

/**
 * Licensing: shared tests see a SOURCE build's key ring.
 *
 * keyring.ts loads the dev public keys through a guarded `require('./keys.dev')`,
 * which finds keys.dev.js next to keyring.js in dist/. Run from src under vitest,
 * that require is Node's own, and Node does not resolve an extensionless `.ts`
 * (MODULE_NOT_FOUND, checked on Node 24.20 + vitest 5.0.2): without this every
 * shared test would see a production ring. Scoped to that one specifier under a
 * licensing/ directory; production code has no seam for it.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (err) {
      if (specifier === './keys.dev' && context.parentURL?.includes('/licensing/')) {
        return nextResolve('./keys.dev.ts', context)
      }
      throw err
    }
  },
})
