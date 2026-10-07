# Isarva ISMS — ISO/IEC 27001 documentation pack

**Organisation:** Isarva · **Product:** Isarva Restaurant POS  
**Status:** Version **0.1 Draft** — not auditor-approved; signature blanks remain.

## A — Policy & SoA

| ID | Title | Markdown | PDF | DOCX |
|----|-------|----------|-----|------|
| ISARVA-ISMS-POL-001 | Information Security Policy | [`.md`](./ISARVA-ISMS-POL-001-Information-Security-Policy.md) | [`pdf/`](./pdf/) | [`docx/`](./docx/) |
| ISARVA-ISMS-SOA-001 | Statement of Applicability (Annex A) | [`.md`](./ISARVA-ISMS-SOA-001-Statement-of-Applicability.md) | [`pdf/`](./pdf/) | [`docx/`](./docx/) |

## B — Procedures (PROC-001 … PROC-015)

Index: [`procedures/README.md`](./procedures/README.md)

| Deliverable | Path |
|-------------|------|
| Combined pack (all 15) PDF | `pdf/ISARVA-ISMS-PROC-PACK-001-All-Procedures.pdf` |
| Combined pack DOCX | `docx/ISARVA-ISMS-PROC-PACK-001-All-Procedures.docx` |
| Individual procedures | `procedures/ISARVA-ISMS-PROC-*.md` + matching PDF/DOCX |

## C — Scope & risk

| ID | Title | Markdown | PDF | DOCX |
|----|-------|----------|-----|------|
| ISARVA-ISMS-SCP-001 | ISMS Scope Statement | [`.md`](./ISARVA-ISMS-SCP-001-ISMS-Scope-Statement.md) | [`pdf/`](./pdf/) | [`docx/`](./docx/) |
| ISARVA-ISMS-RISK-001 | Risk assessment & treatment | [`.md`](./ISARVA-ISMS-RISK-001-Risk-Assessment-Treatment.md) | [`pdf/`](./pdf/) | [`docx/`](./docx/) |

## D — User manuals by role

Index: [`../user-manuals/README.md`](../user-manuals/README.md)

| Deliverable | Path |
|-------------|------|
| Combined pack PDF | `../user-manuals/pdf/ISARVA-UM-PACK-001-All-User-Manuals.pdf` |
| Combined pack DOCX | `../user-manuals/docx/ISARVA-UM-PACK-001-All-User-Manuals.docx` |
| Roles covered | Admin, Cashier, Food Server, Kitchen Manager, Delivery rider |

## B — Architecture & data flows

Index: [`../architecture/README.md`](../architecture/README.md)

| Deliverable | Path |
|-------------|------|
| Combined pack PDF | `../architecture/pdf/ISARVA-ARCH-PACK-001-All-Architecture.pdf` |
| Combined pack DOCX | `../architecture/docx/ISARVA-ARCH-PACK-001-All-Architecture.docx` |
| Documents | ARCH-001 System · ARCH-002 Data flows · ARCH-003 ZATCA |

## C — Ops runbooks

Index: [`../ops-runbooks/README.md`](../ops-runbooks/README.md)

| Deliverable | Path |
|-------------|------|
| Combined pack PDF | `../ops-runbooks/pdf/ISARVA-OPS-PACK-001-All-Ops-Runbooks.pdf` |
| Combined pack DOCX | `../ops-runbooks/docx/ISARVA-OPS-PACK-001-All-Ops-Runbooks.docx` |
| Documents | OPS-000…004 (health, backup, deploy, incident) |

## Customer user guide (handover)

| Document | Path |
|----------|------|
| ISARVA-CG-001 (PDF) | `../customer-guide/pdf/ISARVA-CG-001-Customer-User-Guide.pdf` |
| ISARVA-CG-001 (DOCX) | `../customer-guide/docx/ISARVA-CG-001-Customer-User-Guide.docx` |

## Regenerate PDF / DOCX

```bash
python tools/export_iso_docs.py
```

Run from `docs/iso27001` (also exports user manuals, architecture, ops, and customer guide).
