/**
 * Firestore Security Rules — Dirty Dozen Adversarial Verification Suite
 * Verifies that all 12 adversarial payloads in security_spec.md return PERMISSION_DENIED.
 */

export interface AdversarialTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'delete' | 'get' | 'list';
  auth: {
    uid: string;
    email: string;
    email_verified: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: AdversarialTestCase[] = [
  {
    id: 1,
    name: 'Privilege Escalation — Self-Admin Grant by Non-Admin',
    collectionPath: '/admins/attacker_uid',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'staff@hospital.org', email_verified: true },
    payload: {
      uid: 'attacker_uid',
      grantedBy: 'attacker_uid',
      roleLabel: 'Self-Promoted Admin',
      createdAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Admin Email Spoof Attack',
    collectionPath: '/patients/pat_spoof',
    operation: 'create',
    auth: { uid: 'spoof_uid', email: 'subhaanandpps@gmail.com', email_verified: false },
    payload: {
      patientId: 'pat_spoof',
      mrn: 'MRN-9999',
      fullName: 'Spoof Patient',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Patient Update',
    collectionPath: '/patients/pat_101',
    operation: 'update',
    auth: { uid: 'staff_uid_1', email: 'nurse@hospital.org', email_verified: true },
    payload: {
      triageStatus: 'Stable',
      isVerifiedAdmin: true,
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Tier 2 Medical Staff Unauthorized Billing/Room Mutation',
    collectionPath: '/patients/pat_101',
    operation: 'update',
    auth: { uid: 'staff_uid_1', email: 'nurse@hospital.org', email_verified: true },
    payload: {
      insuranceStatus: 'Verified',
      roomNumber: 'ICU-01',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Terminal State Lock Bypass on Discharged Patient by Medical Staff',
    collectionPath: '/patients/pat_discharged',
    operation: 'update',
    auth: { uid: 'staff_uid_1', email: 'nurse@hospital.org', email_verified: true },
    payload: {
      vitalSigns: 'HR 72 | BP 120/80 | SpO2 99%',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Orphaned Subcollection Write — Master Gate Violation',
    collectionPath: '/patients/non_existent_pat/orders/ord_1',
    operation: 'create',
    auth: { uid: 'staff_uid_1', email: 'doctor@hospital.org', email_verified: true },
    payload: {
      orderId: 'ord_1',
      patientId: 'non_existent_pat',
      orderType: 'Medication',
      description: 'Amoxicillin 500mg PO',
      priority: 'Routine',
      orderStatus: 'Pending',
      orderedBy: 'staff_uid_1',
      orderedByName: 'Dr. Rivera',
      assignedStaffId: 'staff_uid_1',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Revoked Parent Assignment Subcollection Update',
    collectionPath: '/patients/pat_reassigned/orders/ord_1',
    operation: 'update',
    auth: { uid: 'former_staff_uid', email: 'former@hospital.org', email_verified: true },
    payload: {
      orderStatus: 'Completed',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Identity Spoofing on Security Audit Log Creation',
    collectionPath: '/audit_logs/log_spoof',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'staff@hospital.org', email_verified: true },
    payload: {
      logId: 'log_spoof',
      actorId: 'victim_admin_uid',
      actorName: 'Dr. Admin',
      actorRole: 'admin',
      action: 'Cleared audit records',
      targetId: 'pat_101',
      severity: 'Info',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Immortal Field Mutation (Changing MRN and createdBy on Update)',
    collectionPath: '/patients/pat_101',
    operation: 'update',
    auth: { uid: 'admin_uid', email: 'subhaanandpps@gmail.com', email_verified: true },
    payload: {
      mrn: 'MRN-ALTERED-999',
      createdBy: 'other_uid',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Resource Poisoning — Oversized 10KB Clinical Notes Payload',
    collectionPath: '/patients/pat_101',
    operation: 'update',
    auth: { uid: 'staff_uid_1', email: 'doctor@hospital.org', email_verified: true },
    payload: {
      clinicalNotes: 'X'.repeat(10000),
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Temporal Integrity — Backdated Client Timestamp Forgery',
    collectionPath: '/patients/pat_backdated',
    operation: 'create',
    auth: { uid: 'admin_uid', email: 'subhaanandpps@gmail.com', email_verified: true },
    payload: {
      createdAt: '2020-01-01T00:00:00Z',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unscoped List Scrape on Unassigned Patient Records',
    collectionPath: '/patients',
    operation: 'list',
    auth: { uid: 'unassigned_staff_uid', email: 'unassigned@hospital.org', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
