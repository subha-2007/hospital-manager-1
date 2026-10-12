import { Timestamp } from 'firebase/firestore';

export type StaffRole = 'admin' | 'physician' | 'nurse' | 'lab_tech';

export type DepartmentName =
  | 'Cardiology'
  | 'Neurology'
  | 'Emergency'
  | 'Oncology'
  | 'Pediatrics'
  | 'ICU'
  | 'Administration';

export type ClinicalWard =
  | 'Cardiology'
  | 'Neurology'
  | 'Emergency'
  | 'Oncology'
  | 'Pediatrics'
  | 'ICU';

export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type TriageStatus = 'Critical' | 'Observation' | 'Stable' | 'Discharged';

export type InsuranceStatus = 'Verified' | 'Pending Review' | 'Self-Pay' | 'Gov-Coverage';

export type ShiftType = 'Day (07:00-19:00)' | 'Night (19:00-07:00)' | 'On-Call';

export type StaffDutyStatus = 'On Duty' | 'Off Duty' | 'In Surgery';

export type AttendanceStatus =
  | 'Present - Checked In'
  | 'Completed Shift'
  | 'Late Arrival'
  | 'On Leave';

export type OrderType = 'Medication' | 'Lab Panel' | 'Imaging' | 'Procedure';

export type OrderPriority = 'STAT' | 'Urgent' | 'Routine';

export type OrderStatus = 'Pending' | 'In Progress' | 'Completed' | 'Cancelled';

export type DiversionStatus =
  | 'Normal Operations'
  | 'Advisory'
  | 'Critical Capacity'
  | 'Diversion';

export type AuditSeverity = 'Info' | 'Elevated' | 'Restricted-Blocked';

export interface AdminGrant {
  uid: string;
  grantedBy: string;
  roleLabel: string;
  createdAt: Timestamp;
}

export interface StaffProfile {
  staffId: string;
  ownerId: string;
  fullName: string;
  role: StaffRole;
  department: DepartmentName;
  badgeId: string;
  shift: ShiftType;
  status: StaffDutyStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PatientRecord {
  patientId: string;
  mrn: string;
  fullName: string;
  age: number;
  bloodType: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  department: ClinicalWard;
  roomNumber: string;
  triageStatus: TriageStatus;
  diagnosisSummary: string;
  vitalSigns: string;
  clinicalNotes: string;
  insuranceStatus: InsuranceStatus;
  assignedStaffId: string;
  assignedStaffName: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ClinicalOrder {
  orderId: string;
  patientId: string;
  orderType: OrderType;
  description: string;
  priority: OrderPriority;
  orderStatus: OrderStatus;
  orderedBy: string;
  orderedByName: string;
  assignedStaffId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DepartmentConfig {
  deptId: string;
  name: ClinicalWard;
  headPhysician: string;
  totalBeds: number;
  occupiedBeds: number;
  diversionStatus: DiversionStatus;
  budgetCode: string;
  ownerId: string;
  updatedAt: Timestamp;
}

export interface AttendanceRecord {
  attendanceId: string;
  staffUid: string;
  ownerId: string;
  staffName: string;
  badgeId: string;
  department: DepartmentName;
  shiftDate: string;
  shiftType: ShiftType;
  attendanceStatus: AttendanceStatus;
  clockInNote: string;
  hoursLogged: number;
  verifiedByAdmin: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AuditLog {
  logId: string;
  actorId: string;
  actorName: string;
  actorRole: StaffRole;
  action: string;
  targetId: string;
  severity: AuditSeverity;
  createdAt: Timestamp;
}

export type UserAccessStatus = 'Active' | 'Suspended' | 'Pending';

export interface UserAccessRecord {
  accessId: string;
  email: string;
  fullName: string;
  accessType: StaffRole;
  department: DepartmentName;
  badgeId: string;
  status: UserAccessStatus;
  ownerId: string;
  assignedByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
