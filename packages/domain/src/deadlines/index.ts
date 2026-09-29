/**
 * §09 Engine B — the deadline engine's pure layer (E8/S9).
 *
 * Rule vocabulary + rule-shaped computation in `./rules.js` (composing `../dates`'s calculator),
 * derived state + escalation arithmetic in `./escalation.js`. Persistence (the `Deadline` rows,
 * frozen dual dates) is `packages/database`'s; the daily evaluator is `apps/worker`'s. Nothing
 * here reads a clock, a database, or a `Setting` row — every fact arrives as a parameter.
 */

export {
  DEADLINE_RULE_KEYS,
  DEADLINE_RULES,
  NON_CLOCK_REFUSALS,
  computeRuleDeadline,
  isDeadlineRuleKey,
} from './rules.js';
export type {
  ComputeRuleDeadlineInput,
  ComputedRuleDeadline,
  DeadlineRuleDescriptor,
  DeadlineRuleKey,
  DeadlineRuleKind,
  NonClockRefusal,
  RuleSettingValues,
  RuleWindowSource,
} from './rules.js';

export {
  ANCHOR_CHAIN_REFUSALS,
  ANCHOR_DECLARATIONS,
  ANCHOR_DERIVED_RULE_KEYS,
  ANCHOR_OWNER_QUEUE_ITEMS,
  ANCHOR_ROUTED_RULE_KEYS,
  ANCHOR_ROUTING_REFUSALS,
  FISCAL_YEAR_END_READING,
  anchorDeclarationFor,
  anchorProvenanceOf,
  deriveAnchor,
  resolveFiscalYearEndAnchor,
  selectAnchorChainHead,
} from './anchors.js';
export type {
  AnchorCandidate,
  AnchorChainCandidate,
  AnchorChainRefusal,
  AnchorDeclaration,
  AnchorProvenance,
  AnchorRouting,
  AnchorRoutingRefusal,
  AnchorSource,
  AnchorSubject,
  DerivedAnchor,
} from './anchors.js';

export { WINDOW_SNAPSHOT_KEYS, windowSnapshotOf } from './snapshot.js';
export type { WindowSnapshot } from './snapshot.js';

export {
  COALESCE_IDENTITY_KEY,
  COALESCE_REFUSALS,
  UPDATE_OBLIGATION_TEMPLATE_CODE,
  coalesceUpdateObligation,
} from './coalescing.js';
export type {
  CoalesceCause,
  CoalesceDecision,
  CoalesceInput,
  CoalesceRefusal,
  OpenUpdateObligation,
  UnfiledChange,
} from './coalescing.js';

export {
  ESCALATION_LEVEL_DB_VALUE,
  ESCALATION_ROLE_BY_LEVEL,
  EVALUATOR_REFUSALS,
  MIRROR_ABSTENTIONS,
  TASK_STATUSES_FOR_MIRROR,
  escalationIdempotencyKey,
  ladderFromTuple,
  mirrorTaskStatus,
  planDeadlineEvaluation,
  reminderIdempotencyKey,
  selectEscalationLadder,
} from './evaluator.js';
export type {
  DeadlineEvaluationPlan,
  DeadlinePlanEntry,
  EvaluatedDeadlineFacts,
  EvaluatorConfig,
  EvaluatorRefusal,
  LadderPair,
  MirrorAbstention,
  MirrorTaskStatus,
  StatusMirror,
} from './evaluator.js';

export {
  BOARD_CAUSES,
  BOARD_STATES,
  HEALTHY_BOARD_CAUSES,
  deriveBoardState,
  isLifecycleStatus,
} from './board-state.js';
export type { BoardCause, BoardState, BoardStateInput, DerivedBoardState } from './board-state.js';
export {
  DEADLINE_STATUSES,
  ESCALATION_LEVELS,
  deriveDeadlineState,
  deriveEscalationLevel,
  preAlertsFiringOn,
} from './escalation.js';
export type {
  DeadlineStateInput,
  DeadlineStatus,
  DerivedDeadlineState,
  EscalationLadder,
  EscalationLevel,
} from './escalation.js';
