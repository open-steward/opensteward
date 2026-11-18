/**
 * NON-PRODUCTION license public keys. They exist only in a source build and in
 * an image built with OPENSTEWARD_BUILD_PROFILE=development. The production
 * build profile deletes dist/licensing/keys.dev.* right after the shared build
 * and fails the image if any trace survives (scripts/check-license-keys.ts
 * --artifact).
 *
 * Loaded ONLY by keyring.ts's guarded require. Never import or re-export this
 * module anywhere else: a static import would crash every production image at
 * load with MODULE_NOT_FOUND, and check:license-keys fails on one. No imports:
 * the check loads this file from source.
 *
 *   dev1   the committed test keypair (packages/license-token/fixtures/dev1.json).
 *          Its private key is public, so it may only sign env "dev" licenses
 *          (evaluate.ts: DEV_KEY_ENV_MISMATCH otherwise).
 *   devk1  the license service's dev-account KMS key (AWS KMS, eu-north-1).
 *
 * The license service reads this file as text (its keys:check), so keep this
 * shape: one `Object.freeze({` block of `kid: '<value>',` lines, then `})`.
 * check:license-keys enforces it (checkKeyFileShape).
 */
export const DEV_KEYS: Readonly<Record<'dev1' | 'devk1', string>> = Object.freeze({
  dev1: 'mc8QZuCpxdL_ICG3oKy-KY1NR_7DdETx-Pys5q3DVfQ',
  devk1: 'n_aHQIRne-QAkjzfFQ99us6PD5gGpYPX5waaXN7iH0I',
})
