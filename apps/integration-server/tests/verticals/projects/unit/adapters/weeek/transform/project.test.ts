import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawWeeekProject,
} from '../../../../../../../src/verticals/projects/adapters/weeek/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('weeek transformProject', () => {
  const raw: RawWeeekProject = {
    id: 101,
    title: 'Acme Onboarding',
    description: 'Onboard Acme Industries.',
    color: '#4f46e5',
    logoLink: 'https://cdn.example.com/logo.png',
    isPrivate: false,
    team: [7, 8, 9],
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps workspaceId from the caller-supplied argument', () => {
    const result = transformProject(raw, 'ws_acme')
    expect(result.workspaceId).toBe('ws_acme')
  })

  it('workspaceId defaults to empty string when not supplied', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('maps name from title', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Acme Onboarding')
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Onboard Acme Industries.')
  })

  it('status is always active (Weeek v1 does not expose archive flag)', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('ownerId is the first member of the team array', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('7')
  })

  it('ownerId is undefined when team array is absent', () => {
    const result = transformProject({ id: 1 })
    expect(result.ownerId).toBeUndefined()
  })

  it('ownerId is undefined when team array is empty', () => {
    const result = transformProject({ ...raw, team: [] })
    expect(result.ownerId).toBeUndefined()
  })

  it('platform is weeek', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('weeek')
  })

  it('metadata.color reflects raw.color', () => {
    const result = transformProject(raw)
    expect(result.metadata.color).toBe('#4f46e5')
  })

  it('metadata.isPrivate reflects raw.isPrivate', () => {
    const result = transformProject(raw)
    expect(result.metadata.isPrivate).toBe('false')
  })

  it('metadata.logoLink reflects raw.logoLink', () => {
    const result = transformProject(raw)
    expect(result.metadata.logoLink).toBe('https://cdn.example.com/logo.png')
  })

  it('name defaults to empty string when title is absent', () => {
    const result = transformProject({ id: 2 })
    expect(result.name).toBe('')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw, 'ws_acme')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
