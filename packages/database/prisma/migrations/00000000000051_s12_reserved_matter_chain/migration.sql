-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — S12-2 · THE BR-1102 RESERVED-MATTER CHAIN IS RECORDED, AND THE SIGN IS DISABLED
--                    UNTIL IT IS COMPLETE.  (§10 §9 · BR-1102 · owner ruling 2026-09-08 "every matter")
-- HAND-AUTHORED. Never overwrite with `prisma migrate dev`.
--
-- ── WHAT WAS TRUE BEFORE THIS FILE ──────────────────────────────────────────────────────────
-- `approval_request` carried `counselReviewRequired`, `authorityNoticeRequired` and
-- `authorityReference` — WHETHER a step is required and one reference — and NO column for the
-- principal's written consent or for the review itself. `chainState()` in `packages/api` therefore
-- reported `principalConsent: 'NOT_RECORDED'` unconditionally, and `reservedMatter.approve`
-- recorded `chainEnforced: false` into the trail. Every reserved matter this product has approved
-- was approved on maker ≠ checker alone.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────────────────────
--   §1  eleven columns: the three steps' RecordedAt / RecordedAtHijri / By, and a reference for the
--       principal's consent and the counsel's review (the Authority step re-uses `authorityReference`)
--   §2  CHECKs: dual dates move together; a recorded step is attributed and referenced; chain steps
--       live only on RESERVED_MATTER rows; a KINDED row requires counsel review ("every matter");
--       and — the load-bearing one — a KINDED row cannot BE APPROVED/EXECUTED with a step missing
--   §3  qmulate_reserved_matter_chain_defect(id) — names the FIRST missing step, or NULL
--   §4  qmulate_approval_defect() re-created: the door refuses to SPEND an incomplete chain
--   §5  qmulate_approval_request_authority() re-created: chain columns write-once once set (0d);
--       PENDING → APPROVED on a kinded RESERVED_MATTER requires the chain complete, naming the step (0e)
--   §6  the sweep for the new function
--
-- ── SCOPE: KINDED RESERVED MATTERS ─────────────────────────────────────────────────────────
-- The chain applies where `reservedMatterKind IS NOT NULL` — the acts the operating model lists as
-- reserved (asset disposal / istibdal / pledge / long lease, deed identity, deed-term record, access-
-- matrix change) plus the two owner-ruled gated corrections (receipt class, classification return).
-- A KINDLESS `RESERVED_MATTER` row — the routine settings change `routers/settings.ts` mints, and any
-- `approval.initiate` without a kind — carries no chain and stays maker ≠ checker only.
-- ⚠ SURFACED, NOT DECIDED (S12 Q8): whether a settings change is a reserved matter at all. The
-- schema's own doc comment on `reservedMatterKind` has carried the biconditional CHECK as OWED since
-- S4; the honest fix is a separate ApprovalType, and it is not this file's to take.
--
-- ── WHY A ROW-LOCAL CHECK AND NOT ONLY A TRIGGER ────────────────────────────────────────────
-- Migration 22's lesson: a rule gated on a status CHANGE is blind to an INSERT that lands already
-- decided and to an UPDATE that moves only the columns the rule reads. `approval_request_kinded_
-- decision_requires_chain` is a POST-image predicate: a kinded row in APPROVED/EXECUTED with a
-- required step unrecorded cannot exist, by any path, on any connection, including the owner's. The
-- trigger (§5) adds the NAMED refusal a human reads; the door (§4) re-checks at spend time.
--
-- ── ADR-0004 DISCIPLINE ────────────────────────────────────────────────────────────────────
-- No backfill. A pre-existing kinded APPROVED row with no chain columns would FAIL §2's last CHECK at
-- `qmulate_add_check` validation and this migration would refuse to apply — which is the correct
-- answer: such a row is an approval this product can no longer stand behind, and inventing three
-- recorded facts for it is exactly the guess this repository refuses. Every environment is fixture-
-- only and rebuilt from `--reset`; the fixture seed mints no reserved matter.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §1 · THE COLUMNS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "approval_request"
  ADD COLUMN IF NOT EXISTS "principalConsentRecordedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "principalConsentRecordedAtHijri" TEXT,
  ADD COLUMN IF NOT EXISTS "principalConsentBy"              TEXT,
  ADD COLUMN IF NOT EXISTS "principalConsentReference"       TEXT,
  ADD COLUMN IF NOT EXISTS "counselReviewRecordedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "counselReviewRecordedAtHijri"    TEXT,
  ADD COLUMN IF NOT EXISTS "counselReviewBy"                 TEXT,
  ADD COLUMN IF NOT EXISTS "counselReviewReference"          TEXT,
  ADD COLUMN IF NOT EXISTS "authorityNoticeRecordedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "authorityNoticeRecordedAtHijri"  TEXT,
  ADD COLUMN IF NOT EXISTS "authorityNoticeBy"               TEXT;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §2 · THE CHECKS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Dual dates move together (ADR-0007 — one calendar recorded without the other is a pair that can
-- disagree about WHEN a step was taken).
SELECT qmulate_add_check('approval_request', 'approval_request_principal_consent_dual_dated',
  '("principalConsentRecordedAt" IS NULL) = ("principalConsentRecordedAtHijri" IS NULL)');
SELECT qmulate_add_check('approval_request', 'approval_request_counsel_review_dual_dated',
  '("counselReviewRecordedAt" IS NULL) = ("counselReviewRecordedAtHijri" IS NULL)');
SELECT qmulate_add_check('approval_request', 'approval_request_authority_notice_dual_dated',
  '("authorityNoticeRecordedAt" IS NULL) = ("authorityNoticeRecordedAtHijri" IS NULL)');

-- A recorded step names WHO recorded it and WHAT it rests on. A step with a date and no reference
-- is a claim; a reference with no date is a document nobody has attested.
SELECT qmulate_add_check('approval_request', 'approval_request_principal_consent_attributed',
  '("principalConsentRecordedAt" IS NULL) = ("principalConsentBy" IS NULL) AND '
  '("principalConsentRecordedAt" IS NULL) = ("principalConsentReference" IS NULL)');
SELECT qmulate_add_check('approval_request', 'approval_request_counsel_review_attributed',
  '("counselReviewRecordedAt" IS NULL) = ("counselReviewBy" IS NULL) AND '
  '("counselReviewRecordedAt" IS NULL) = ("counselReviewReference" IS NULL)');
SELECT qmulate_add_check('approval_request', 'approval_request_authority_notice_attributed',
  '("authorityNoticeRecordedAt" IS NULL) = ("authorityNoticeBy" IS NULL) AND '
  '("authorityNoticeRecordedAt" IS NULL OR "authorityReference" IS NOT NULL)');

-- Chain steps exist only on a reserved matter. A BANK_MOVEMENT with a "principal consent" is a
-- mislabelled authority.
SELECT qmulate_add_check('approval_request', 'approval_request_chain_steps_reserved_only',
  '"type" = ''RESERVED_MATTER'' OR ("principalConsentRecordedAt" IS NULL AND '
  '"counselReviewRecordedAt" IS NULL AND "authorityNoticeRecordedAt" IS NULL)');

-- "every matter" (owner, 2026-09-08): a kinded reserved matter always requires counsel review.
SELECT qmulate_add_check('approval_request', 'approval_request_kinded_requires_counsel_review',
  '"reservedMatterKind" IS NULL OR "counselReviewRequired" = true');

-- THE LOAD-BEARING ONE. A kinded reserved matter cannot BE decided-in-favour with a step missing.
SELECT qmulate_add_check('approval_request', 'approval_request_kinded_decision_requires_chain',
  '"type" <> ''RESERVED_MATTER'' OR "reservedMatterKind" IS NULL '
  'OR "status" NOT IN (''APPROVED'', ''EXECUTED'') '
  'OR ("principalConsentRecordedAt" IS NOT NULL '
  '    AND ("counselReviewRequired" = false OR "counselReviewRecordedAt" IS NOT NULL) '
  '    AND ("authorityNoticeRequired" = false OR "authorityNoticeRecordedAt" IS NOT NULL))');

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §3 · WHICH STEP IS MISSING — one implementation, three callers
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Returns the FIRST missing step in chain order (PRINCIPAL_CONSENT → COUNSEL_REVIEW →
-- AUTHORITY_NOTICE), or NULL when the chain is complete OR the row carries no chain (not a
-- RESERVED_MATTER, or kindless). The step names are the domain's own vocabulary
-- (`@qmulate/domain` RESERVED_MATTER_CHAIN_STEPS); the parity test pins them.
CREATE OR REPLACE FUNCTION qmulate_reserved_matter_chain_defect(p_approval_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $qm_chain_defect$
DECLARE
  r record;
BEGIN
  SELECT "type"::text AS type, "reservedMatterKind", "counselReviewRequired", "authorityNoticeRequired",
         "principalConsentRecordedAt", "counselReviewRecordedAt", "authorityNoticeRecordedAt"
    INTO r
    FROM "approval_request"
   WHERE "id" = p_approval_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF r.type <> 'RESERVED_MATTER' OR r."reservedMatterKind" IS NULL THEN RETURN NULL; END IF;
  IF r."principalConsentRecordedAt" IS NULL THEN RETURN 'PRINCIPAL_CONSENT'; END IF;
  IF r."counselReviewRequired" AND r."counselReviewRecordedAt" IS NULL THEN RETURN 'COUNSEL_REVIEW'; END IF;
  IF r."authorityNoticeRequired" AND r."authorityNoticeRecordedAt" IS NULL THEN RETURN 'AUTHORITY_NOTICE'; END IF;
  RETURN NULL;
END;
$qm_chain_defect$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §4 · THE DOOR — qmulate_approval_defect() re-created (migration 4's body + the chain, LAST)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION qmulate_approval_defect(
  p_approval_id   text,
  p_waqf_id       text,
  p_expected_type text,
  p_subject_id    text,
  p_allow_spent   boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $qm_appr_defect$
DECLARE
  r record;
  missing text;
BEGIN
  IF p_approval_id IS NULL OR btrim(p_approval_id) = '' THEN
    RETURN 'no approval id was supplied — an unnamed authority is not an authority';
  END IF;
  IF p_waqf_id IS NULL OR btrim(p_waqf_id) = '' THEN
    RETURN 'no endowment was supplied to verify the approval against — authority is PER ENDOWMENT';
  END IF;
  IF p_expected_type IS NULL OR btrim(p_expected_type) = '' THEN
    RETURN 'no expected approval type was supplied — an untyped gate accepts every approval';
  END IF;
  IF p_subject_id IS NULL OR btrim(p_subject_id) = '' THEN
    RETURN 'no subject was supplied — an approval binds to the ARTIFACT it approved, not merely '
           'to its endowment (C-14)';
  END IF;

  SELECT "id", "type"::text AS type, "status"::text AS status, "waqfId", "makerId", "checkerId",
         "subjectId", "deletedAt"
    INTO r
    FROM "approval_request"
   WHERE "id" = p_approval_id;

  IF NOT FOUND THEN
    RETURN format('approval_request %L does not exist — a fabricated id is not an approval',
                  p_approval_id);
  END IF;
  IF r."deletedAt" IS NOT NULL THEN
    RETURN format('approval_request %L is soft-deleted', p_approval_id);
  END IF;
  IF r.type IS DISTINCT FROM p_expected_type THEN
    RETURN format('approval_request %L is type %L, not %L', p_approval_id, r.type, p_expected_type);
  END IF;
  IF p_allow_spent THEN
    IF r.status NOT IN ('APPROVED', 'EXECUTED') THEN
      RETURN format('approval_request %L is %L, not APPROVED', p_approval_id, r.status);
    END IF;
  ELSIF r.status <> 'APPROVED' THEN
    RETURN format('approval_request %L is %L, not APPROVED', p_approval_id, r.status);
  END IF;
  IF r."waqfId" IS DISTINCT FROM p_waqf_id THEN
    RETURN format('approval_request %L belongs to waqf %L, not %L — an approval is per endowment',
                  p_approval_id, r."waqfId", p_waqf_id);
  END IF;
  IF r."checkerId" IS NULL THEN
    RETURN format('approval_request %L has no checkerId — nobody approved it', p_approval_id);
  END IF;
  IF r."checkerId" = r."makerId" THEN
    RETURN format('approval_request %L was self-approved (checkerId = makerId = %L)',
                  p_approval_id, r."makerId");
  END IF;
  IF r."subjectId" IS DISTINCT FROM p_subject_id THEN
    RETURN format('approval_request %L was approved for subject %L, not %L — an approval binds to '
                  'its artifact, and one approved act is not a licence for another',
                  p_approval_id, COALESCE(r."subjectId", '<null>'), p_subject_id);
  END IF;

  -- ── S12-2 · THE CHAIN, LAST (BR-1102) ─────────────────────────────────────────────────────
  -- Unreachable for a row that satisfied §2's CHECK, and kept anyway: the door must not depend on
  -- a constraint it cannot see being installed (migration 11's lesson, in the other direction).
  missing := qmulate_reserved_matter_chain_defect(p_approval_id);
  IF missing IS NOT NULL THEN
    RETURN format('approval_request %L: the BR-1102 approval chain is incomplete — %s is not '
                  'recorded. A reserved matter cannot execute without written principal approval, '
                  'counsel review and the Authority notice where required (§10 §9).',
                  p_approval_id, missing);
  END IF;

  RETURN NULL; -- genuine, genuinely about THIS artifact, and its chain is complete
END;
$qm_appr_defect$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §5 · THE TRIGGER — migration 50's body, byte-for-byte, plus blocks (0d) and (0e)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION qmulate_approval_request_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_appr_authority$
DECLARE
  new_status text := NEW."status"::text;
  old_status text := CASE WHEN TG_OP = 'UPDATE' THEN OLD."status"::text ELSE NULL END;
  changed    text := NULL;
  decision   text := NULL;
  deciding   text := NULL;
  step       text := NULL;
  missing    text := NULL;
BEGIN
  -- ── (-1) BORN PENDING (S12-1 / AV4-02) ───────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    IF new_status <> 'PENDING' THEN
      deciding := 'status=' || new_status;
    ELSIF NEW."checkerId" IS NOT NULL THEN
      deciding := 'checkerId';
    ELSIF NEW."decidedAt" IS NOT NULL THEN
      deciding := 'decidedAt';
    ELSIF NEW."decidedAtHijri" IS NOT NULL THEN
      deciding := 'decidedAtHijri';
    ELSIF NEW."checkerTotpAssertedAt" IS NOT NULL THEN
      deciding := 'checkerTotpAssertedAt';
    END IF;
    IF deciding IS NOT NULL AND NOT qmulate_is_approval_plane_role() THEN
      RAISE EXCEPTION
        'approval_request %: an approval request is BORN PENDING. This INSERT carries a decision '
        '("%") and the connection role "%" is not the approval plane. MEASURED (AV4-02, S4 round '
        '4): the runtime role inserted its own APPROVED RESERVED_MATTER row naming '
        'asset:asset-001:titleDeedNumber and spent it in the same transaction — the gate opened '
        'because the caller cut the key. Decisions travel through decideApproval() on the '
        'provisioning connection (ADR-0008 round 7, migration 50).',
        NEW."id", deciding, current_user
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- ── (0) THE WRITE-ONCE IDENTITY OF A REQUEST (C-02) ──────────────────────────────────────
    IF NEW."waqfId" IS DISTINCT FROM OLD."waqfId" THEN
      changed := 'waqfId';
    ELSIF NEW."type" IS DISTINCT FROM OLD."type" THEN
      changed := 'type';
    ELSIF NEW."makerId" IS DISTINCT FROM OLD."makerId" THEN
      changed := 'makerId';
    ELSIF NEW."subjectId" IS DISTINCT FROM OLD."subjectId" THEN
      changed := 'subjectId';
    ELSIF NEW."payload" IS DISTINCT FROM OLD."payload" THEN
      changed := 'payload';
    ELSIF OLD."payloadHash" IS NOT NULL AND NEW."payloadHash" IS DISTINCT FROM OLD."payloadHash"
    THEN
      changed := 'payloadHash';
    END IF;

    IF changed IS NOT NULL THEN
      RAISE EXCEPTION
        'approval_request %: "%" is part of the WRITE-ONCE IDENTITY of a request (waqfId, type, '
        'makerId, subjectId, payload, payloadHash). Re-pointing it is how maker <> checker and '
        'per-endowment authority are defeated in the very UPDATE that satisfies them — the CHECK '
        'compares the POST image, so rewriting the operand rewrites the answer. Raise a NEW '
        'request instead (BR-105 / BR-1103, §10 §4).',
        OLD."id", changed
        USING ERRCODE = '42501';
    END IF;

    -- ── (0a) THE WRITE-ONCE **DECISION** (AV7-B, AV7-D1) ─────────────────────────────────────
    IF OLD."checkerId" IS NOT NULL AND NEW."checkerId" IS DISTINCT FROM OLD."checkerId" THEN
      decision := 'checkerId';
    ELSIF OLD."decidedAt" IS NOT NULL AND NEW."decidedAt" IS DISTINCT FROM OLD."decidedAt" THEN
      decision := 'decidedAt';
    ELSIF OLD."decidedAtHijri" IS NOT NULL
      AND NEW."decidedAtHijri" IS DISTINCT FROM OLD."decidedAtHijri" THEN
      decision := 'decidedAtHijri';
    ELSIF OLD."checkerTotpAssertedAt" IS NOT NULL
      AND NEW."checkerTotpAssertedAt" IS DISTINCT FROM OLD."checkerTotpAssertedAt" THEN
      decision := 'checkerTotpAssertedAt';
    END IF;

    IF decision IS NOT NULL THEN
      RAISE EXCEPTION
        'approval_request %: "%" is part of the WRITE-ONCE DECISION of a request (checkerId, '
        'decidedAt, decidedAtHijri, checkerTotpAssertedAt) and is already recorded. ONE APPROVAL, '
        'ONE DECISION: re-attributing it is not a legal transition of the decision — it replaces '
        'the human who authorised the act, after the act, and MEASURED (AV7-D1c) on a run that had '
        'already paid, while the APPROVE audit event went on naming the original. The status '
        'lattice cannot see this, because it is gated on a status CHANGE and this UPDATE is not '
        'one. Retire the approval with status = ''VOID'' and raise a NEW request (BR-105 / '
        'BR-1103, §10 §4.3).',
        OLD."id", decision
        USING ERRCODE = '42501';
    END IF;

    -- ── (0b) SOFT-DELETE IS NOT A RETIREMENT PATH (C-13) ─────────────────────────────────────
    IF NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" THEN
      IF OLD."deletedAt" IS NOT NULL AND NEW."deletedAt" IS NULL THEN
        RAISE EXCEPTION
          'approval_request %: soft-deletion is one-way. Resurrecting a retired approval lets the '
          'maker choose, after the fact, which of two decided approvals is the live one.', OLD."id"
          USING ERRCODE = '42501';
      END IF;
      IF old_status IN ('PENDING', 'APPROVED') THEN
        RAISE EXCEPTION
          'approval_request %: a LIVE approval (%) is retired with status = ''VOID'', never by '
          'soft-delete. Soft-deleting it frees the one-open-per-subject slot and hides the '
          'decision from every live query, with no lattice transition to audit (§10 §4.3).',
          OLD."id", old_status
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- ── (0c) THE DECISION IS TAKEN ONLY ON THE APPROVAL PLANE (S12-1 / AV4-02) ───────────────
    IF OLD."checkerId" IS NULL AND NEW."checkerId" IS NOT NULL THEN
      deciding := 'checkerId';
    ELSIF new_status IS DISTINCT FROM old_status AND new_status IN ('APPROVED', 'REJECTED') THEN
      deciding := 'status=' || new_status;
    ELSIF OLD."decidedAt" IS NULL AND NEW."decidedAt" IS NOT NULL THEN
      deciding := 'decidedAt';
    ELSIF OLD."decidedAtHijri" IS NULL AND NEW."decidedAtHijri" IS NOT NULL THEN
      deciding := 'decidedAtHijri';
    ELSIF OLD."checkerTotpAssertedAt" IS NULL AND NEW."checkerTotpAssertedAt" IS NOT NULL THEN
      deciding := 'checkerTotpAssertedAt';
    END IF;

    IF deciding IS NOT NULL AND NOT qmulate_is_approval_plane_role() THEN
      RAISE EXCEPTION
        'approval_request %: "%" is the DECISION of a request, and the connection role "%" is not '
        'the approval plane. ONLY THE APPROVAL PLANE DECIDES (qmulate_provisioner / qmulate_owner): '
        'the runtime role may mint a PENDING request, spend an APPROVED one (-> EXECUTED) or retire '
        'one (-> VOID), and may not approve, reject, or record an approver. This is the control that '
        'closes AV4-02: it is keyed on current_user, the one fact about a connection the runtime '
        'credential cannot rewrite (SET ROLE measured 42501, ADR-0008 round 6). Route the decision '
        'through decideApproval() (packages/database/src/approval-plane.ts).',
        OLD."id", deciding, current_user
        USING ERRCODE = '42501';
    END IF;

    -- ── (0d) THE CHAIN STEPS ARE WRITE-ONCE ONCE SET (S12-2 / BR-1102) ──────────────────────
    -- NULL -> value is the step being recorded; value -> anything else re-writes who consented, who
    -- reviewed, or what they rested on — a second decision on one step (migration 22's shape).
    IF OLD."principalConsentRecordedAt" IS NOT NULL
       AND (NEW."principalConsentRecordedAt" IS DISTINCT FROM OLD."principalConsentRecordedAt"
         OR NEW."principalConsentRecordedAtHijri" IS DISTINCT FROM OLD."principalConsentRecordedAtHijri"
         OR NEW."principalConsentBy" IS DISTINCT FROM OLD."principalConsentBy"
         OR NEW."principalConsentReference" IS DISTINCT FROM OLD."principalConsentReference") THEN
      step := 'PRINCIPAL_CONSENT';
    ELSIF OLD."counselReviewRecordedAt" IS NOT NULL
       AND (NEW."counselReviewRecordedAt" IS DISTINCT FROM OLD."counselReviewRecordedAt"
         OR NEW."counselReviewRecordedAtHijri" IS DISTINCT FROM OLD."counselReviewRecordedAtHijri"
         OR NEW."counselReviewBy" IS DISTINCT FROM OLD."counselReviewBy"
         OR NEW."counselReviewReference" IS DISTINCT FROM OLD."counselReviewReference") THEN
      step := 'COUNSEL_REVIEW';
    ELSIF OLD."authorityNoticeRecordedAt" IS NOT NULL
       AND (NEW."authorityNoticeRecordedAt" IS DISTINCT FROM OLD."authorityNoticeRecordedAt"
         OR NEW."authorityNoticeRecordedAtHijri" IS DISTINCT FROM OLD."authorityNoticeRecordedAtHijri"
         OR NEW."authorityNoticeBy" IS DISTINCT FROM OLD."authorityNoticeBy"
         OR NEW."authorityReference" IS DISTINCT FROM OLD."authorityReference") THEN
      step := 'AUTHORITY_NOTICE';
    END IF;

    IF step IS NOT NULL THEN
      RAISE EXCEPTION
        'approval_request %: the % step of the BR-1102 chain is already recorded and is WRITE-ONCE. '
        'Re-recording it replaces who consented or reviewed, or what they rested on, after the '
        'fact. Retire the request with status = ''VOID'' and raise a NEW one (§10 §4.3).',
        OLD."id", step
        USING ERRCODE = '42501';
    END IF;

    -- ── (0e) THE SIGN IS DISABLED UNTIL THE CHAIN IS COMPLETE (S12-2 / §10 §9) ──────────────
    -- Evaluated on the POST image so a step recorded in this very UPDATE counts. The CHECK in §2
    -- refuses the same row shape without a sentence; this is the sentence, naming the step.
    IF new_status = 'APPROVED' AND old_status IS DISTINCT FROM 'APPROVED'
       AND NEW."type"::text = 'RESERVED_MATTER' AND NEW."reservedMatterKind" IS NOT NULL THEN
      IF NEW."principalConsentRecordedAt" IS NULL THEN
        missing := 'PRINCIPAL_CONSENT';
      ELSIF NEW."counselReviewRequired" AND NEW."counselReviewRecordedAt" IS NULL THEN
        missing := 'COUNSEL_REVIEW';
      ELSIF NEW."authorityNoticeRequired" AND NEW."authorityNoticeRecordedAt" IS NULL THEN
        missing := 'AUTHORITY_NOTICE';
      END IF;
      IF missing IS NOT NULL THEN
        RAISE EXCEPTION
          'approval_request %: the Nazir''s sign is disabled — the BR-1102 approval chain is '
          'incomplete, and % is not recorded. Written principal approval, counsel review and the '
          'Authority notice where required precede the signature (§10 §9; owner ruling 2026-09-08 '
          '"every matter"). RESERVED_MATTER_CHAIN_INCOMPLETE.',
          NEW."id", missing
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- ── the status lattice ────────────────────────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' AND new_status IS DISTINCT FROM old_status THEN
    IF old_status IN ('REJECTED', 'EXECUTED', 'VOID') THEN
      RAISE EXCEPTION
        'approval_request %: % is terminal; % rejected. Re-deciding a closed approval is how a '
        'second authority is created through an UPDATE — raise a NEW request instead.',
        OLD."id", old_status, new_status
        USING ERRCODE = '42501';
    END IF;
    IF NOT (
         (old_status = 'PENDING'  AND new_status IN ('APPROVED', 'REJECTED', 'VOID'))
      OR (old_status = 'APPROVED' AND new_status IN ('EXECUTED', 'VOID'))
    ) THEN
      RAISE EXCEPTION
        'approval_request %: illegal status transition % -> %. Legal: PENDING -> '
        'APPROVED|REJECTED|VOID, APPROVED -> EXECUTED|VOID (§10 §4.3).',
        OLD."id", old_status, new_status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── who may be recorded as the approver ──────────────────────────────────────────────────
  IF new_status IN ('APPROVED', 'EXECUTED') THEN
    IF NEW."checkerId" IS NULL THEN
      RAISE EXCEPTION
        'approval_request %: status % requires a checkerId. An approval with no approver is not an '
        'approval (BR-105).', NEW."id", new_status
        USING ERRCODE = '42501';
    END IF;
    IF NOT qmulate_has_active_grant(NEW."checkerId", NEW."waqfId", 'NAZIR') THEN
      RAISE EXCEPTION
        'approval_request %: checkerId "%" holds no ACTIVE NAZIR waqf_access_grant on waqf "%". The '
        'Nazir is the sole approval authority, PER ENDOWMENT (BR-105 / BR-1103, §10 §4).',
        NEW."id", NEW."checkerId", NEW."waqfId"
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$qm_appr_authority$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §6 · THE SWEEP
-- ─────────────────────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION qmulate_reserved_matter_chain_defect(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION qmulate_reserved_matter_chain_defect(text) TO qmulate_app, qmulate_provisioner;
