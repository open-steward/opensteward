/**
 * Adapter factories — lazy constructors keyed by platform slug.
 */
import type { AdapterFactory } from '@opensteward/shared'
import type { ProjectsAdapter } from './interface'

import { AsanaAdapter } from '../adapters/asana'
import { JiraAdapter } from '../adapters/jira'
import { LinearAdapter } from '../adapters/linear'

import { MondayAdapter } from '../adapters/monday'
import { ClickUpAdapter } from '../adapters/clickup'
import { TrelloAdapter } from '../adapters/trello'
import { BasecampAdapter } from '../adapters/basecamp'
import { SmartsheetAdapter } from '../adapters/smartsheet'
import { MicrosoftPlannerAdapter } from '../adapters/microsoft-planner'
import { WrikeAdapter } from '../adapters/wrike'

import { TeamworkAdapter } from '../adapters/teamwork'
import { AirtableAdapter } from '../adapters/airtable'
import { TodoistAdapter } from '../adapters/todoist'
import { ShortcutAdapter } from '../adapters/shortcut'
import { HiveAdapter } from '../adapters/hive'
import { HeightAdapter } from '../adapters/height'
import { ZohoProjectsAdapter } from '../adapters/zoho-projects'

import { BacklogAdapter } from '../adapters/backlog'
import { TeambitionAdapter } from '../adapters/teambition'
import { WorktileAdapter } from '../adapters/worktile'
import { StackfieldAdapter } from '../adapters/stackfield'
import { YouTrackAdapter } from '../adapters/youtrack'

import { QuireAdapter } from '../adapters/quire'
import { ProofHubAdapter } from '../adapters/proofhub'
import { FreedcampAdapter } from '../adapters/freedcamp'
import { AvazaAdapter } from '../adapters/avaza'
import { TeamGanttAdapter } from '../adapters/teamgantt'
import { KanbanizeAdapter } from '../adapters/kanbanize'
import { ForecastAdapter } from '../adapters/forecast'
import { TargetprocessAdapter } from '../adapters/targetprocess'
import { KintoneAdapter } from '../adapters/kintone'
import { RunrunItAdapter } from '../adapters/runrun-it'

import { ProductiveAdapter } from '../adapters/productive'
import { MeisterTaskAdapter } from '../adapters/meistertask'
import { LarkAdapter } from '../adapters/lark'
import { Bitrix24Adapter } from '../adapters/bitrix24'
import { PivotalTrackerAdapter } from '../adapters/pivotal-tracker'
import { TowerAdapter } from '../adapters/tower'
import { ActivecollabAdapter } from '../adapters/activecollab'
import { AhaAdapter } from '../adapters/aha'
import { ArtiaAdapter } from '../adapters/artia'
import { AworkAdapter } from '../adapters/awork'
import { BaserowAdapter } from '../adapters/baserow'
import { BigtimeAdapter } from '../adapters/bigtime'
import { BirdviewAdapter } from '../adapters/birdview'
import { BuildertrendAdapter } from '../adapters/buildertrend'
import { BusinessmapAdapter } from '../adapters/businessmap'
import { CodaAdapter } from '../adapters/coda'
import { FactroAdapter } from '../adapters/factro'
import { FavroAdapter } from '../adapters/favro'
import { FiberyAdapter } from '../adapters/fibery'
import { FieldwireAdapter } from '../adapters/fieldwire'
import { FloatAdapter } from '../adapters/float'
import { GanttproAdapter } from '../adapters/ganttpro'
import { GooddayAdapter } from '../adapters/goodday'
import { HulyAdapter } from '../adapters/huly'
import { HyggerAdapter } from '../adapters/hygger'
import { InlooxAdapter } from '../adapters/inloox'
import { KaitenAdapter } from '../adapters/kaiten'
import { KanboardAdapter } from '../adapters/kanboard'
import { KantataAdapter } from '../adapters/kantata'
import { LeantimeAdapter } from '../adapters/leantime'
import { MantisbtAdapter } from '../adapters/mantisbt'
import { MeisterplanAdapter } from '../adapters/meisterplan'
import { MicrosoftTodoAdapter } from '../adapters/microsoft-todo'
import { NextcloudDeckAdapter } from '../adapters/nextcloud-deck'
import { NiftyAdapter } from '../adapters/nifty'
import { NocodbAdapter } from '../adapters/nocodb'
import { NotionAdapter } from '../adapters/notion'
import { NuclinoAdapter } from '../adapters/nuclino'
import { NutcacheAdapter } from '../adapters/nutcache'
import { OdooProjectAdapter } from '../adapters/odoo-project'
import { OnesAdapter } from '../adapters/ones'
import { OpenprojectAdapter } from '../adapters/openproject'
import { OraAdapter } from '../adapters/ora'
import { PaymoAdapter } from '../adapters/paymo'
import { PerdooAdapter } from '../adapters/perdoo'
import { PingcodeAdapter } from '../adapters/pingcode'
import { PlaneAdapter } from '../adapters/plane'
import { PlanfixAdapter } from '../adapters/planfix'
import { PlanviewAdaptiveworkAdapter } from '../adapters/planview-adaptivework'
import { ProcessStreetAdapter } from '../adapters/process-street'
import { ProcoreAdapter } from '../adapters/procore'
import { ProductboardAdapter } from '../adapters/productboard'
import { ProductplanAdapter } from '../adapters/productplan'
import { ProjectmanagerAdapter } from '../adapters/projectmanager'
import { ProjectplaceAdapter } from '../adapters/projectplace'
import { QuickbaseAdapter } from '../adapters/quickbase'
import { RedmineAdapter } from '../adapters/redmine'
import { RocketlaneAdapter } from '../adapters/rocketlane'
import { RuddrAdapter } from '../adapters/ruddr'
import { ScoroAdapter } from '../adapters/scoro'
import { SeatableAdapter } from '../adapters/seatable'
import { SmartsuiteAdapter } from '../adapters/smartsuite'
import { SmarttaskAdapter } from '../adapters/smarttask'
import { StackbyAdapter } from '../adapters/stackby'
import { SuiteprojectsProAdapter } from '../adapters/suiteprojects-pro'
import { TaigaAdapter } from '../adapters/taiga'
import { TapdAdapter } from '../adapters/tapd'
import { TeamhoodAdapter } from '../adapters/teamhood'
import { TeamworkDeskAdapter } from '../adapters/teamwork-desk'
import { TogglPlanAdapter } from '../adapters/toggl-plan'
import { TuleapAdapter } from '../adapters/tuleap'
import { TwprojectAdapter } from '../adapters/twproject'
import { VikunjaAdapter } from '../adapters/vikunja'
import { WeeekAdapter } from '../adapters/weeek'
import { WeekdoneAdapter } from '../adapters/weekdone'
import { WekanAdapter } from '../adapters/wekan'
import { WimiAdapter } from '../adapters/wimi'
import { WorkboardAdapter } from '../adapters/workboard'
import { WorkfrontAdapter } from '../adapters/workfront'
import { YandexTrackerAdapter } from '../adapters/yandex-tracker'
import { ZenhubAdapter } from '../adapters/zenhub'
import { ZenkitAdapter } from '../adapters/zenkit'
import { ZohoBugtrackerAdapter } from '../adapters/zoho-bugtracker'
import { ZohoSprintsAdapter } from '../adapters/zoho-sprints'

function factory<T extends ProjectsAdapter>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Ctor: new (...args: any[]) => T,
): AdapterFactory<T> {
  return (cfg) => new Ctor(cfg)
}

export const ADAPTER_FACTORIES: Record<string, AdapterFactory<ProjectsAdapter>> = {
  asana: factory(AsanaAdapter),
  jira: factory(JiraAdapter),
  linear: factory(LinearAdapter),
  monday: factory(MondayAdapter),
  clickup: factory(ClickUpAdapter),
  trello: factory(TrelloAdapter),
  basecamp: factory(BasecampAdapter),
  smartsheet: factory(SmartsheetAdapter),
  'microsoft-planner': factory(MicrosoftPlannerAdapter),
  wrike: factory(WrikeAdapter),
  teamwork: factory(TeamworkAdapter),
  airtable: factory(AirtableAdapter),
  todoist: factory(TodoistAdapter),
  shortcut: factory(ShortcutAdapter),
  hive: factory(HiveAdapter),
  height: factory(HeightAdapter),
  'zoho-projects': factory(ZohoProjectsAdapter),
  backlog: factory(BacklogAdapter),
  teambition: factory(TeambitionAdapter),
  worktile: factory(WorktileAdapter),
  stackfield: factory(StackfieldAdapter),
  youtrack: factory(YouTrackAdapter),
  quire: factory(QuireAdapter),
  proofhub: factory(ProofHubAdapter),
  freedcamp: factory(FreedcampAdapter),
  avaza: factory(AvazaAdapter),
  teamgantt: factory(TeamGanttAdapter),
  kanbanize: factory(KanbanizeAdapter),
  forecast: factory(ForecastAdapter),
  targetprocess: factory(TargetprocessAdapter),
  kintone: factory(KintoneAdapter),
  'runrun-it': factory(RunrunItAdapter),
  productive: factory(ProductiveAdapter),
  meistertask: factory(MeisterTaskAdapter),
  lark: factory(LarkAdapter),
  bitrix24: factory(Bitrix24Adapter),
  'pivotal-tracker': factory(PivotalTrackerAdapter),
  tower: factory(TowerAdapter),
  activecollab: factory(ActivecollabAdapter),
  aha: factory(AhaAdapter),
  artia: factory(ArtiaAdapter),
  awork: factory(AworkAdapter),
  baserow: factory(BaserowAdapter),
  bigtime: factory(BigtimeAdapter),
  birdview: factory(BirdviewAdapter),
  buildertrend: factory(BuildertrendAdapter),
  businessmap: factory(BusinessmapAdapter),
  coda: factory(CodaAdapter),
  factro: factory(FactroAdapter),
  favro: factory(FavroAdapter),
  fibery: factory(FiberyAdapter),
  fieldwire: factory(FieldwireAdapter),
  float: factory(FloatAdapter),
  ganttpro: factory(GanttproAdapter),
  goodday: factory(GooddayAdapter),
  huly: factory(HulyAdapter),
  hygger: factory(HyggerAdapter),
  inloox: factory(InlooxAdapter),
  kaiten: factory(KaitenAdapter),
  kanboard: factory(KanboardAdapter),
  kantata: factory(KantataAdapter),
  leantime: factory(LeantimeAdapter),
  mantisbt: factory(MantisbtAdapter),
  meisterplan: factory(MeisterplanAdapter),
  'microsoft-todo': factory(MicrosoftTodoAdapter),
  'nextcloud-deck': factory(NextcloudDeckAdapter),
  nifty: factory(NiftyAdapter),
  nocodb: factory(NocodbAdapter),
  notion: factory(NotionAdapter),
  nuclino: factory(NuclinoAdapter),
  nutcache: factory(NutcacheAdapter),
  'odoo-project': factory(OdooProjectAdapter),
  ones: factory(OnesAdapter),
  openproject: factory(OpenprojectAdapter),
  ora: factory(OraAdapter),
  paymo: factory(PaymoAdapter),
  perdoo: factory(PerdooAdapter),
  pingcode: factory(PingcodeAdapter),
  plane: factory(PlaneAdapter),
  planfix: factory(PlanfixAdapter),
  'planview-adaptivework': factory(PlanviewAdaptiveworkAdapter),
  'process-street': factory(ProcessStreetAdapter),
  procore: factory(ProcoreAdapter),
  productboard: factory(ProductboardAdapter),
  productplan: factory(ProductplanAdapter),
  projectmanager: factory(ProjectmanagerAdapter),
  projectplace: factory(ProjectplaceAdapter),
  quickbase: factory(QuickbaseAdapter),
  redmine: factory(RedmineAdapter),
  rocketlane: factory(RocketlaneAdapter),
  ruddr: factory(RuddrAdapter),
  scoro: factory(ScoroAdapter),
  seatable: factory(SeatableAdapter),
  smartsuite: factory(SmartsuiteAdapter),
  smarttask: factory(SmarttaskAdapter),
  stackby: factory(StackbyAdapter),
  'suiteprojects-pro': factory(SuiteprojectsProAdapter),
  taiga: factory(TaigaAdapter),
  tapd: factory(TapdAdapter),
  teamhood: factory(TeamhoodAdapter),
  'teamwork-desk': factory(TeamworkDeskAdapter),
  'toggl-plan': factory(TogglPlanAdapter),
  tuleap: factory(TuleapAdapter),
  twproject: factory(TwprojectAdapter),
  vikunja: factory(VikunjaAdapter),
  weeek: factory(WeeekAdapter),
  weekdone: factory(WeekdoneAdapter),
  wekan: factory(WekanAdapter),
  wimi: factory(WimiAdapter),
  workboard: factory(WorkboardAdapter),
  workfront: factory(WorkfrontAdapter),
  'yandex-tracker': factory(YandexTrackerAdapter),
  zenhub: factory(ZenhubAdapter),
  zenkit: factory(ZenkitAdapter),
  'zoho-bugtracker': factory(ZohoBugtrackerAdapter),
  'zoho-sprints': factory(ZohoSprintsAdapter),
}
