# Law of the General Authority for Awqaf

> Structured summary. Source: `نظام الهيئة العامة للأوقاف باللغة الأنجليزية_0.pdf` (EN) and
> `نظام الاوقاف.pdf` (AR), SharePoint `References & Regulations/`. Issued by **Royal Decree No. (M/11)
> dated 26/02/1437 AH**. Arabic is controlling. Summary only — verify against the official text.

The founding statute of the **General Authority for Awqaf** (the regulator QMULATE operates under as
Nazir). It establishes the Authority, its mandate, governance, and financial regime.

## Key provisions relevant to QMULATE

- **Art. 2 — Legal status & HQ.** The Authority is an independent public body reporting to the Prime
  Minister; **headquartered in Riyadh**, may open branches in the Kingdom.
- **Art. 3 — Purpose.** Regulate, maintain, and develop endowments to fulfil endowers' conditions and
  promote their economic/social role, per Sharia and law.
- **Art. 4 — Oversight scope.** The Authority oversees **all public, private (family), and joint**
  endowments, and oversees the work of trustees appointed by endowers **without interfering** with
  trusteeship or violating the endower's conditions.
  - **✓ RESOLVED 2026-08-03 (product owner) — `joint` here is an OVERSIGHT CATEGORY, not a hybrid
    endowment. This summary line is correct and is UNCHANGED.** The question previously referred to Saudi
    counsel — does الوقف المشترك as Art. 4 uses it mean *one endowment carrying both charitable and family
    beneficiaries*, or an **Authority oversight category spanning both kinds of endowment**? — was answered
    by the product owner (a practising Nazir): *"it just means that there are 2 types of endowments/waqf,
    but a waqf cannot be both."* It is the **oversight category**. **There was never a contradiction**
    between this Article and the engine's refusal of a joint waqf: Art. 4 says the Authority oversees both
    kinds, not that one endowment combines them. The distribution engine's refusal of `waqfType: 'JOINT'`
    and of any cohort mixing a charitable jiha with a family beneficiary
    ([ADR-0009](../../decisions/ADR-0009-lineage-entitlement-and-no-joint-waqf.md) decision 3 + amendment B)
    is therefore **correct and stays**; `docs/domain/glossary.md`'s الوقف المشترك definition was the drifted
    side and has been reworded. CLAUDE.md register item **#11** is closed.
    ⚠ **One caveat and no more:** the owner is a practising Nazir, not Saudi counsel, so this is the
    **product's** position — a legal filing or an Authority dispute that turns on the meaning of المشترك
    should still be put to counsel. That caveat does **not** reopen the item.
- **Art. 5 — Authority functions.** Registering all endowments after documentation; building a national
  inventory/database; assuming trusteeship of certain endowments; managing endowments for others at the
  endower's/trustee's request; reviewing annual accounting reports; providing technical support;
  requesting a change of external auditor; **filing to dismiss trustees** who fail their duties; approving
  fundraising-financed public/joint endowments.
- **Art. 14 — Authority's management fee.** For endowments **not** under its trusteeship, the Authority
  may charge a fee **≤ 10% of annual net income**, set in agreement with the endower/trustee.
  *(Benchmark for QMULATE's own Nazir-remuneration framing — see the BRD commercial model.)*
- **Art. 15 — Investment limits (Authority-managed).** Invest ≤ 25% of annual net income for the
  endowment's benefit; deduct ≤ 20% of surplus revenues to develop other endowments (returned within 5
  years).
- **Art. 16 / 18 — Segregation & accounting.** Separate accounts and budgets per endowment, independent
  of the Authority; funds deposited with SAMA or a licensed Saudi bank; a financial accounting system
  suited to endowments.
- **Art. 20 — Audit.** Board-appointed licensed auditor(s) audit endowment and Authority accounts;
  reports to the Board and the General Audit Bureau.
- **Art. 23 / 24 — Conduct.** All actions must comply with endowers' conditions, Sharia, and law; strict
  conflict-of-interest prohibition (Board/employees/relatives to the 4th degree).

## Why it matters for the product

- Confirms the **regulator, its powers, and the classification/oversight regime** the platform's
  compliance module must track against.
- The **≤10% of net income** fee ceiling and the **SAMA/licensed-bank + segregated-account** rules are
  hard constraints the finance module must respect.
- The Authority can **dismiss a trustee** — reinforcing why zero-tolerance compliance (registration,
  no commingling, AML, KYC) is a first-class product concern.

## Related

- [nazarah-regulation-en.md](nazarah-regulation-en.md) — the operational regulation issued under this Law.
- [beneficial-ownership-standards.md](beneficial-ownership-standards.md) — AML/UBO standards issued under it.
- [`../../product/brd/`](../../product/brd/) — the BRD that turns these into requirements.
