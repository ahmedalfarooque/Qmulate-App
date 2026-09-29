# Beneficial Ownership Standards for Awqaf

> Structured summary. Source: `Beneficial Ownership Standards for Awqaf (نهائي).pdf` (EN) and
> `معايير المستفيد الحقيقي -- النسخة المُعتمدة.pdf` (AR), SharePoint `References & Regulations/`.
> Approved by **Board Resolution No. 14/1/47/ت dated 13/06/1447 AH (≈ 04/12/2025)**. Arabic controlling.
> Summary only. **New to the repo** — not previously captured in `docs/domain/`.

Standards for identifying the **Ultimate Beneficial Owner (UBO)** of endowments, aligning the Awqaf sector
with **FATF Recommendation 25** and the national AML/CTF strategy. Directly shapes the platform's
**beneficiary/KYC and AML** requirements.

## Scope & objectives (Art. 2–3)

- Applies to endowments under the Authority's supervision **and foreign endowments managed by a
  KSA-resident Nazir**.
- Objectives: transparency; guidance on UBO identification; local + international (FATF) compliance;
  prevent misuse for ML/TF; ensure accurate, timely UBO/beneficiary information.

## Who is a UBO (Art. 4)

A natural person is a UBO of the endowment if they are any of:
- the **founder** exercising ultimate/effective control;
- the **Nazir (supervisor)**;
- any other natural person exercising ultimate/effective control; or
- any **identifiable beneficiary or specified category** of beneficiaries.

If the founder/Nazir is a **legal entity**, its owner / directors / board members are treated as the UBO.

## Minimum information to hold (Art. 5)

For each UBO: full name, nationality, date & place of birth, residential address, contact details,
**ID document type & number**; date UBO status was acquired; **banking details used to receive proceeds**;
nature of relationship to the endowment; **amount/share of proceeds** due. For legal-entity UBOs and
professional service providers: name & legal form, national address, list of directors, powers. Maintain
**accurate payment records and historical classification** of payments to beneficiaries. Where no
identifiable beneficiaries exist at establishment, capture the **category/characteristics** before any
disbursement.

## Verify, update, disclose, retain (Art. 6–8)

- **Periodically verify** against the waqf deed, registration certificate, and official documents; update
  on any change; provide the Authority on change/request, plus asset nature/location/size.
- Risk-based verification rigor; beneficiaries must supply relevant info on request or their own motion.
- **Disclose** UBO info to financial institutions / DNFBPs and to the Authority/competent authorities on
  request; disclose the Nazir capacity when acting for the waqf.
- **Retain ≥ 10 years**; on term end, **immediately hand over originals** to the new Nazir.
- The **waqf deed and registration certificate are the primary sources**; supervision deeds / judicial
  rulings may add detail.
- **Art. 8:** a waqf may **not** be managed by non-Saudis permanently residing outside the Kingdom; **the
  Nazir must be a KSA resident.**

## Penalties (Art. 9)

Per the Schedule of Violations and Penalties of the Nazarah regulation (Board Resolution 100/1/34/46 dated
05/06/1446 AH).

## Product implications (traced in the BRD)

- **Beneficiary/KYC module** must capture the full Art. 5 minimum dataset (incl. ID, banking, share of
  proceeds) and a **UBO flag** distinct from ordinary beneficiary.
- **Periodic re-verification** against deed/certificate → a KYC-freshness cycle + reminders.
- **Disclosure workflow** to FIs/DNFBPs/Authority; **10-year retention**; **handover pack** on Nazir change.
- **PDPL interplay:** this data is highly sensitive personal data → access matrix, audit trail, residency,
  and the confidentiality rule (never in fixtures/tracked repo files).

## Related

- [nazarah-regulation-en.md](nazarah-regulation-en.md) (Art. 10 AML, Art. 20 retention) ·
  [awqaf-law.md](awqaf-law.md) · [`../../product/brd/`](../../product/brd/)
