/**
 * Fixture built from the metric object documented for GET /wb/apis/metric and
 * GET /wb/apis/metric/{metric_id} (https://apidocs.myworkboard.com/openapi.json).
 * The spec ships no example payloads, so values follow the documented types.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawWorkboardMetric,
} from '../../../../../../../src/verticals/projects/adapters/workboard/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

const raw: RawWorkboardMetric = {
  metric_id: '9001',
  metric_goal_id: '1203',
  metric_owner: '55',
  metric_real_owner: '55',
  metric_name: 'Monthly active users',
  metric_target: '1000',
  metric_achieve_target: '400',
  metric_progress: '40',
  metric_create_at: '2024-01-02T08:00:00Z',
  metric_modified_at: '2024-01-05',
  metric_status: '1',
}

describe('workboard transformTask', () => {
  it('maps the documented metric fields and parses as a Task', () => {
    const t = TaskSchema.parse(transformTask(raw))
    expect(t).toMatchObject({
      id: '9001',
      externalId: '9001',
      projectId: '1203',
      title: 'Monthly active users',
      status: 'open',
      assigneeIds: ['55'],
      tagIds: [],
      createdAt: '2024-01-02T08:00:00.000Z',
      updatedAt: '2024-01-05T00:00:00.000Z',
      platform: 'workboard',
      metadata: {
        metric_status: '1',
        metric_target: '1000',
        metric_achieve_target: '400',
        metric_progress: '40',
      },
    })
    expect(t.dueDate).toBeUndefined()
  })

  it('takes the goal it was listed under over metric_goal_id', () => {
    expect(transformTask(raw, '42').projectId).toBe('42')
  })

  it('maps metric_status "2" to closed; "0" (deleted) and "3" (excluded) to unknown', () => {
    expect(transformTask({ ...raw, metric_status: '2' }).status).toBe('closed')
    expect(TaskSchema.parse(transformTask({ ...raw, metric_status: '0' })).status).toBe('unknown')
    expect(transformTask({ ...raw, metric_status: '3' }).status).toBe('unknown')
  })

  it('refuses a metric with no goal to belong to', () => {
    expect(() => transformTask({ ...raw, metric_goal_id: undefined })).toThrow(/metric_goal_id/)
  })

  it('refuses a metric with no metric_name rather than naming it', () => {
    expect(() => transformTask({ ...raw, metric_name: undefined })).toThrow(/9001 has no name/)
  })

  it('refuses a metric with no metric_id', () => {
    expect(() => transformTask({ ...raw, metric_id: undefined })).toThrow(/metric_id/)
  })
})
