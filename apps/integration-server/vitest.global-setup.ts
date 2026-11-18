/**
 * Refuses to start the suite on a stale workspace build.
 *
 * These tests import @opensteward/shared, and the other workspace libraries,
 * from their dist/, and nothing rebuilds dist/ before `vitest run`. A checkout
 * whose sources moved without a rebuild therefore tests today's adapters
 * against an older library. See scripts/build-stamp.mts.
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
