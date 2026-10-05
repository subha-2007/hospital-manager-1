# Hospital DB Manager — Zero-Trust RBAC Security Specification (`security_spec.md`)

## 1. Data Invariants & Relationship Mapping

1. **Master Source of Truth & Role Hierarchy**:
   - **Tier 1 (`Hospital Administrator`)**: Verified user whose email matches the bootstrapped administrator (`subhaanandpps@gmail.com` with `email_verified == true`) OR whose UID exists in `/databases/$(database)/documents/admins/$(request.auth.uid)`.
   - **Tier 2 (`Medical Staff / Clinician`)**: Verified user (`email_verified == true`) who is the assigned clinician on a patient record (`resource.data.assignedStaffId == request.auth.uid`) or owner of their staff profile (`resource.data.ownerId == request.auth.uid`).
2. **Relational Sync (Pillar 1 — Master Gate)**:
   - Every `/patients/{patientId}/orders/{orderId}` subcollection document is gated by its parent `/patients/{patientId}` document via `get()`. An order can only be created or modified if the parent patient record exists and the user is either an Admin (`isAdmin()`) or the currently assigned medical staff member on the parent patient (`parentPatient(patientId).assignedStaffId == request.auth.uid`).
3. **Anti-Update-Gap & Strict Schema Blueprints (Pillar 2)**:
   - Every collection has a standalone `isValid[Entity](data)` function invoked on BOTH `create` and `update`.
   - `hasAll` and `hasOnly` strictly whitelist allowed keys; shadow fields are rejected.
4. **ID Poisoning Guard & Size Enforcements (Pillar 3)**:
   - Every single-document path variable (`{adminId}`, `{staffId}`, `{patientId}`, `{orderId}`, `{deptId}`, `{logId}`) is validated with `isValidId(id)` (`<= 128` chars, regex `^[a-zA-Z0-9_\-]+$`).
   - Every string field enforces both `minLength` and `maxLength` bounds.
5. **Tiered Identity & Action-Based Updates (Pillar 4 & Terminal State Locking)**:
   - On `/patients/{patientId}`:
     - **Tier 1 (Admin)**: Can create, delete, and update administrative/clinical fields (`fullName`, `age`, `bloodType`, `department`, `roomNumber`, `triageStatus`, `diagnosisSummary`, `vitalSigns`, `clinicalNotes`, `insuranceStatus`, `assignedStaffId`, `assignedStaffName`, `updatedAt`), including overriding `'Discharged'` status.
     - **Tier 2 (Assigned Medical Staff)**: Cannot create or delete patients. Can ONLY update clinical care fields (`triageStatus`, `diagnosisSummary`, `vitalSigns`, `clinicalNotes`, `updatedAt`) when `existing().triageStatus != 'Discharged'` and `existing().assignedStaffId == request.auth.uid`. Cannot modify `mrn`, `insuranceStatus`, `department`, `roomNumber`, or `assignedStaffId`.
6. **PII Isolation (Pillar 6)**:
   - `/staff_profiles/{staffId}` stores strictly non-PII professional directory fields (`fullName`, `role`, `department`, `badgeId`, `shift`, `status`). No raw emails, phone numbers, or home addresses are stored in staff or patient documents.
7. **Secure List Queries Without Cost Explosion (Pillar 8)**:
   - Every `allow list` rule evaluates `resource.data` directly against `request.auth.uid` (e.g. `resource.data.assignedStaffId == request.auth.uid || resource.data.createdBy == request.auth.uid` or `resource.data.ownerId == request.auth.uid` or `resource.data.actorId == request.auth.uid`) and contains ZERO `get()` or `exists()` calls.
8. **Temporal & Immortal Field Integrity**:
   - `createdAt == request.time` on `create`; `updatedAt == request.time` on `update`.
   - Immutable fields (`patientId`, `mrn`, `createdBy`, `createdAt`, `ownerId`, `staffId`, `orderId`, `orderedBy`) cannot be mutated on `update`.
   - `/audit_logs/{logId}` are strictly append-only (`allow update, delete: if false;`).

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Privilege Escalation — Self-Admin Grant)**: Non-admin user attempts `create` on `/admins/attacker_uid` with `{ uid: "attacker_uid", grantedBy: "attacker_uid", roleLabel: "Chief Admin", createdAt: request.time }`. -> `PERMISSION_DENIED`.
2. **Payload 2 (Unverified Admin Email Spoof)**: User with `email: "subhaanandpps@gmail.com"` but `email_verified: false` attempts to `create` a patient in `/patients/pat_1`. -> `PERMISSION_DENIED`.
3. **Payload 3 (Shadow Field Injection on Patient Update)**: Assigned medical staff updates `/patients/pat_1` with `{ triageStatus: "Stable", isSuperAdmin: true, updatedAt: request.time }`. -> `PERMISSION_DENIED` (blocked by `hasOnly` in `isValidPatientRecord` and `affectedKeys().hasOnly(...)`).
4. **Payload 4 (Tier 2 Medical Staff Unauthorized Billing/Room Mutation)**: Assigned clinician (`assignedStaffId == request.auth.uid`, non-admin) attempts to update `insuranceStatus: "Verified"` or `roomNumber: "ICU-01"` on `/patients/pat_1`. -> `PERMISSION_DENIED` (blocked by Tier 2 `affectedKeys().hasOnly(['triageStatus', 'diagnosisSummary', 'vitalSigns', 'clinicalNotes', 'updatedAt'])`).
5. **Payload 5 (Terminal State Lock Bypass)**: Assigned clinician attempts to update `vitalSigns` on a patient whose `existing().triageStatus == "Discharged"`. -> `PERMISSION_DENIED` (Terminal State Gate requires `existing().triageStatus != 'Discharged' || isAdmin()`).
6. **Payload 6 (Orphaned Subcollection Write — Master Gate Violation)**: Clinician attempts to create `/patients/non_existent_patient/orders/ord_1` where parent patient does not exist. -> `PERMISSION_DENIED`.
7. **Payload 7 (Revoked Parent Assignment Subcollection Write)**: Clinician who is no longer `assignedStaffId` on `/patients/pat_1` attempts to update `/patients/pat_1/orders/ord_1`. -> `PERMISSION_DENIED` (Master Gate checks live parent `get()`).
8. **Payload 8 (Identity Spoofing on Audit Log)**: Authenticated user attempts to create `/audit_logs/log_1` with `actorId: "another_user_uid"`. -> `PERMISSION_DENIED` (`data.actorId == request.auth.uid` enforced).
9. **Payload 9 (Immortal Field Mutation)**: Admin attempts to change `mrn` or `createdBy` or `createdAt` during an `update` on `/patients/pat_1`. -> `PERMISSION_DENIED`.
10. **Payload 10 (Resource Poisoning / Oversized String)**: User sends a 10,000-character string in `clinicalNotes` (limit 1000) or a 200-character document ID. -> `PERMISSION_DENIED`.
11. **Payload 11 (Client Timestamp Forgery)**: User attempts to create a patient record with a backdated `createdAt` timestamp (`request.time - 86400s`). -> `PERMISSION_DENIED` (`data.createdAt == request.time` enforced).
12. **Payload 12 (Unbounded / Unscoped List Scrape)**: Authenticated user attempts an unscoped `list` query on `/patients` for records where they are neither `assignedStaffId` nor `createdBy`. -> `PERMISSION_DENIED`.
