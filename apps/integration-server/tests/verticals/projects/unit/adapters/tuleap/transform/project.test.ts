import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawTuleapProject,
} from '../../../../../../../src/verticals/projects/adapters/tuleap/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('tuleap transformProject', () => {
  const raw: RawTuleapProject = {
    id: 110,
    uri: 'projects/110',
    label: 'Forge Project Alpha',
    shortname: 'proj-alpha',
    description: 'Main development project.',
    is_public: true,
    status: 'A',
    access: 'public',
  }

  it('maps id and externalId from raw.id as string', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('110')
    expect(result.externalId).toBe('110')
  })

  it('maps name from label', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Forge Project Alpha')
  })

  it('falls back to shortname when label is absent', () => {
    const result = transformProject({ ...raw, label: undefined })
    expect(result.name).toBe('proj-alpha')
  })

  it('maps description correctly', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Main development project.')
  })

  it('status is active for status "A"', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived for status "D" (deleted)', () => {
    const result = transformProject({ ...raw, status: 'D' })
    expect(result.status).toBe('archived')
  })

  it('status is on_hold for status "H" (hidden)', () => {
    const result = transformProject({ ...raw, status: 'H' })
    expect(result.status).toBe('on_hold')
  })

  it('status is active for unknown status codes', () => {
    const result = transformProject({ ...raw, status: 'X' })
    expect(result.status).toBe('active')
  })

  it('workspaceId is always empty string', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('no timestamps (Tuleap project API does not return them)', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('platform is tuleap', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('tuleap')
  })

  it('metadata stores shortname', () => {
    const result = transformProject(raw)
    expect(result.metadata['shortname']).toBe('proj-alpha')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
