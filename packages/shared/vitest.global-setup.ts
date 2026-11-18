/**
 * Refuses to start the suite on a stale workspace build.
 *
 * The licensing tests verify real tokens through @opensteward/license-token,
 * which resolves to its dist/, and nothing rebuilds dist/ before `vitest run`.
 * A change to packages/license-token/src without a rebuild would otherwise be
 * tested as the old verifier, and pass. See scripts/build-stamp.mts; the same
 * guard runs in apps/integration-server.
 */
import { fileURLToPath } from 'node:url'
import { staleWorkspaceBuilds } from '../../scripts/build-stamp.mts'

export default function assertWorkspaceBuildsCurrent(): void {
  const stale = staleWorkspaceBuilds(fileURLToPath(new URL('.', import.meta.url)))
  if (stale.length === 0) return
  throw new Error(
    [
      'These tests import the workspace libraries from dist/, and these builds are stale:',
      ...stale.map((line) => `  - ${line}`),
      'Run `pnpm run build` at the repository root, then rerun the tests.',
    ].join('\n'),
  )
}
