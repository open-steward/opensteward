import type { Pipeline } from '../../../schema/pipeline'

/**
 * YetiForce has no pipeline object. A sales process moves through the values
 * of the SSalesProcesses status picklist, field `ssalesprocesses_status`
 * (install/install_schema/data.sql in github.com/YetiForceCompany/YetiForceCRM,
 * tabid 86, uitype 15). GET /{moduleName}/Fields returns it as a Field_Info
 * whose `picklistvalues` is documented as "Picklist values, available only
 * for type of field: picklist, ..." (WebservicePremium.json). The server fills
 * it as `[raw value => translated label]` in list order
 * (modules/Vtiger/models/Field.php, getPicklistValues).
 *
 * So the one pipeline is that field: its id is the field name, its name the
 * field's translated `label`, and its stages the picklist values in order.
 * Deals carry the raw value as `stage_id` and this id as `pipeline_id`.
 */
export const PIPELINE_FIELD = 'ssalesprocesses_status'

/** The Field_Info of `ssalesprocesses_status`, as GET SSalesProcesses/Fields returns it. */
export type RawYetiForcePipeline = Record<string, unknown>

export function transformPipeline(raw: RawYetiForcePipeline): Pipeline {
  const label = raw['label']
  if (typeof label !== 'string' || label === '') {
    throw Object.assign(new Error(`YetiForce field ${PIPELINE_FIELD} has no label`), {
      statusCode: 502,
    })
  }
  const values = raw['picklistvalues']
  const stages =
    values !== null && typeof values === 'object' && !Array.isArray(values)
      ? Object.entries(values as Record<string, unknown>)
          .filter((e): e is [string, string] => typeof e[1] === 'string')
          .map(([value, name], order) => ({ id: value, name, order }))
      : undefined
  return { id: PIPELINE_FIELD, name: label, stages, metadata: raw }
}
