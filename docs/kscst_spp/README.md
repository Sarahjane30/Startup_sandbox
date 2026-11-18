# KSCST SPP 50S Proposal — Startup Sandbox

Filled project proposal for the **50th Series Student Project Programme (2026–2027)**, based on the Startup Sandbox project in this repository.

The proposal is produced by editing the **official KSCST Word template** in place (same logo header, "Page X of Y" footer, numbered Part A / Part B tables, declaration and fee-details pages), following the layout of the Batch-1 reference proposal: instruction notes, the Endorsement page and the KSCST bank-details page are removed.

## Files

| File | Description |
| --- | --- |
| `KSCST_SPP_50S_Proposal_Startup_Sandbox_FILLED.docx` | Editable filled proposal |
| `KSCST_SPP_50S_Proposal_Startup_Sandbox_FILLED.pdf` | PDF preview |
| `KSCST_SPP_50S_Proposal_Format_template.docx` | Official KSCST template (converted from `.doc`) |
| `startup_sandbox_block_diagram.png` | Block diagram inserted in Proposed Methodology |
| `generate_proposal.py` | Regenerates the filled `.docx` from the template |

## Left blank for the applicant

Institution details, project guide, student team table (photos, names, USN, category, contacts), SPP coordinator, payment/UTR details, signatures and seals. Facilities (item 18) contain generic entries — confirm them against your institution.

## Regenerate

```bash
pip install python-docx pillow
python3 docs/kscst_spp/generate_proposal.py
```
