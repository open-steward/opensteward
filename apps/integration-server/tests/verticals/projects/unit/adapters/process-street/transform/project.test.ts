import { describe, it, expect } from 'vitest'
import { transformProject } from '../../../../../../../src/verticals/projects/adapters/process-street/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'
import { WORKFLOW_ID, workflow } from '../fixtures'

describe('process-street transformProject (documented PublicApiWorkflow)', () => {
  it('parses against ProjectSchema', () => {
    expect(() => ProjectSchema.parse(transformProject(workflow(), 'active'))).not.toThrow()
  })

  it('maps id, name and description', () => {
    const p = ProjectSchema.parse(transformProject(workflow(), 'active'))
    expect(p.id).toBe(WORKFLOW_ID)
    expect(p.externalId).toBe(WORKFLOW_ID)
    expect(p.name).toBe('Employee Onboarding')
    expect(p.description).toBe('Steps to onboard a new employee')
  })

  it('reads createdAt / updatedAt from audit, not the top level', () => {
    const p = ProjectSchema.parse(transformProject(workflow(), 'active'))
    expect(p.createdAt).toBe('2024-09-15T14:32:00.000Z')
    expect(p.updatedAt).toBe('2024-09-16T09:00:00.000Z')
  })

  it('takes status from the caller (list: active, get: unknown)', () => {
    expect(transformProject(workflow(), 'active').status).toBe('active')
    expect(ProjectSchema.parse(transformProject(workflow(), 'unknown')).status).toBe('unknown')
  })

  it('omits description when absent (it is optional)', () => {
    const p = ProjectSchema.parse(transformProject(workflow({ description: undefined }), 'active'))
    expect(p.description).toBeUndefined()
  })

  it('keeps audit user ids in metadata and invents no owner', () => {
    const p = ProjectSchema.parse(transformProject(workflow(), 'active'))
    expect(p.metadata).toEqual({
      createdById: 'vGIRpoq0RIwBoNMM3-V-tw',
      updatedById: 'vGIRpoq0RIwBoNMM3-V-tw',
    })
    expect(p.ownerId).toBeUndefined()
    expect(p.platform).toBe('process-street')
  })
})
