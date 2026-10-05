/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  Lock,
  LogOut,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Unlock,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  BOOTSTRAPPED_ADMIN_EMAILS,
  clampString,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  sanitizeId,
} from './firebase';
import { seedHospitalDatabase } from './seedData';
import { AttendanceAndCaseloadView } from './AttendanceAndCaseloadView';
import {
  AttendanceRecord,
  AttendanceStatus,
  AuditLog,
  AuditSeverity,
  BloodType,
  ClinicalOrder,
  ClinicalWard,
  DepartmentConfig,
  DepartmentName,
  DiversionStatus,
  InsuranceStatus,
  OrderPriority,
  OrderStatus,
  OrderType,
  PatientRecord,
  ShiftType,
  StaffDutyStatus,
  StaffProfile,
  StaffRole,
  TriageStatus,
} from './types';

type ActiveTab = 'patients' | 'attendance' | 'orders' | 'departments' | 'staff' | 'rbac';
type AccessTierMode = 'admin' | 'medical_staff';

const CLINICAL_WARDS: ClinicalWard[] = [
  'ICU',
  'Cardiology',
  'Emergency',
  'Neurology',
  'Oncology',
  'Pediatrics',
];

const BLOOD_TYPES: BloodType[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const TRIAGE_STATUSES: TriageStatus[] = ['Critical', 'Observation', 'Stable', 'Discharged'];
const INSURANCE_STATUSES: InsuranceStatus[] = [
  'Verified',
  'Pending Review',
  'Self-Pay',
  'Gov-Coverage',
];
const STAFF_ROLES: StaffRole[] = ['admin', 'physician', 'nurse', 'lab_tech'];
const SHIFT_TYPES: ShiftType[] = ['Day (07:00-19:00)', 'Night (19:00-07:00)', 'On-Call'];
const DUTY_STATUSES: StaffDutyStatus[] = ['On Duty', 'Off Duty', 'In Surgery'];
const ORDER_TYPES: OrderType[] = ['Medication', 'Lab Panel', 'Imaging', 'Procedure'];
const ORDER_PRIORITIES: OrderPriority[] = ['STAT', 'Urgent', 'Routine'];
const ORDER_STATUSES: OrderStatus[] = ['Pending', 'In Progress', 'Completed', 'Cancelled'];
const DIVERSION_STATUSES: DiversionStatus[] = [
  'Normal Operations',
  'Advisory',
  'Critical Capacity',
  'Diversion',
];

function formatTimestamp(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Syncing...';
  const d = ts.toDate();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Active navigation & RBAC Role Tier Switcher
  const [activeTab, setActiveTab] = useState<ActiveTab>('patients');
  const [accessMode, setAccessMode] = useState<AccessTierMode>('admin');

  // Firestore Collections State
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [orders, setOrders] = useState<ClinicalOrder[]>([]);
  const [departments, setDepartments] = useState<DepartmentConfig[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [hasAdminGrantDoc, setHasAdminGrantDoc] = useState(false);

  // UI Filter & Action states
  const [searchQuery, setSearchQuery] = useState('');
  const [wardFilter, setWardFilter] = useState<string>('ALL');
  const [acuityFilter, setAcuityFilter] = useState<string>('ALL');
  const [seeding, setSeeding] = useState(false);
  const [hasAutoSeeded, setHasAutoSeeded] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Modals & Drawers
  const [editingPatient, setEditingPatient] = useState<PatientRecord | null>(null);
  const [clinicalNotesDraft, setClinicalNotesDraft] = useState<string>('');
  const [newObservationDraft, setNewObservationDraft] = useState<string>('');
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [showNewStaffModal, setShowNewStaffModal] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentConfig | null>(null);

  // Determine whether the authenticated user holds actual backend Admin rights
  const isVerifiedBootstrappedAdmin = Boolean(
    user?.emailVerified && user?.email && BOOTSTRAPPED_ADMIN_EMAILS.includes(user.email)
  );
  const canUseAdminTier = isVerifiedBootstrappedAdmin || hasAdminGrantDoc;
  const effectiveMode: AccessTierMode = canUseAdminTier ? accessMode : 'medical_staff';
  const isAdminActive = effectiveMode === 'admin';

  // 1. Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        const isBootAdmin = Boolean(
          currentUser.emailVerified &&
            currentUser.email &&
            BOOTSTRAPPED_ADMIN_EMAILS.includes(currentUser.email)
        );
        setAccessMode(isBootAdmin ? 'admin' : 'medical_staff');
      }
    });
    return () => unsub();
  }, []);

  // 2. Check /admins/{uid} document if signed in
  useEffect(() => {
    if (!authReady || !user) {
      setHasAdminGrantDoc(false);
      return;
    }
    const adminDocPath = `admins/${user.uid}`;
    const unsub = onSnapshot(
      doc(db, 'admins', user.uid),
      (snap) => {
        setHasAdminGrantDoc(snap.exists());
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, adminDocPath);
      }
    );
    return () => unsub();
  }, [authReady, user]);

  // 3. Real-time Patients Listener — Scoped by Active Role Tier!
  // Admin Tier 1 queries all hospital records created in workspace (`where('createdBy', '==', user.uid)`)
  // Medical Staff Tier 2 queries ONLY patients assigned to them (`where('assignedStaffId', '==', user.uid)`)
  useEffect(() => {
    if (!authReady || !user) {
      setPatients([]);
      return;
    }
    setPatientsLoading(true);
    const filterField = isAdminActive ? 'createdBy' : 'assignedStaffId';
    const q = query(collection(db, 'patients'), where(filterField, '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: PatientRecord[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as PatientRecord);
        });
        list.sort((a, b) => a.mrn.localeCompare(b.mrn));
        setPatients(list);
        setPatientsLoading(false);
        if (list.length > 0 && !selectedPatientId) {
          setSelectedPatientId(list[0].patientId);
        } else if (list.length === 0 && !hasAutoSeeded) {
          setHasAutoSeeded(true);
          seedHospitalDatabase(user.uid, user.displayName || 'Dr. Attending Clinician').catch(
            (err) => {
              setBannerMessage({
                type: 'warning',
                text:
                  err instanceof Error
                    ? 'Click "Reset / Seed Demo Records" to initialize your hospital workspace.'
                    : 'Ready to seed hospital records.',
              });
            }
          );
        }
      },
      (error) => {
        setPatientsLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'patients');
      }
    );
    return () => unsub();
  }, [authReady, user, isAdminActive, canUseAdminTier, hasAutoSeeded]);

  // 4. Real-time Clinical Orders Subcollection Listener for Selected Patient
  useEffect(() => {
    if (!authReady || !user || !selectedPatientId) {
      setOrders([]);
      return;
    }
    const filterField = isAdminActive ? 'orderedBy' : 'assignedStaffId';
    const subPath = `patients/${selectedPatientId}/orders`;
    const q = query(
      collection(db, 'patients', selectedPatientId, 'orders'),
      where(filterField, '==', user.uid)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: ClinicalOrder[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as ClinicalOrder);
        });
        setOrders(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, subPath);
      }
    );
    return () => unsub();
  }, [authReady, user, selectedPatientId, isAdminActive]);

  // 5. Real-time Departments, Staff Profiles, and Audit Logs Listeners
  useEffect(() => {
    if (!authReady || !user) {
      setDepartments([]);
      setStaffProfiles([]);
      setAuditLogs([]);
      return;
    }

    const deptQ = query(collection(db, 'departments'), where('ownerId', '==', user.uid));
    const unsubDepts = onSnapshot(
      deptQ,
      (snap) => {
        const list: DepartmentConfig[] = [];
        snap.forEach((d) => list.push(d.data() as DepartmentConfig));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setDepartments(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'departments')
    );

    const staffQ = query(collection(db, 'staff_profiles'), where('ownerId', '==', user.uid));
    const unsubStaff = onSnapshot(
      staffQ,
      (snap) => {
        const list: StaffProfile[] = [];
        snap.forEach((d) => list.push(d.data() as StaffProfile));
        list.sort((a, b) => a.badgeId.localeCompare(b.badgeId));
        setStaffProfiles(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'staff_profiles')
    );

    const auditQ = query(collection(db, 'audit_logs'), where('actorId', '==', user.uid));
    const unsubAudit = onSnapshot(
      auditQ,
      (snap) => {
        const list: AuditLog[] = [];
        snap.forEach((d) => list.push(d.data() as AuditLog));
        list.sort((a, b) => {
          const tA = a.createdAt?.toMillis?.() ?? 0;
          const tB = b.createdAt?.toMillis?.() ?? 0;
          return tB - tA;
        });
        setAuditLogs(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'audit_logs')
    );

    const attFilterField = isAdminActive ? 'ownerId' : 'staffUid';
    const attQ = query(collection(db, 'attendance_logs'), where(attFilterField, '==', user.uid));
    const unsubAttendance = onSnapshot(
      attQ,
      (snap) => {
        const list: AttendanceRecord[] = [];
        snap.forEach((d) => list.push(d.data() as AttendanceRecord));
        list.sort((a, b) => b.shiftDate.localeCompare(a.shiftDate));
        setAttendanceRecords(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'attendance_logs')
    );

    return () => {
      unsubDepts();
      unsubStaff();
      unsubAudit();
      unsubAttendance();
    };
  }, [authReady, user, isAdminActive]);

  // Helper to record an immutable RBAC Audit Log entry
  async function recordAuditEvent(
    action: string,
    targetId: string,
    severity: AuditSeverity = 'Info'
  ) {
    if (!user) return;
    const logId = sanitizeId(`log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const path = `audit_logs/${logId}`;
    try {
      await setDoc(doc(db, 'audit_logs', logId), {
        logId,
        actorId: user.uid,
        actorName: clampString(user.displayName || 'Hospital Clinician', 2, 100),
        actorRole: isAdminActive ? 'admin' : 'physician',
        action: clampString(action, 2, 120),
        targetId: sanitizeId(targetId),
        severity,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  async function handleGoogleSignIn() {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    }
  }

  async function handleSeedDatabase() {
    if (!user) return;
    setSeeding(true);
    try {
      await seedHospitalDatabase(user.uid, user.displayName || 'Dr. Attending Clinician');
      setBannerMessage({
        type: 'success',
        text: 'Hospital database populated: 7 patient charts (4 assigned to you, 3 assigned to other clinicians), 6 wards, 5 staff profiles, and clinical orders.',
      });
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to seed hospital records.',
      });
    } finally {
      setSeeding(false);
    }
  }

  // Filtered Patients (prioritizes Critical triage acuity at the top)
  const filteredPatients = useMemo(() => {
    const acuityRank: Record<TriageStatus, number> = {
      Critical: 0,
      Observation: 1,
      Stable: 2,
      Discharged: 3,
    };
    return patients
      .filter((p) => {
        const matchesWard = wardFilter === 'ALL' || p.department === wardFilter;
        const matchesAcuity = acuityFilter === 'ALL' || p.triageStatus === acuityFilter;
        const q = searchQuery.trim().toLowerCase();
        const matchesQuery =
          !q ||
          p.fullName.toLowerCase().includes(q) ||
          p.mrn.toLowerCase().includes(q) ||
          p.diagnosisSummary.toLowerCase().includes(q) ||
          p.roomNumber.toLowerCase().includes(q) ||
          p.assignedStaffName.toLowerCase().includes(q);
        return matchesWard && matchesAcuity && matchesQuery;
      })
      .sort((a, b) => (acuityRank[a.triageStatus] ?? 9) - (acuityRank[b.triageStatus] ?? 9));
  }, [patients, wardFilter, acuityFilter, searchQuery]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.patientId === selectedPatientId) || patients[0] || null,
    [patients, selectedPatientId]
  );

  // Admit New Patient Handler (Admin Tier 1 Only)
  async function handleAdmitPatient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !isAdminActive) return;
    const formData = new FormData(e.currentTarget);
    const fullName = clampString(String(formData.get('fullName') || ''), 2, 100, 'New Patient');
    const mrnRaw = String(formData.get('mrn') || `MRN-2026-${Math.floor(1000 + Math.random() * 8999)}`);
    const mrn = sanitizeId(mrnRaw, 32);
    const age = Math.min(130, Math.max(0, Number(formData.get('age') || 45)));
    const bloodType = (formData.get('bloodType') as BloodType) || 'O+';
    const department = (formData.get('department') as ClinicalWard) || 'Cardiology';
    const roomNumber = sanitizeId(String(formData.get('roomNumber') || 'CRD-101'), 20);
    const triageStatus = (formData.get('triageStatus') as TriageStatus) || 'Observation';
    const insuranceStatus = (formData.get('insuranceStatus') as InsuranceStatus) || 'Verified';
    const assigneeSelect = String(formData.get('assigneeSelect') || 'self');
    const assignedStaffId = assigneeSelect === 'self' ? user.uid : sanitizeId(assigneeSelect, 128);
    const assignedStaffName =
      assigneeSelect === 'self'
        ? clampString(user.displayName || 'Dr. Attending Clinician', 2, 100)
        : clampString(
            staffProfiles.find((s) => s.staffId === assigneeSelect)?.fullName || 'Dr. Mei Lin, MD',
            2,
            100
          );
    const diagnosisSummary = clampString(
      String(formData.get('diagnosisSummary') || ''),
      2,
      500,
      'Initial clinical admission evaluation in progress.'
    );
    const vitalSigns = clampString(
      String(formData.get('vitalSigns') || ''),
      2,
      200,
      'HR 78 bpm | BP 120/78 mmHg | SpO2 98% | Temp 36.8C'
    );
    const clinicalNotes = clampString(
      String(formData.get('clinicalNotes') || ''),
      0,
      1000,
      'Admitted via Hospital Administration.'
    );

    const patientId = sanitizeId(`pat_${Date.now()}`);
    const path = `patients/${patientId}`;

    try {
      await setDoc(doc(db, 'patients', patientId), {
        patientId,
        mrn,
        fullName,
        age,
        bloodType,
        department,
        roomNumber,
        triageStatus,
        diagnosisSummary,
        vitalSigns,
        clinicalNotes,
        insuranceStatus,
        assignedStaffId,
        assignedStaffName,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAuditEvent(`Admin admitted patient ${mrn} (${fullName}) to ${department}`, patientId, 'Info');
      setShowAdmitModal(false);
      setSelectedPatientId(patientId);
      setBannerMessage({
        type: 'success',
        text: `Admitted patient ${fullName} (${mrn}) to ${department} room ${roomNumber}.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  // Save Patient Update — Strictly Partitioned Between Tier 1 (Admin) and Tier 2 (Medical Staff)
  // Sync clinicalNotesDraft & reset newObservationDraft whenever editingPatient opens
  useEffect(() => {
    if (editingPatient) {
      setClinicalNotesDraft(editingPatient.clinicalNotes || '');
      setNewObservationDraft('');
    } else {
      setClinicalNotesDraft('');
      setNewObservationDraft('');
    }
  }, [editingPatient]);

  function formatChronologicalObservation(existingNotes: string, rawObservation: string): string {
    const trimmedObs = rawObservation.trim().replace(/\s+/g, ' ');
    if (!trimmedObs) return existingNotes;
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const author = clampString(
      user?.displayName || user?.email?.split('@')[0] || 'Attending Clinician',
      2,
      40
    );
    const entry = `[${stamp} · ${author}] ${trimmedObs}`;
    const base = existingNotes.trim();
    const combined = base ? `${base}\n${entry}` : entry;
    return combined.length > 1000 ? combined.slice(combined.length - 1000) : combined;
  }

  function handleAppendObservationInline() {
    if (!newObservationDraft.trim()) return;
    setClinicalNotesDraft((prev) => formatChronologicalObservation(prev, newObservationDraft));
    setNewObservationDraft('');
  }

  async function handleSavePatientUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !editingPatient) return;

    const formData = new FormData(e.currentTarget);
    const triageStatus = (formData.get('triageStatus') as TriageStatus) || editingPatient.triageStatus;
    const diagnosisSummary = clampString(
      String(formData.get('diagnosisSummary') || editingPatient.diagnosisSummary),
      2,
      500
    );
    const vitalSigns = clampString(
      String(formData.get('vitalSigns') || editingPatient.vitalSigns),
      2,
      200
    );
    // If staff typed a Clinical Observation without clicking "+ Append" first, auto-append it chronologically on save
    const mergedNotes = newObservationDraft.trim()
      ? formatChronologicalObservation(clinicalNotesDraft, newObservationDraft)
      : clinicalNotesDraft;
    const clinicalNotes = clampString(mergedNotes, 0, 1000, '');

    const path = `patients/${editingPatient.patientId}`;

    try {
      if (isAdminActive) {
        // Tier 1 Admin Action: Can update administrative, billing, room assignment, and clinical fields
        const fullName = clampString(
          String(formData.get('fullName') || editingPatient.fullName),
          2,
          100
        );
        const age = Math.min(130, Math.max(0, Number(formData.get('age') ?? editingPatient.age)));
        const bloodType = (formData.get('bloodType') as BloodType) || editingPatient.bloodType;
        const department = (formData.get('department') as ClinicalWard) || editingPatient.department;
        const roomNumber = sanitizeId(
          String(formData.get('roomNumber') || editingPatient.roomNumber),
          20
        );
        const insuranceStatus =
          (formData.get('insuranceStatus') as InsuranceStatus) || editingPatient.insuranceStatus;
        const assigneeChoice = String(formData.get('assignedStaffId') || editingPatient.assignedStaffId);
        const assignedStaffId = sanitizeId(assigneeChoice, 128);
        const assignedStaffName =
          assignedStaffId === user.uid
            ? clampString(user.displayName || 'Dr. Attending Clinician', 2, 100)
            : clampString(
                staffProfiles.find((s) => s.staffId === assignedStaffId)?.fullName ||
                  editingPatient.assignedStaffName,
                2,
                100
              );

        await updateDoc(doc(db, 'patients', editingPatient.patientId), {
          fullName,
          age,
          bloodType,
          department,
          roomNumber,
          triageStatus,
          diagnosisSummary,
          vitalSigns,
          clinicalNotes,
          insuranceStatus,
          assignedStaffId,
          assignedStaffName,
          updatedAt: serverTimestamp(),
        });

        await recordAuditEvent(
          `Admin updated full chart & billing/assignment for ${editingPatient.mrn}`,
          editingPatient.patientId,
          'Elevated'
        );
      } else {
        // Tier 2 Medical Staff Action: Strictly constrained to clinical fields via affectedKeys().hasOnly()
        await updateDoc(doc(db, 'patients', editingPatient.patientId), {
          triageStatus,
          diagnosisSummary,
          vitalSigns,
          clinicalNotes,
          updatedAt: serverTimestamp(),
        });

        await recordAuditEvent(
          `Medical Staff updated vitals & clinical progress for ${editingPatient.mrn}`,
          editingPatient.patientId,
          'Info'
        );
      }

      setEditingPatient(null);
      setBannerMessage({
        type: 'success',
        text: isAdminActive
          ? `Updated administrative & clinical chart for ${editingPatient.mrn} (Tier 1 Admin).`
          : `Updated clinical vitals & notes for ${editingPatient.mrn} (Tier 2 Medical Staff).`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  // Delete Patient Record (Admin Tier 1 Only)
  async function handleDeletePatient(patient: PatientRecord) {
    if (!user || !isAdminActive) return;
    const path = `patients/${patient.patientId}`;
    try {
      await deleteDoc(doc(db, 'patients', patient.patientId));
      await recordAuditEvent(
        `Admin archived/deleted patient chart ${patient.mrn}`,
        patient.patientId,
        'Elevated'
      );
      if (selectedPatientId === patient.patientId) {
        setSelectedPatientId(null);
      }
      setEditingPatient(null);
      setBannerMessage({
        type: 'warning',
        text: `Deleted patient record ${patient.mrn} (${patient.fullName}).`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  // Create Clinical Order in Subcollection (/patients/{patientId}/orders/{orderId})
  async function handleCreateClinicalOrder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !selectedPatient) return;

    const formData = new FormData(e.currentTarget);
    const orderType = (formData.get('orderType') as OrderType) || 'Medication';
    const priority = (formData.get('priority') as OrderPriority) || 'Routine';
    const description = clampString(
      String(formData.get('description') || ''),
      2,
      300,
      'Standard clinical order'
    );

    const orderId = sanitizeId(`ord_${Date.now()}`);
    const path = `patients/${selectedPatient.patientId}/orders/${orderId}`;

    try {
      await setDoc(doc(db, 'patients', selectedPatient.patientId, 'orders', orderId), {
        orderId,
        patientId: selectedPatient.patientId,
        orderType,
        description,
        priority,
        orderStatus: 'Pending',
        orderedBy: user.uid,
        orderedByName: clampString(user.displayName || 'Dr. Attending Clinician', 2, 100),
        assignedStaffId: selectedPatient.assignedStaffId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAuditEvent(
        `Created ${priority} ${orderType} order on ${selectedPatient.mrn}`,
        orderId,
        'Info'
      );
      setShowNewOrderModal(false);
      setBannerMessage({
        type: 'success',
        text: `Added ${priority} ${orderType} order to ${selectedPatient.fullName}.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  // Progress Order Status (Tier 1 vs Tier 2 rules)
  async function handleUpdateOrderStatus(order: ClinicalOrder, nextStatus: OrderStatus) {
    if (!user) return;
    const path = `patients/${order.patientId}/orders/${order.orderId}`;
    try {
      await updateDoc(doc(db, 'patients', order.patientId, 'orders', order.orderId), {
        orderStatus: nextStatus,
        description: order.description,
        updatedAt: serverTimestamp(),
      });
      await recordAuditEvent(
        `Updated order ${order.orderId} status to ${nextStatus}`,
        order.orderId,
        'Info'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  // Delete Clinical Order (Admin Only)
  async function handleDeleteOrder(order: ClinicalOrder) {
    if (!user || !isAdminActive) return;
    const path = `patients/${order.patientId}/orders/${order.orderId}`;
    try {
      await deleteDoc(doc(db, 'patients', order.patientId, 'orders', order.orderId));
      await recordAuditEvent(`Admin deleted clinical order ${order.orderId}`, order.orderId, 'Elevated');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  // Update Department Capacity & Diversion (Admin Tier 1 Only)
  async function handleSaveDepartment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !isAdminActive || !editingDept) return;
    const formData = new FormData(e.currentTarget);
    const headPhysician = clampString(
      String(formData.get('headPhysician') || editingDept.headPhysician),
      2,
      100
    );
    const totalBeds = Math.min(500, Math.max(1, Number(formData.get('totalBeds') || editingDept.totalBeds)));
    const occupiedBeds = Math.min(
      totalBeds,
      Math.max(0, Number(formData.get('occupiedBeds') ?? editingDept.occupiedBeds))
    );
    const diversionStatus =
      (formData.get('diversionStatus') as DiversionStatus) || editingDept.diversionStatus;
    const budgetCode = sanitizeId(String(formData.get('budgetCode') || editingDept.budgetCode), 32);

    const path = `departments/${editingDept.deptId}`;
    try {
      await updateDoc(doc(db, 'departments', editingDept.deptId), {
        headPhysician,
        totalBeds,
        occupiedBeds,
        diversionStatus,
        budgetCode,
        updatedAt: serverTimestamp(),
      });
      await recordAuditEvent(
        `Admin updated ${editingDept.name} ward capacity (${occupiedBeds}/${totalBeds}) & status (${diversionStatus})`,
        editingDept.deptId,
        'Elevated'
      );
      setEditingDept(null);
      setBannerMessage({
        type: 'success',
        text: `Updated ${editingDept.name} department configuration.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  // Create Staff Profile (Admin Tier 1)
  async function handleCreateStaff(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !isAdminActive) return;
    const formData = new FormData(e.currentTarget);
    const fullName = clampString(String(formData.get('fullName') || ''), 2, 100, 'Clinician');
    const role = (formData.get('role') as StaffRole) || 'physician';
    const department = (formData.get('department') as DepartmentName) || 'Cardiology';
    const badgeId = sanitizeId(String(formData.get('badgeId') || `BDG-${Math.floor(100 + Math.random() * 899)}`), 32);
    const shift = (formData.get('shift') as ShiftType) || 'Day (07:00-19:00)';
    const status = (formData.get('status') as StaffDutyStatus) || 'On Duty';
    const staffId = sanitizeId(`staff_${Date.now()}`);
    const path = `staff_profiles/${staffId}`;

    try {
      await setDoc(doc(db, 'staff_profiles', staffId), {
        staffId,
        ownerId: user.uid,
        fullName,
        role,
        department,
        badgeId,
        shift,
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAuditEvent(`Admin onboarded ${fullName} as ${role} in ${department}`, staffId, 'Elevated');
      setShowNewStaffModal(false);
      setBannerMessage({
        type: 'success',
        text: `Onboarded ${fullName} (${badgeId}) with role '${role}'.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  // Update Staff Role (Admin Tier 1) vs Shift/Status (Medical Staff Tier 2)
  async function handleStaffQuickUpdate(
    staff: StaffProfile,
    updates: { role?: StaffRole; shift?: ShiftType; status?: StaffDutyStatus }
  ) {
    if (!user) return;
    const path = `staff_profiles/${staff.staffId}`;
    try {
      if (isAdminActive) {
        await updateDoc(doc(db, 'staff_profiles', staff.staffId), {
          fullName: staff.fullName,
          role: updates.role ?? staff.role,
          department: staff.department,
          badgeId: staff.badgeId,
          shift: updates.shift ?? staff.shift,
          status: updates.status ?? staff.status,
          updatedAt: serverTimestamp(),
        });
        await recordAuditEvent(
          `Admin updated staff profile ${staff.badgeId} (role: ${updates.role ?? staff.role}, status: ${updates.status ?? staff.status})`,
          staff.staffId,
          'Elevated'
        );
      } else {
        // Tier 2 Medical Staff can ONLY update shift & status
        await updateDoc(doc(db, 'staff_profiles', staff.staffId), {
          shift: updates.shift ?? staff.shift,
          status: updates.status ?? staff.status,
          updatedAt: serverTimestamp(),
        });
        await recordAuditEvent(
          `Medical Staff updated duty status for ${staff.badgeId} to ${updates.status ?? staff.status}`,
          staff.staffId,
          'Info'
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  // Simulate an unauthorized Tier 2 action attempt and log it to Audit Trail
  async function handleSimulateBlockedAttempt(actionDescription: string, targetId: string) {
    await recordAuditEvent(
      `RBAC Policy Blocked Tier 2 Medical Staff: ${actionDescription}`,
      targetId,
      'Restricted-Blocked'
    );
    setBannerMessage({
      type: 'warning',
      text: `RBAC Policy Enforcement: "${actionDescription}" is restricted to Hospital Administrators (Tier 1). Logged to Security Audit Trail.`,
    });
  }

  // Create Shift Check-In Attendance Record
  async function handleCheckInShift(data: {
    shiftDate: string;
    shiftType: ShiftType;
    department: DepartmentName;
    attendanceStatus: AttendanceStatus;
    clockInNote: string;
    hoursLogged: number;
  }) {
    if (!user) return;
    const attendanceId = sanitizeId(`att_${Date.now()}`);
    const path = `attendance_logs/${attendanceId}`;
    const safeDate = data.shiftDate.replace(/[^0-9\-]/g, '').slice(0, 20) || '2026-10-05';
    const safeHours = Math.min(24, Math.max(0, Number(data.hoursLogged) || 8));

    try {
      await setDoc(doc(db, 'attendance_logs', attendanceId), {
        attendanceId,
        staffUid: user.uid,
        ownerId: user.uid,
        staffName: clampString(user.displayName || 'Dr. Attending Clinician', 2, 100),
        badgeId: 'BDG-CLN-001',
        department: data.department,
        shiftDate: safeDate.length >= 8 ? safeDate : '2026-10-05',
        shiftType: data.shiftType,
        attendanceStatus: data.attendanceStatus,
        clockInNote: clampString(data.clockInNote, 2, 160, 'Checked in for clinical duty'),
        hoursLogged: safeHours,
        verifiedByAdmin: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAuditEvent(
        `Logged shift attendance (${data.attendanceStatus}) for ${safeDate}`,
        attendanceId,
        'Info'
      );
      setBannerMessage({
        type: 'success',
        text: `Shift attendance recorded for ${safeDate} (${data.attendanceStatus}).`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  // Update Shift Attendance Record (Admin Tier 1 vs Medical Staff Tier 2)
  async function handleUpdateAttendance(
    record: AttendanceRecord,
    updates: {
      attendanceStatus?: AttendanceStatus;
      clockInNote?: string;
      hoursLogged?: number;
      verifiedByAdmin?: boolean;
    }
  ) {
    if (!user) return;
    const path = `attendance_logs/${record.attendanceId}`;
    try {
      if (isAdminActive) {
        await updateDoc(doc(db, 'attendance_logs', record.attendanceId), {
          shiftType: record.shiftType,
          attendanceStatus: updates.attendanceStatus ?? record.attendanceStatus,
          clockInNote: clampString(updates.clockInNote ?? record.clockInNote, 2, 160),
          hoursLogged: Math.min(24, Math.max(0, updates.hoursLogged ?? record.hoursLogged)),
          verifiedByAdmin: updates.verifiedByAdmin ?? record.verifiedByAdmin,
          updatedAt: serverTimestamp(),
        });
        await recordAuditEvent(
          `Admin updated/verified attendance log ${record.attendanceId} (${record.staffName})`,
          record.attendanceId,
          'Elevated'
        );
      } else {
        // Tier 2 Medical Staff: can only update attendanceStatus, clockInNote, hoursLogged, updatedAt before Admin verification
        await updateDoc(doc(db, 'attendance_logs', record.attendanceId), {
          attendanceStatus: updates.attendanceStatus ?? record.attendanceStatus,
          clockInNote: clampString(updates.clockInNote ?? record.clockInNote, 2, 160),
          hoursLogged: Math.min(24, Math.max(0, updates.hoursLogged ?? record.hoursLogged)),
          updatedAt: serverTimestamp(),
        });
        await recordAuditEvent(
          `Medical Staff updated shift status to ${updates.attendanceStatus ?? record.attendanceStatus}`,
          record.attendanceId,
          'Info'
        );
      }
      setBannerMessage({
        type: 'success',
        text: `Updated attendance record for ${record.staffName} (${record.shiftDate}).`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  // Unauthenticated Landing Screen
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600 font-medium">
          Initializing Aegis Clinical RBAC Engine...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        {/* Top Bar Contract */}
        <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <a href="#top" className="text-lg font-bold tracking-tight text-slate-900">
            Aegis Clinical
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#architecture" className="hover:text-slate-900 transition-colors">
              Tiered RBAC Architecture
            </a>
            <a href="#permissions" className="hover:text-slate-900 transition-colors">
              Role Comparison Matrix
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGoogleSignIn}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              Authenticate Clinical Session
            </button>
          </div>
        </header>

        <main className="max-w-6xl w-full mx-auto px-6 py-12 flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 space-y-6">
              <div className="text-xs font-medium text-slate-500">
                <span>Hospital Database Management</span>
                <span className="mx-2" aria-hidden="true">·</span>
                <span>Zero-Trust Attribute & Role Access Control</span>
              </div>
              <h1
                className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight"
                style={{ textWrap: 'balance' }}
              >
                Strict Separation of Hospital Administrator and Medical Staff Database Access
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
                Aegis Clinical enforces dual-tier security policies across patient charts, clinical
                orders, ward bed capacities, and staff credentials. Sign in to inspect and test
                both Tier 1 Administrator privileges and Tier 2 Medical Staff clinical boundaries
                in real time.
              </p>

              {authError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{authError}</span>
                </div>
              )}

              <div className="pt-2 flex flex-wrap items-center gap-4">
                <button
                  onClick={handleGoogleSignIn}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Sign In with Google to Launch Console
                </button>
                <span className="text-xs text-slate-500">
                  Bootstrapped Admin: <span className="font-mono-tabular">{BOOTSTRAPPED_ADMIN_EMAIL}</span>
                </span>
              </div>
            </div>

            <div
              id="architecture"
              className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
            >
              <h2 className="text-base font-semibold text-slate-900">
                01. Enforced Permission Tiers
              </h2>
              <div className="space-y-4 divide-y divide-slate-100">
                <div className="pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
                    <span>Tier 1 · Hospital Administrator</span>
                    <span className="text-blue-700 font-mono-tabular">Full Governance</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Views all hospital patient admissions across every department. Authorized to
                    admit and archive patients, reassign attending clinicians, modify insurance
                    clearance and room transfers, configure ward bed budgets, and manage staff
                    roles.
                  </p>
                </div>

                <div className="pt-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
                    <span>Tier 2 · Regular Medical Staff (Physicians & Nurses)</span>
                    <span className="text-emerald-700 font-mono-tabular">Scoped Clinical Care</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Queries are restricted strictly to patients assigned to the clinician
                    (<span className="font-mono-tabular">assignedStaffId == auth.uid</span>).
                    Updates are locked to clinical fields (<span className="font-mono-tabular">triageStatus</span>,{' '}
                    <span className="font-mono-tabular">vitalSigns</span>,{' '}
                    <span className="font-mono-tabular">diagnosisSummary</span>,{' '}
                    <span className="font-mono-tabular">clinicalNotes</span>) and blocked once a
                    patient is Discharged.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>

        <footer className="px-6 py-4 border-t border-slate-200 bg-white text-xs text-slate-500 flex items-center justify-between">
          <span>Aegis Clinical Database Governance</span>
          <span>Firestore Security Rules v2 Enforced</span>
        </footer>
      </div>
    );
  }

  // Compute summary metrics with tabular precision
  const criticalPatients = patients.filter((p) => p.triageStatus === 'Critical');
  const criticalCount = criticalPatients.length;
  const dischargedCount = patients.filter((p) => p.triageStatus === 'Discharged').length;
  const totalOccupiedBeds = departments.reduce((acc, d) => acc + d.occupiedBeds, 0);
  const totalCapacityBeds = departments.reduce((acc, d) => acc + d.totalBeds, 0);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar Contract: 3 Zones (Brand Wordmark — 5 Nav Links — Role Switcher & Session Action) */}
      <header className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-20">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#workspace"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('patients');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Aegis Clinical
        </a>

        {/* Zone 2: 6 Single-line navigation links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            onClick={() => setActiveTab('patients')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer border-b-2 ${
              activeTab === 'patients'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Patient Registry
          </button>
          <button
            onClick={() => setActiveTab('attendance')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer border-b-2 ${
              activeTab === 'attendance'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Attendance & My Patients
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer border-b-2 ${
              activeTab === 'orders'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Clinical Orders
          </button>
          <button
            onClick={() => setActiveTab('departments')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer border-b-2 ${
              activeTab === 'departments'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Ward Capacity
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer border-b-2 ${
              activeTab === 'staff'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Staff & Roles
          </button>
          <button
            onClick={() => setActiveTab('rbac')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer border-b-2 ${
              activeTab === 'rbac'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            RBAC Policy & Audit
          </button>
        </nav>

        {/* Zone 3: Primary Role Mode Switcher + Sign Out */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
            role="group"
            aria-label="Active Access Role Switcher"
          >
            <button
              onClick={() => {
                if (!canUseAdminTier) {
                  setBannerMessage({
                    type: 'warning',
                    text: 'Your account is not listed in /admins. Operating in Tier 2 Medical Staff mode.',
                  });
                  return;
                }
                setAccessMode('admin');
                setBannerMessage({
                  type: 'success',
                  text: 'Switched to Hospital Administrator (Tier 1): Full hospital scope, patient admissions, billing, and ward configuration enabled.',
                });
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                isAdminActive
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Admin (Tier 1)
            </button>
            <button
              onClick={() => {
                setAccessMode('medical_staff');
                setBannerMessage({
                  type: 'warning',
                  text: 'Switched to Regular Medical Staff (Tier 2): Scoped to assigned patients only; billing, admissions, deletions, and discharged charts are locked.',
                });
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                !isAdminActive
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Medical Staff (Tier 2)
            </button>
          </div>

          <button
            onClick={() => signOut(auth)}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="flex lg:hidden items-center gap-2 overflow-x-auto px-6 py-2 bg-white border-b border-slate-200">
        {(
          [
            ['patients', 'Patient Registry'],
            ['attendance', 'Attendance & My Patients'],
            ['orders', 'Clinical Orders'],
            ['departments', 'Ward Capacity'],
            ['staff', 'Staff & Roles'],
            ['rbac', 'RBAC & Audit'],
          ] as [ActiveTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
              activeTab === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Active Role Context & Permission Boundary Strip */}
      <div
        className={`px-6 py-3 border-b text-xs flex flex-wrap items-center justify-between gap-4 ${
          isAdminActive
            ? 'bg-slate-900 text-slate-100 border-slate-800'
            : 'bg-emerald-950 text-emerald-50 border-emerald-900'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {isAdminActive ? (
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
          ) : (
            <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="font-semibold">
            {isAdminActive
              ? 'Active Session: Hospital Administrator (Tier 1 Governance)'
              : 'Active Session: Regular Medical Staff — Attending Clinician (Tier 2 Care)'}
          </span>
          <span className="opacity-50" aria-hidden="true">·</span>
          <span className="opacity-90">
            {isAdminActive
              ? 'Query Scope: All Hospital Records · Write Access: Admissions, Reassignments, Billing, Ward Capacity & Role Grants'
              : 'Query Scope: Assigned Patients Only (assignedStaffId == uid) · Write Access: Vitals, Triage & Clinical Notes (Locked on Discharged)'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {patients.length === 0 && (
            <button
              onClick={handleSeedDatabase}
              disabled={seeding}
              className="px-3 py-1 text-xs font-semibold bg-blue-500 text-white rounded-md hover:bg-blue-400 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              {seeding ? 'Seeding Hospital DB...' : 'Seed Sample Hospital Database'}
            </button>
          )}
          <span className="font-mono-tabular opacity-80">
            User: {user.displayName || user.email}
          </span>
        </div>
      </div>

      {/* Feedback Banner */}
      {bannerMessage && (
        <div
          className={`px-6 py-2.5 border-b text-xs flex items-center justify-between gap-4 ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : bannerMessage.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{bannerMessage.text}</span>
          </div>
          <button
            onClick={() => setBannerMessage(null)}
            className="text-slate-500 hover:text-slate-800 p-1 cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Workspace Container */}
      <main className="max-w-[1440px] w-full mx-auto px-6 py-6 flex-1 space-y-6">
        {/* Top Quantitative Telemetry Summary Strip (Single-Elevation, Tabular Numerals) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-5">
            <div className="text-xs text-slate-500">
              {isAdminActive ? 'Total Hospital Census (Admin Scope)' : 'My Assigned Patients (Staff Scope)'}
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900 font-mono-tabular">
                {patients.length}
              </span>
              <span className="text-xs text-slate-500 font-mono-tabular">
                {isAdminActive ? 'All Wards' : 'Direct Care Only'}
              </span>
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs text-slate-500">Critical Acuity Alerts</div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-red-600 font-mono-tabular">
                {criticalCount}
              </span>
              <span className="text-xs text-slate-500 font-mono-tabular">
                {dischargedCount} Discharged (Locked)
              </span>
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs text-slate-500">Licensed Bed Occupancy</div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900 font-mono-tabular">
                {totalOccupiedBeds} / {totalCapacityBeds || 190}
              </span>
              <span className="text-xs text-slate-500 font-mono-tabular">
                {totalCapacityBeds > 0
                  ? `${Math.round((totalOccupiedBeds / totalCapacityBeds) * 100)}% Utilized`
                  : 'Seed Wards'}
              </span>
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs text-slate-500">
              {isAdminActive ? 'Staff Shift Attendance Logs' : 'My Shift Attendance & Hours'}
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-base font-semibold text-slate-900 font-mono-tabular">
                {attendanceRecords.filter((a) => a.staffUid === user.uid)[0]?.attendanceStatus ||
                  (attendanceRecords.length > 0 ? `${attendanceRecords.length} Shifts` : 'Not Checked In')}
              </span>
              <button
                onClick={() => setActiveTab('attendance')}
                className="text-xs text-blue-600 hover:underline font-medium cursor-pointer"
              >
                View Attendance →
              </button>
            </div>
          </div>
        </section>

        {/* ===================================================================
            TAB: ATTENDANCE & ASSIGNED PATIENTS UNDER CARE
           =================================================================== */}
        {activeTab === 'attendance' && (
          <AttendanceAndCaseloadView
            userUid={user.uid}
            userDisplayName={user.displayName || user.email || 'Attending Clinician'}
            isAdminActive={isAdminActive}
            attendanceRecords={attendanceRecords}
            patients={patients}
            staffProfiles={staffProfiles}
            onCheckInShift={handleCheckInShift}
            onUpdateAttendance={handleUpdateAttendance}
            onSelectPatientForCare={(pat) => setEditingPatient(pat)}
            onSelectPatientOrders={(patId) => {
              setSelectedPatientId(patId);
              setActiveTab('orders');
            }}
            onSimulateBlocked={handleSimulateBlockedAttempt}
          />
        )}

        {/* ===================================================================
            TAB 1: PATIENT REGISTRY (Demonstrates Admin vs Medical Staff Access)
           =================================================================== */}
        {activeTab === 'patients' && (
          <section className="space-y-4">
            {/* Urgent Banner Alerts for 'Critical' Triage Patients */}
            {criticalPatients.length > 0 && (
              <div
                role="region"
                aria-label="Urgent Critical Triage Patient Alerts"
                className="bg-red-50/90 border border-red-200 border-l-4 border-l-red-600 rounded-xl overflow-hidden"
              >
                <div className="px-4 py-3 bg-red-100/70 border-b border-red-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-red-700 shrink-0" />
                    <span className="text-xs font-bold text-red-950 tracking-tight">
                      URGENT CLINICAL TRIAGE ALERT · {criticalPatients.length}{' '}
                      {criticalPatients.length === 1 ? 'PATIENT' : 'PATIENTS'} IN CRITICAL ACUITY
                    </span>
                    <span className="text-xs text-red-800 hidden sm:inline">
                      · Immediate hemodynamic monitoring and attending verification required
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setAcuityFilter(acuityFilter === 'Critical' ? 'ALL' : 'Critical')
                      }
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                        acuityFilter === 'Critical'
                          ? 'bg-red-700 text-white border-red-700 hover:bg-red-800'
                          : 'bg-white text-red-800 border-red-300 hover:bg-red-50'
                      }`}
                    >
                      {acuityFilter === 'Critical'
                        ? 'Showing Critical Only (Reset Filter)'
                        : 'Isolate Critical in Table'}
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-red-200/70">
                  {criticalPatients.map((critPatient) => (
                    <div
                      key={critPatient.patientId}
                      className="px-4 py-3 flex flex-wrap items-center justify-between gap-4 hover:bg-red-100/40 transition-colors"
                    >
                      <div className="space-y-1 min-w-[240px] flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono-tabular font-bold text-red-900">
                            {critPatient.mrn}
                          </span>
                          <span className="text-red-400" aria-hidden="true">·</span>
                          <span className="font-bold text-slate-900">
                            {critPatient.fullName}
                          </span>
                          <span className="text-slate-500 font-mono-tabular">
                            ({critPatient.age}y · ABO {critPatient.bloodType})
                          </span>
                          <span className="text-red-400" aria-hidden="true">·</span>
                          <span className="font-semibold text-red-800 font-mono-tabular">
                            {critPatient.department} · Room {critPatient.roomNumber}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                          <span className="font-mono-tabular font-medium text-red-950 bg-white/80 px-2 py-0.5 rounded border border-red-200">
                            Vitals: {critPatient.vitalSigns}
                          </span>
                          <span className="text-slate-400" aria-hidden="true">·</span>
                          <span className="font-medium text-slate-800">
                            Dx: {critPatient.diagnosisSummary}
                          </span>
                          <span className="text-slate-400" aria-hidden="true">·</span>
                          <span className="text-slate-600">
                            Attending: <strong className="text-slate-800">{critPatient.assignedStaffName}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setSelectedPatientId(critPatient.patientId);
                            setActiveTab('orders');
                          }}
                          className="px-2.5 py-1.5 text-xs font-medium text-red-900 bg-white border border-red-300 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          STAT Orders
                        </button>
                        <button
                          onClick={() => setEditingPatient(critPatient)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors cursor-pointer"
                        >
                          Update Critical Care
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filter & Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative min-w-[240px] flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter by MRN, patient name, room, diagnosis..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>

                {/* Interactive Ward Filter Segmented Control */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                  {(['ALL', ...CLINICAL_WARDS] as const).map((ward) => (
                    <button
                      key={ward}
                      onClick={() => setWardFilter(ward)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        wardFilter === ward
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {ward === 'ALL' ? 'All Wards' : ward}
                    </button>
                  ))}
                </div>

                {/* Acuity Filter */}
                <select
                  value={acuityFilter}
                  onChange={(e) => setAcuityFilter(e.target.value)}
                  aria-label="Filter by Acuity Status"
                  className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-900"
                >
                  <option value="ALL">All Acuity States</option>
                  {TRIAGE_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleSeedDatabase}
                  disabled={seeding}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  {seeding ? 'Syncing...' : 'Reset / Seed Demo Records'}
                </button>

                {isAdminActive ? (
                  <button
                    onClick={() => setShowAdmitModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Admit New Patient
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      handleSimulateBlockedAttempt(
                        'Admit new patient record (POST /patients)',
                        'patients_collection'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                    title="Admissions require Tier 1 Administrator role"
                  >
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    Admit Patient (Admin Only)
                  </button>
                )}
              </div>
            </div>

            {/* Patient Data Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {patientsLoading ? (
                <div className="p-8 space-y-3">
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="h-10 bg-slate-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <div className="text-sm font-semibold text-slate-900">
                    No Patient Charts Found in Current Scope
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {patients.length === 0
                      ? 'Initialize the hospital database with sample admissions, clinical orders, departments, and staff roles to test Tier 1 Admin vs Tier 2 Medical Staff access.'
                      : 'No patient records match your active search or ward filter criteria.'}
                  </p>
                  {patients.length === 0 && (
                    <button
                      onClick={handleSeedDatabase}
                      disabled={seeding}
                      className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                    >
                      {seeding ? 'Seeding Database...' : 'Seed Hospital Records Now'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-4">MRN & Patient</th>
                        <th className="py-3 px-4">Ward · Room · Blood</th>
                        <th className="py-3 px-4">Acuity Status</th>
                        <th className="py-3 px-4">Vitals Telemetry & Diagnosis</th>
                        <th className="py-3 px-4">Attending Clinician</th>
                        <th className="py-3 px-4">Billing Clearance</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {filteredPatients.map((patient) => {
                        const isCritical = patient.triageStatus === 'Critical';
                        const isDischarged = patient.triageStatus === 'Discharged';
                        const isLockedForStaff = !isAdminActive && isDischarged;
                        return (
                          <tr
                            key={patient.patientId}
                            className={`transition-colors ${
                              isCritical
                                ? 'bg-red-50/40 hover:bg-red-50/80'
                                : 'hover:bg-slate-50/90'
                            }`}
                          >
                            <td
                              className={`py-3 px-4 align-top ${
                                isCritical ? 'border-l-4 border-l-red-600' : ''
                              }`}
                            >
                              <div className="font-mono-tabular text-[11px] text-slate-500">
                                {patient.mrn}
                              </div>
                              <div className="font-semibold text-slate-900 mt-0.5">
                                {patient.fullName}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono-tabular">
                                Age {patient.age} yrs
                              </div>
                            </td>

                            <td className="py-3 px-4 align-top">
                              <div className="text-slate-900 font-medium">
                                {patient.department}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                                <span>Room {patient.roomNumber}</span>
                                <span className="mx-1.5" aria-hidden="true">·</span>
                                <span>ABO {patient.bloodType}</span>
                              </div>
                            </td>

                            <td className="py-3 px-4 align-top">
                              <div
                                className={`font-semibold ${
                                  patient.triageStatus === 'Critical'
                                    ? 'text-red-600'
                                    : patient.triageStatus === 'Observation'
                                    ? 'text-amber-600'
                                    : patient.triageStatus === 'Stable'
                                    ? 'text-emerald-700'
                                    : 'text-slate-500'
                                }`}
                              >
                                {patient.triageStatus}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {isDischarged ? 'Terminal State' : 'Active Admission'}
                              </div>
                            </td>

                            <td className="py-3 px-4 align-top max-w-xs">
                              <div className="font-mono-tabular text-[11px] text-slate-800 truncate">
                                {patient.vitalSigns}
                              </div>
                              <div className="text-slate-600 mt-0.5 line-clamp-2">
                                {patient.diagnosisSummary}
                              </div>
                            </td>

                            <td className="py-3 px-4 align-top">
                              <div className="text-slate-900 font-medium">
                                {patient.assignedStaffName}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {patient.assignedStaffId === user.uid
                                  ? 'Assigned to You'
                                  : 'External Clinician'}
                              </div>
                            </td>

                            <td className="py-3 px-4 align-top">
                              <div className="text-slate-800 font-medium">
                                {patient.insuranceStatus}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {isAdminActive ? 'Editable (Tier 1)' : 'Read-Only (Tier 2)'}
                              </div>
                            </td>

                            <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setSelectedPatientId(patient.patientId);
                                    setActiveTab('orders');
                                  }}
                                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                                >
                                  Orders
                                </button>
                                <button
                                  onClick={() => setEditingPatient(patient)}
                                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                                    isLockedForStaff
                                      ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                      : 'bg-slate-900 text-white hover:bg-slate-800'
                                  }`}
                                >
                                  {isAdminActive
                                    ? 'Admin Edit'
                                    : isLockedForStaff
                                    ? 'View (Locked)'
                                    : 'Update Care'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ===================================================================
            TAB 2: CLINICAL ORDERS SUBCOLLECTION (/patients/{patientId}/orders)
           =================================================================== */}
        {activeTab === 'orders' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Sidebar: Accessible Patients */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Select Patient Chart
                </h2>
                <span className="text-xs text-slate-500 font-mono-tabular">
                  {patients.length} Charts
                </span>
              </div>
              <div className="divide-y divide-slate-200 max-h-[540px] overflow-y-auto">
                {patients.map((p) => (
                  <button
                    key={p.patientId}
                    onClick={() => setSelectedPatientId(p.patientId)}
                    className={`w-full text-left p-4 transition-colors cursor-pointer ${
                      selectedPatient?.patientId === p.patientId
                        ? 'bg-slate-900 text-white'
                        : 'hover:bg-slate-50 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono-tabular opacity-75">{p.mrn}</span>
                      <span className="font-medium">{p.triageStatus}</span>
                    </div>
                    <div className="font-semibold text-sm mt-1">{p.fullName}</div>
                    <div className="text-xs opacity-75 mt-0.5">
                      {p.department} · Room {p.roomNumber}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Area: Subcollection Orders for Selected Patient */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
              {selectedPatient ? (
                <>
                  <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-slate-500 font-mono-tabular">
                        <span>{selectedPatient.mrn}</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>{selectedPatient.department}</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>Acuity: {selectedPatient.triageStatus}</span>
                      </div>
                      <h2 className="text-base font-bold text-slate-900 mt-1">
                        Clinical Orders for {selectedPatient.fullName}
                      </h2>
                    </div>

                    {selectedPatient.triageStatus === 'Discharged' ? (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Patient Discharged — Master Gate Locks New Orders</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowNewOrderModal(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        New Clinical Order
                      </button>
                    )}
                  </div>

                  {orders.length === 0 ? (
                    <div className="p-10 text-center space-y-2">
                      <div className="text-sm font-semibold text-slate-900">
                        No Active Orders for {selectedPatient.fullName}
                      </div>
                      <p className="text-xs text-slate-500">
                        Orders are stored in the{' '}
                        <span className="font-mono-tabular">
                          /patients/{selectedPatient.patientId}/orders
                        </span>{' '}
                        subcollection and protected by the Parent Master Gate.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {orders.map((ord) => {
                        const isTerminalOrder =
                          ord.orderStatus === 'Completed' || ord.orderStatus === 'Cancelled';
                        const canModifyOrder = isAdminActive || !isTerminalOrder;
                        return (
                          <div
                            key={ord.orderId}
                            className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50"
                          >
                            <div className="space-y-1 max-w-xl">
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span
                                  className={`font-semibold ${
                                    ord.priority === 'STAT'
                                      ? 'text-red-600'
                                      : ord.priority === 'Urgent'
                                      ? 'text-amber-600'
                                      : 'text-slate-700'
                                  }`}
                                >
                                  {ord.priority}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-medium text-slate-900">
                                  {ord.orderType}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>Ordered by {ord.orderedByName}</span>
                              </div>
                              <div className="text-sm font-medium text-slate-900">
                                {ord.description}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <select
                                value={ord.orderStatus}
                                disabled={!canModifyOrder}
                                onChange={(e) =>
                                  handleUpdateOrderStatus(ord, e.target.value as OrderStatus)
                                }
                                aria-label="Order Status"
                                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 disabled:opacity-50"
                              >
                                {ORDER_STATUSES.map((st) => (
                                  <option key={st} value={st}>
                                    {st}
                                  </option>
                                ))}
                              </select>

                              {isAdminActive ? (
                                <button
                                  onClick={() => handleDeleteOrder(ord)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Delete Order (Admin Only)"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    handleSimulateBlockedAttempt(
                                      `Delete clinical order ${ord.orderId}`,
                                      ord.orderId
                                    )
                                  }
                                  className="p-1.5 text-slate-300 hover:text-slate-500 rounded-md cursor-pointer"
                                  title="Order deletion requires Admin role"
                                >
                                  <Lock className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="p-10 text-center text-xs text-slate-500">
                  Select a patient on the left to inspect or add clinical orders.
                </div>
              )}
            </div>
          </section>
        )}

        {/* ===================================================================
            TAB 3: WARD CAPACITY & BUDGET (/departments/{deptId})
           =================================================================== */}
        {activeTab === 'departments' && (
          <section className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Hospital Ward Bed Capacity & Cost-Center Governance
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isAdminActive
                    ? 'Tier 1 Administrator Active: Click any department row to reallocate licensed beds, diversion state, or budget codes.'
                    : 'Tier 2 Medical Staff Active: Read-only operational capacity view. Bed count and budget mutations require Administrator privileges.'}
                </p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Clinical Ward</th>
                      <th className="py-3 px-4">Department Chief</th>
                      <th className="py-3 px-4 text-right">Occupied / Total Beds</th>
                      <th className="py-3 px-4">Diversion Status</th>
                      <th className="py-3 px-4">Budget Cost Center</th>
                      <th className="py-3 px-4 text-right">Governance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {departments.map((dept) => {
                      const pct = Math.round((dept.occupiedBeds / dept.totalBeds) * 100);
                      return (
                        <tr key={dept.deptId} className="hover:bg-slate-50/80">
                          <td className="py-3.5 px-4 font-semibold text-slate-900">
                            {dept.name}
                          </td>
                          <td className="py-3.5 px-4 text-slate-700">{dept.headPhysician}</td>
                          <td className="py-3.5 px-4 text-right font-mono-tabular">
                            <span className="font-semibold text-slate-900">
                              {dept.occupiedBeds} / {dept.totalBeds}
                            </span>
                            <span className="text-slate-500 ml-2">({pct}%)</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`font-semibold ${
                                dept.diversionStatus === 'Critical Capacity' ||
                                dept.diversionStatus === 'Diversion'
                                  ? 'text-red-600'
                                  : dept.diversionStatus === 'Advisory'
                                  ? 'text-amber-600'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {dept.diversionStatus}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono-tabular text-slate-600">
                            {dept.budgetCode}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {isAdminActive ? (
                              <button
                                onClick={() => setEditingDept(dept)}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                              >
                                Configure Ward
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  handleSimulateBlockedAttempt(
                                    `Modify ${dept.name} bed capacity & budget (${dept.budgetCode})`,
                                    dept.deptId
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-md hover:bg-slate-200 cursor-pointer"
                              >
                                <Lock className="w-3 h-3" />
                                Locked (Admin Only)
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            TAB 4: STAFF DIRECTORY & RBAC ROLES (/staff_profiles/{staffId})
           =================================================================== */}
        {activeTab === 'staff' && (
          <section className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Hospital Staff Directory & RBAC Role Assignments
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isAdminActive
                    ? 'Tier 1 Administrator Active: Can onboard staff and modify RBAC roles (admin, physician, nurse, lab_tech).'
                    : 'Tier 2 Medical Staff Active: Role self-promotion is strictly blocked by Firestore Security Rules. You may only update shift & duty status.'}
                </p>
              </div>

              {isAdminActive && (
                <button
                  onClick={() => setShowNewStaffModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Onboard Staff Member
                </button>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Badge ID</th>
                      <th className="py-3 px-4">Clinician Name</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">Assigned RBAC Role (Admin-Gated)</th>
                      <th className="py-3 px-4">Shift Schedule</th>
                      <th className="py-3 px-4">Duty Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {staffProfiles.map((staff) => (
                      <tr key={staff.staffId} className="hover:bg-slate-50/80">
                        <td className="py-3.5 px-4 font-mono-tabular text-slate-600">
                          {staff.badgeId}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          {staff.fullName}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">{staff.department}</td>
                        <td className="py-3.5 px-4">
                          {isAdminActive ? (
                            <select
                              value={staff.role}
                              onChange={(e) =>
                                handleStaffQuickUpdate(staff, {
                                  role: e.target.value as StaffRole,
                                })
                              }
                              aria-label="Staff Role"
                              className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-md font-medium text-slate-900"
                            >
                              {STAFF_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 text-slate-700 font-mono-tabular">
                              <Lock className="w-3 h-3 text-slate-400" />
                              <span>{staff.role}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <select
                            value={staff.shift}
                            onChange={(e) =>
                              handleStaffQuickUpdate(staff, {
                                shift: e.target.value as ShiftType,
                              })
                            }
                            aria-label="Staff Shift"
                            className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-800"
                          >
                            {SHIFT_TYPES.map((sh) => (
                              <option key={sh} value={sh}>
                                {sh}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3.5 px-4">
                          <select
                            value={staff.status}
                            onChange={(e) =>
                              handleStaffQuickUpdate(staff, {
                                status: e.target.value as StaffDutyStatus,
                              })
                            }
                            aria-label="Duty Status"
                            className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-800"
                          >
                            {DUTY_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            TAB 5: RBAC POLICY MATRIX & IMMUTABLE SECURITY AUDIT LOG
           =================================================================== */}
        {activeTab === 'rbac' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Complete Role Access Comparison Matrix */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">
                  01. Hospital RBAC Permission Matrix (Admin vs. Regular Medical Staff)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Enforced simultaneously in the React client and backend{' '}
                  <span className="font-mono-tabular">firestore.rules</span> via Action-Based
                  Update whitelists and Relational Master Gates.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Database Operation / Resource</th>
                      <th className="py-3 px-4">Hospital Admin (Tier 1)</th>
                      <th className="py-3 px-4">Medical Staff (Tier 2)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {[
                      {
                        op: 'List Patient Charts (/patients)',
                        admin: 'All Hospital Admissions',
                        staff: 'Assigned Patients Only (assignedStaffId == uid)',
                      },
                      {
                        op: 'Admit New Patient (CREATE /patients)',
                        admin: 'Allowed',
                        staff: 'Denied (Admin Only)',
                      },
                      {
                        op: 'Update Vitals, Triage & Progress Notes',
                        admin: 'Allowed (All Records)',
                        staff: 'Allowed on Non-Discharged Assigned Patients',
                      },
                      {
                        op: 'Modify Billing Insurance & Room Transfers',
                        admin: 'Allowed',
                        staff: 'Denied by affectedKeys().hasOnly() Gate',
                      },
                      {
                        op: 'Edit Discharged Patient Charts (Terminal Lock)',
                        admin: 'Allowed (Admin Override)',
                        staff: 'Denied (Locked once Discharged)',
                      },
                      {
                        op: 'Archive / Delete Patient Chart (DELETE /patients)',
                        admin: 'Allowed',
                        staff: 'Denied (Admin Only)',
                      },
                      {
                        op: 'Clinical Orders (/patients/{id}/orders)',
                        admin: 'Create, Edit, Override & Delete',
                        staff: 'Create & Progress Active Orders Only',
                      },
                      {
                        op: 'Ward Capacity & Budgets (/departments)',
                        admin: 'Full Read & Write',
                        staff: 'Read-Only Operational Visibility',
                      },
                      {
                        op: 'Staff Roles & Onboarding (/staff_profiles)',
                        admin: 'Grant/Modify Roles & Onboard',
                        staff: 'Update Own Shift & Duty Status Only',
                      },
                    ].map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-medium text-slate-900">{row.op}</td>
                        <td className="py-3 px-4 text-blue-700 font-medium">{row.admin}</td>
                        <td className="py-3 px-4 text-slate-600">{row.staff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: Immutable Audit Trail (/audit_logs) */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    02. Immutable Security Audit Log
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Append-only (<span className="font-mono-tabular">allow update, delete: if false</span>)
                  </p>
                </div>
                <span className="text-xs font-mono-tabular text-slate-500">
                  {auditLogs.length} entries
                </span>
              </div>

              <div className="divide-y divide-slate-200 max-h-[520px] overflow-y-auto">
                {auditLogs.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No audit events recorded yet. Perform an action or seed the database.
                  </div>
                ) : (
                  auditLogs.map((log) => (
                    <div key={log.logId} className="p-4 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span
                          className={`font-semibold ${
                            log.severity === 'Restricted-Blocked'
                              ? 'text-red-600'
                              : log.severity === 'Elevated'
                              ? 'text-blue-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {log.severity} · Role: {log.actorRole}
                        </span>
                        <span className="font-mono-tabular">
                          {formatTimestamp(log.createdAt)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-900 font-medium">{log.action}</div>
                      <div className="text-[11px] text-slate-500 font-mono-tabular">
                        Actor: {log.actorName} · Target: {log.targetId}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* =====================================================================
          MODAL 1: PATIENT CHART EDITOR (Tier 1 Admin vs Tier 2 Medical Staff)
         ===================================================================== */}
      {editingPatient && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-5 my-8">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs text-slate-500 font-mono-tabular">
                  <span>{editingPatient.mrn}</span>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span>
                    {isAdminActive
                      ? 'Tier 1 Administrator Full Edit Mode'
                      : 'Tier 2 Medical Staff Clinical Care Mode'}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  {editingPatient.fullName}
                </h3>
              </div>
              <button
                onClick={() => setEditingPatient(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!isAdminActive && editingPatient.triageStatus === 'Discharged' ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                <div className="text-xs font-semibold text-amber-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-700" />
                  <span>Terminal State Lock Active (Patient Discharged)</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Under Hospital RBAC Rules, once a patient reaches the{' '}
                  <span className="font-mono-tabular font-semibold">Discharged</span> state,
                  regular Medical Staff cannot modify the chart. Switch to{' '}
                  <span className="font-semibold">Admin (Tier 1)</span> in the top bar to reopen
                  or amend this record.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSavePatientUpdate} className="space-y-4">
                {/* Section A: Administrative, Ward Transfer & Billing Fields (Admin Only) */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900">
                      Administrative, Ward Assignment & Billing Fields
                    </span>
                    <span className="text-slate-500 font-mono-tabular">
                      {isAdminActive ? 'Unlocked (Tier 1 Admin)' : 'Locked (Tier 2 Staff Read-Only)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Patient Full Name
                      </label>
                      <input
                        name="fullName"
                        defaultValue={editingPatient.fullName}
                        disabled={!isAdminActive}
                        required
                        minLength={2}
                        maxLength={100}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Age (Years)
                      </label>
                      <input
                        name="age"
                        type="number"
                        defaultValue={editingPatient.age}
                        disabled={!isAdminActive}
                        min={0}
                        max={130}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md font-mono-tabular disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        ABO/Rh Blood Type
                      </label>
                      <select
                        name="bloodType"
                        defaultValue={editingPatient.bloodType}
                        disabled={!isAdminActive}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        {BLOOD_TYPES.map((bt) => (
                          <option key={bt} value={bt}>
                            {bt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Clinical Ward
                      </label>
                      <select
                        name="department"
                        defaultValue={editingPatient.department}
                        disabled={!isAdminActive}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        {CLINICAL_WARDS.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Room / Bed Code
                      </label>
                      <input
                        name="roomNumber"
                        defaultValue={editingPatient.roomNumber}
                        disabled={!isAdminActive}
                        required
                        maxLength={20}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md font-mono-tabular disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Insurance & Billing Clearance
                      </label>
                      <select
                        name="insuranceStatus"
                        defaultValue={editingPatient.insuranceStatus}
                        disabled={!isAdminActive}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        {INSURANCE_STATUSES.map((ins) => (
                          <option key={ins} value={ins}>
                            {ins}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Assigned Attending Clinician
                    </label>
                    <select
                      name="assignedStaffId"
                      defaultValue={editingPatient.assignedStaffId}
                      disabled={!isAdminActive}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      <option value={user.uid}>
                        {user.displayName || 'Current User'} (Assigned to You)
                      </option>
                      {staffProfiles
                        .filter((s) => s.staffId !== user.uid)
                        .map((s) => (
                          <option key={s.staffId} value={s.staffId}>
                            {s.fullName} ({s.department} · {s.role})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Section B: Clinical Care Fields (Editable by BOTH Admin and Assigned Medical Staff) */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-900">
                    Clinical Care & Telemetry Fields (Authorized for Assigned Medical Staff & Admins)
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Acuity / Triage Status
                      </label>
                      <select
                        name="triageStatus"
                        defaultValue={editingPatient.triageStatus}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                      >
                        {TRIAGE_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Vital Signs Telemetry
                      </label>
                      <input
                        name="vitalSigns"
                        defaultValue={editingPatient.vitalSigns}
                        required
                        minLength={2}
                        maxLength={200}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md font-mono-tabular"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Primary Diagnosis Summary
                    </label>
                    <input
                      name="diagnosisSummary"
                      defaultValue={editingPatient.diagnosisSummary}
                      required
                      minLength={2}
                      maxLength={500}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                    />
                  </div>

                  {/* New Clinical Observations Input Area (Appends Chronological Progress Notes) */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor="clinicalObservationsInput"
                        className="block text-xs font-semibold text-slate-900"
                      >
                        Clinical Observations (Append Chronological Progress Note)
                      </label>
                      <span className="text-[11px] text-slate-500 font-mono-tabular">
                        Auto-stamped with clinician & timestamp
                      </span>
                    </div>

                    <textarea
                      id="clinicalObservationsInput"
                      name="clinicalObservations"
                      rows={2}
                      value={newObservationDraft}
                      onChange={(e) => setNewObservationDraft(e.target.value)}
                      maxLength={350}
                      placeholder="Enter new bedside observation, intervention response, or shift handover note to append chronologically..."
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-900"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-slate-500">Quick Insert:</span>
                        {[
                          'Hemodynamically stable; vitals verified at bedside.',
                          'Scheduled IV medication administered per MAR without adverse reaction.',
                          'Neurological & respiratory assessment unchanged; continuing monitoring.',
                        ].map((snippet, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() =>
                              setNewObservationDraft((prev) =>
                                prev.trim() ? `${prev.trim()} ${snippet}` : snippet
                              )
                            }
                            className="px-2 py-0.5 text-[11px] text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            + Note {idx + 1}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={handleAppendObservationInline}
                        disabled={!newObservationDraft.trim()}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Append to Clinical Record
                      </button>
                    </div>
                  </div>

                  {/* Chronological Clinical Record & Progress Notes */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-medium text-slate-600">
                        Chronological Progress Notes Record
                      </label>
                      <span className="text-[11px] text-slate-400 font-mono-tabular">
                        {clinicalNotesDraft.length} / 1000 chars
                      </span>
                    </div>

                    {clinicalNotesDraft.trim() && (
                      <div className="max-h-36 overflow-y-auto bg-slate-50 border border-slate-200 rounded-md p-2.5 space-y-1.5">
                        {clinicalNotesDraft
                          .split('\n')
                          .map((line) => line.trim())
                          .filter(Boolean)
                          .map((entry, idx) => (
                            <div
                              key={idx}
                              className="text-xs text-slate-800 bg-white border border-slate-200/80 rounded px-2.5 py-1.5 font-mono-tabular leading-relaxed"
                            >
                              {entry}
                            </div>
                          ))}
                      </div>
                    )}

                    <textarea
                      name="clinicalNotes"
                      rows={3}
                      value={clinicalNotesDraft}
                      onChange={(e) => setClinicalNotesDraft(e.target.value)}
                      maxLength={1000}
                      placeholder="Cumulative chronological clinical progress notes..."
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md font-mono-tabular"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                  {isAdminActive ? (
                    <button
                      type="button"
                      onClick={() => handleDeletePatient(editingPatient)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Chart
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-500">
                      Payload restricted to clinical keys via Tier 2 security rule.
                    </span>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingPatient(null)}
                      className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
                    >
                      Save Chart Changes
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: ADMIT NEW PATIENT (Admin Tier 1 Only)
         ===================================================================== */}
      {showAdmitModal && isAdminActive && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Admit New Patient Record (Tier 1 Admin)
              </h3>
              <button
                onClick={() => setShowAdmitModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdmitPatient} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Patient Full Name
                  </label>
                  <input
                    name="fullName"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="e.g. Nadia Kowalski"
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Medical Record Number (MRN)
                  </label>
                  <input
                    name="mrn"
                    defaultValue={`MRN-2026-${Math.floor(1000 + Math.random() * 8999)}`}
                    required
                    minLength={4}
                    maxLength={32}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md font-mono-tabular"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Age
                  </label>
                  <input
                    name="age"
                    type="number"
                    defaultValue={48}
                    min={0}
                    max={130}
                    required
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Blood Group
                  </label>
                  <select
                    name="bloodType"
                    defaultValue="O+"
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                  >
                    {BLOOD_TYPES.map((bt) => (
                      <option key={bt} value={bt}>
                        {bt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Room Code
                  </label>
                  <input
                    name="roomNumber"
                    defaultValue="ICU-08"
                    required
                    maxLength={20}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md font-mono-tabular"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Ward
                  </label>
                  <select
                    name="department"
                    defaultValue="ICU"
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                  >
                    {CLINICAL_WARDS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Triage Acuity
                  </label>
                  <select
                    name="triageStatus"
                    defaultValue="Observation"
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                  >
                    {TRIAGE_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Insurance Status
                  </label>
                  <select
                    name="insuranceStatus"
                    defaultValue="Verified"
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                  >
                    {INSURANCE_STATUSES.map((ins) => (
                      <option key={ins} value={ins}>
                        {ins}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Assign Attending Medical Staff
                </label>
                <select
                  name="assigneeSelect"
                  defaultValue="self"
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                >
                  <option value="self">
                    Assign to Me ({user.displayName || user.email}) — Visible in Medical Staff Mode
                  </option>
                  {staffProfiles.map((s) => (
                    <option key={s.staffId} value={s.staffId}>
                      {s.fullName} ({s.department} · {s.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Primary Diagnosis Summary
                </label>
                <input
                  name="diagnosisSummary"
                  required
                  minLength={2}
                  maxLength={500}
                  placeholder="Clinical admission diagnosis..."
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Initial Vital Signs
                </label>
                <input
                  name="vitalSigns"
                  defaultValue="HR 82 bpm | BP 124/76 mmHg | SpO2 98% | Temp 36.9C"
                  required
                  maxLength={200}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md font-mono-tabular"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAdmitModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
                >
                  Confirm Admission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: NEW CLINICAL ORDER
         ===================================================================== */}
      {showNewOrderModal && selectedPatient && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                New Clinical Order · {selectedPatient.fullName}
              </h3>
              <button
                onClick={() => setShowNewOrderModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateClinicalOrder} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Order Category
                  </label>
                  <select
                    name="orderType"
                    defaultValue="Medication"
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                  >
                    {ORDER_TYPES.map((ot) => (
                      <option key={ot} value={ot}>
                        {ot}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Priority
                  </label>
                  <select
                    name="priority"
                    defaultValue="Urgent"
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                  >
                    {ORDER_PRIORITIES.map((pr) => (
                      <option key={pr} value={pr}>
                        {pr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Clinical Specification / Dosage Instructions
                </label>
                <textarea
                  name="description"
                  required
                  minLength={2}
                  maxLength={300}
                  rows={3}
                  placeholder="e.g. Piperacillin-Tazobactam 4.5g IV q6h"
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewOrderModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
                >
                  Sign & Submit Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: CONFIGURE WARD CAPACITY (Admin Only)
         ===================================================================== */}
      {editingDept && isAdminActive && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Configure {editingDept.name} Ward (Admin Only)
              </h3>
              <button
                onClick={() => setEditingDept(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDepartment} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Department Chief Physician
                </label>
                <input
                  name="headPhysician"
                  defaultValue={editingDept.headPhysician}
                  required
                  minLength={2}
                  maxLength={100}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Occupied Beds
                  </label>
                  <input
                    name="occupiedBeds"
                    type="number"
                    defaultValue={editingDept.occupiedBeds}
                    min={0}
                    max={500}
                    required
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Total Licensed Beds
                  </label>
                  <input
                    name="totalBeds"
                    type="number"
                    defaultValue={editingDept.totalBeds}
                    min={1}
                    max={500}
                    required
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md font-mono-tabular"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Diversion Status
                  </label>
                  <select
                    name="diversionStatus"
                    defaultValue={editingDept.diversionStatus}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                  >
                    {DIVERSION_STATUSES.map((ds) => (
                      <option key={ds} value={ds}>
                        {ds}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Cost Center Budget Code
                  </label>
                  <input
                    name="budgetCode"
                    defaultValue={editingDept.budgetCode}
                    required
                    minLength={3}
                    maxLength={32}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md font-mono-tabular"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingDept(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  Save Ward Allocation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 5: ONBOARD NEW STAFF MEMBER (Admin Only)
         ===================================================================== */}
      {showNewStaffModal && isAdminActive && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Onboard Staff & Assign RBAC Role (Admin)
              </h3>
              <button
                onClick={() => setShowNewStaffModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Clinician Full Name & Credentials
                </label>
                <input
                  name="fullName"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="e.g. Dr. Hannah Abbott, MD"
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    RBAC Role Tier
                  </label>
                  <select
                    name="role"
                    defaultValue="physician"
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Badge Identifier
                  </label>
                  <input
                    name="badgeId"
                    defaultValue={`BDG-PHY-${Math.floor(100 + Math.random() * 899)}`}
                    required
                    minLength={3}
                    maxLength={32}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md font-mono-tabular"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Department
                  </label>
                  <select
                    name="department"
                    defaultValue="Cardiology"
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                  >
                    {[...CLINICAL_WARDS, 'Administration'].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Shift Schedule
                  </label>
                  <select
                    name="shift"
                    defaultValue="Day (07:00-19:00)"
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                  >
                    {SHIFT_TYPES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewStaffModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
                >
                  Create Staff Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
