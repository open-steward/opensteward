import { existsSync } from 'fs'
import { resolve, dirname } from 'path'

/**
 * Walk up the directory tree from `startDir` to find the monorepo root
 * (directory containing pnpm-workspace.yaml).
 */
export function resolveMonorepoRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir)
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
      return dir
    }
    dir = dirname(dir)
  }
  throw new Error('Could not find monorepo root (no pnpm-workspace.yaml found)')
}

/**
 * Resolve the docs output directory for a vertical.
 * Convention: `<monorepo-root>/docs/<vertical>/`
 */
export function resolveDocsDir(vertical: string, startDir?: string): string {
  const root = resolveMonorepoRoot(startDir)
  return resolve(root, 'docs', vertical)
}
