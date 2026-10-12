/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Edit2,
  Filter,
  KeyRound,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  DepartmentName,
  StaffRole,
  UserAccessRecord,
  UserAccessStatus,
} from './types';

interface Props {
  isAdminActive: boolean;
  userUid: string;
  userDisplayName: string;
  userEmail?: string | null;
  userAccessRecords: UserAccessRecord[];
  onCreateUserAccess: (data: {
    email: string;
    fullName: string;
    accessType: StaffRole;
    department: DepartmentName;
    badgeId: string;
    status: UserAccessStatus;
  }) => Promise<void>;
  onUpdateUserAccess: (
    accessId: string,
    updates: Partial<{
      fullName: string;
      accessType: StaffRole;
      department: DepartmentName;
      badgeId: string;
      status: UserAccessStatus;
    }>
  ) => Promise<void>;
  onDeleteUserAccess: (accessId: string, email: string) => Promise<void>;
  recordAuditEvent: (
    action: string,
    targetId: string,
    severity?: 'Info' | 'Elevated' | 'Restricted-Blocked'
  ) => Promise<void>;
  onSwitchToAdmin?: () => void;
}

const DEPARTMENTS: DepartmentName[] = [
  'Administration',
  'Cardiology',
  'Emergency',
  'ICU',
  'Neurology',
  'Oncology',
  'Pediatrics',
];

const ACCESS_TYPES: { role: StaffRole; label: string; tier: string; desc: string; badgeClass: string }[] = [
  {
    role: 'admin',
    label: 'Hospital Administrator',
    tier: 'Tier 1 Governance',
    desc: 'Full DB access, admissions, billing edits, ward budget allocations, and user access management.',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  {
    role: 'physician',
    label: 'Attending Physician',
    tier: 'Tier 2 Direct Care',
    desc: 'Clinical patient care, vitals, triage acuity, clinical progress notes, and diagnostic orders.',
    badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
  },
  {
    role: 'nurse',
    label: 'Registered Nurse',
    tier: 'Tier 2 Direct Care',
    desc: 'Bedside observations, vitals updates, shift attendance check-ins, and medication administrations.',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  {
    role: 'lab_tech',
    label: 'Laboratory Technologist',
    tier: 'Tier 2 Diagnostic',
    desc: 'Specimen processing, laboratory panel progression, imaging orders, and pathology logs.',
    badgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
  },
];

export function UserAccessManagementView({
  isAdminActive,
  userUid,
  userDisplayName,
  userEmail,
  userAccessRecords,
  onCreateUserAccess,
  onUpdateUserAccess,
  onDeleteUserAccess,
  recordAuditEvent,
  onSwitchToAdmin,
}: Props) {
  // Search and Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<UserAccessRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<UserAccessRecord | null>(null);

  // Form State for Add New Email Access
  const [formEmail, setFormEmail] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formAccessType, setFormAccessType] = useState<StaffRole>('physician');
  const [formDepartment, setFormDepartment] = useState<DepartmentName>('ICU');
  const [formBadgeId, setFormBadgeId] = useState('');
  const [formStatus, setFormStatus] = useState<UserAccessStatus>('Active');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Quick Inline updating tracker
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Counters
  const metrics = useMemo(() => {
    const total = userAccessRecords.length;
    const admins = userAccessRecords.filter((u) => u.accessType === 'admin').length;
    const physicians = userAccessRecords.filter((u) => u.accessType === 'physician').length;
    const nurses = userAccessRecords.filter((u) => u.accessType === 'nurse').length;
    const labTechs = userAccessRecords.filter((u) => u.accessType === 'lab_tech').length;
    const active = userAccessRecords.filter((u) => u.status === 'Active').length;
    const suspended = userAccessRecords.filter((u) => u.status === 'Suspended').length;
    return { total, admins, physicians, nurses, labTechs, active, suspended };
  }, [userAccessRecords]);

  // Filtered List
  const filteredUsers = useMemo(() => {
    return userAccessRecords.filter((rec) => {
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        rec.email.toLowerCase().includes(q) ||
        rec.fullName.toLowerCase().includes(q) ||
        rec.badgeId.toLowerCase().includes(q) ||
        rec.department.toLowerCase().includes(q);
      const matchesRole = roleFilter === 'ALL' || rec.accessType === roleFilter;
      const matchesStatus = statusFilter === 'ALL' || rec.status === statusFilter;
      const matchesDept = departmentFilter === 'ALL' || rec.department === departmentFilter;
      return matchesSearch && matchesRole && matchesStatus && matchesDept;
    });
  }, [userAccessRecords, searchTerm, roleFilter, statusFilter, departmentFilter]);

  // Generate a realistic badge ID
  function generateSuggestedBadge(role: StaffRole): string {
    const prefix =
      role === 'admin'
        ? 'BDG-ADM'
        : role === 'physician'
        ? 'BDG-PHY'
        : role === 'nurse'
        ? 'BDG-NRS'
        : 'BDG-LAB';
    const num = Math.floor(100 + Math.random() * 899);
    return `${prefix}-${num}`;
  }

  // Preset Handler
  function handleApplyPreset(role: StaffRole, dept: DepartmentName, namePlaceholder: string) {
    setFormAccessType(role);
    setFormDepartment(dept);
    setFormFullName(namePlaceholder);
    setFormBadgeId(generateSuggestedBadge(role));
  }

  // Open Add Modal
  function handleOpenAddModal() {
    setFormEmail('');
    setFormFullName('');
    setFormAccessType('physician');
    setFormDepartment('ICU');
    setFormBadgeId(generateSuggestedBadge('physician'));
    setFormStatus('Active');
    setFormError(null);
    setShowAddModal(true);
  }

  // Submit New Email Access
  async function handleSubmitNewAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdminActive) return;

    const emailTrimmed = formEmail.trim().toLowerCase();
    if (!emailTrimmed || !emailTrimmed.includes('@') || !emailTrimmed.includes('.')) {
      setFormError('Please enter a valid email address (e.g., clinician@hospital.org).');
      return;
    }

    if (!formFullName.trim() || formFullName.trim().length < 2) {
      setFormError('Full name must be at least 2 characters.');
      return;
    }

    // Check duplicate email
    const exists = userAccessRecords.some((u) => u.email.toLowerCase() === emailTrimmed);
    if (exists) {
      setFormError(`An authorization record for ${emailTrimmed} already exists.`);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      await onCreateUserAccess({
        email: emailTrimmed,
        fullName: formFullName.trim(),
        accessType: formAccessType,
        department: formDepartment,
        badgeId: formBadgeId.trim() || generateSuggestedBadge(formAccessType),
        status: formStatus,
      });
      setShowAddModal(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to register email access.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Quick Change Access Type from table
  async function handleQuickChangeAccessType(rec: UserAccessRecord, newRole: StaffRole) {
    if (!isAdminActive) {
      await recordAuditEvent(
        `Blocked unauthorized attempt to change access type for ${rec.email}`,
        rec.accessId,
        'Restricted-Blocked'
      );
      return;
    }
    if (rec.accessType === newRole) return;

    setUpdatingId(rec.accessId);
    try {
      await onUpdateUserAccess(rec.accessId, { accessType: newRole });
    } finally {
      setUpdatingId(null);
    }
  }

  // Quick Toggle Status (Active / Suspended)
  async function handleQuickToggleStatus(rec: UserAccessRecord) {
    if (!isAdminActive) {
      await recordAuditEvent(
        `Blocked unauthorized attempt to toggle status for ${rec.email}`,
        rec.accessId,
        'Restricted-Blocked'
      );
      return;
    }
    const nextStatus: UserAccessStatus = rec.status === 'Active' ? 'Suspended' : 'Active';
    setUpdatingId(rec.accessId);
    try {
      await onUpdateUserAccess(rec.accessId, { status: nextStatus });
    } finally {
      setUpdatingId(null);
    }
  }

  // Save Edit Details Modal
  async function handleSaveEditDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRecord || !isAdminActive) return;

    setIsSubmitting(true);
    try {
      await onUpdateUserAccess(editingRecord.accessId, {
        fullName: editingRecord.fullName,
        accessType: editingRecord.accessType,
        department: editingRecord.department,
        badgeId: editingRecord.badgeId,
        status: editingRecord.status,
      });
      setEditingRecord(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Confirm Delete / Revoke
  async function handleConfirmDelete() {
    if (!deletingRecord || !isAdminActive) return;
    setIsSubmitting(true);
    try {
      await onDeleteUserAccess(deletingRecord.accessId, deletingRecord.email);
      setDeletingRecord(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Export CSV
  function handleExportCsv() {
    if (userAccessRecords.length === 0) return;
    const headers = ['Email', 'Full Name', 'Access Type', 'Department', 'Badge ID', 'Status', 'Assigned By'];
    const rows = userAccessRecords.map((r) => [
      `"${r.email}"`,
      `"${r.fullName}"`,
      `"${r.accessType}"`,
      `"${r.department}"`,
      `"${r.badgeId}"`,
      `"${r.status}"`,
      `"${r.assignedByName}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hospital_registered_emails_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <section className="space-y-6">
      {/* =========================================================================
          1. HEADER & ZERO-TRUST BOUNDARY BANNER
         ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <KeyRound className="w-4 h-4" />
              </div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Registered Email Authorizations & RBAC Access Control
              </h1>
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                  isAdminActive
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-slate-100 text-slate-600 border-slate-300'
                }`}
              >
                {isAdminActive ? 'Tier 1 Admin Governance' : 'Restricted (Medical Staff)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
              Administrative interface to audit all registered hospital clinician email addresses, grant new access permissions (Admin, Physician, Nurse, Lab Tech), and dynamically adjust role assignments or account states in real-time.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleExportCsv}
              disabled={userAccessRecords.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>

            {isAdminActive ? (
              <button
                onClick={handleOpenAddModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Register New Email ID</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  recordAuditEvent(
                    'Blocked attempt by Medical Staff to register new email access',
                    'user_access_register',
                    'Restricted-Blocked'
                  );
                  if (onSwitchToAdmin) onSwitchToAdmin();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                title="Switch to Admin mode to register emails"
              >
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>Switch to Admin Mode</span>
              </button>
            )}
          </div>
        </div>

        {/* Non-Admin Security Notice if viewed under Medical Staff */}
        {!isAdminActive && (
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-xs text-amber-900">
            <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <span className="font-semibold">
                Operating under Tier 2 Medical Staff permissions (Read-Only Directory):
              </span>
              <p className="text-amber-800">
                You can view authorized email addresses for hospital coordination. Adding new email IDs, modifying access types, or revoking accounts requires Administrator (Tier 1) privileges. Click &quot;Admin (Tier 1)&quot; in the top-right header to switch if your account is authorized.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          2. QUANTITATIVE TELEMETRY METRICS
         ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] text-slate-500">Registered Accounts</div>
          <div className="text-xl font-bold text-slate-900 font-mono-tabular mt-1">
            {metrics.total}
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5">{metrics.active} Active</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] text-amber-700 font-medium">Administrators</div>
          <div className="text-xl font-bold text-amber-800 font-mono-tabular mt-1">
            {metrics.admins}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Tier 1 Governance</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] text-blue-700 font-medium">Physicians</div>
          <div className="text-xl font-bold text-blue-800 font-mono-tabular mt-1">
            {metrics.physicians}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Tier 2 Direct Care</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] text-emerald-700 font-medium">Nurses</div>
          <div className="text-xl font-bold text-emerald-800 font-mono-tabular mt-1">
            {metrics.nurses}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Tier 2 Bedside</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] text-purple-700 font-medium">Lab Techs</div>
          <div className="text-xl font-bold text-purple-800 font-mono-tabular mt-1">
            {metrics.labTechs}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Tier 2 Diagnostics</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] text-red-600 font-medium">Suspended</div>
          <div className="text-xl font-bold text-red-700 font-mono-tabular mt-1">
            {metrics.suspended}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Access Revoked</div>
        </div>
      </div>

      {/* =========================================================================
          3. SEARCH & FILTER CONTROLS
         ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by registered email, name, badge ID..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by Access Role"
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="ALL">All Access Roles</option>
              <option value="admin">Administrators (Tier 1)</option>
              <option value="physician">Physicians (Tier 2)</option>
              <option value="nurse">Nurses (Tier 2)</option>
              <option value="lab_tech">Lab Techs (Tier 2)</option>
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by Status"
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
          >
            <option value="ALL">All Account Statuses</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending Review</option>
            <option value="Suspended">Suspended</option>
          </select>

          {/* Department Filter */}
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            aria-label="Filter by Department"
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
          >
            <option value="ALL">All Departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-500 font-mono-tabular">
          Showing {filteredUsers.length} of {userAccessRecords.length} registered accounts
        </div>
      </div>

      {/* =========================================================================
          4. REGISTERED EMAILS & ACCESS TABLE
         ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-4">Clinician & Registered Email ID</th>
                <th className="py-3 px-4">Assigned Access Role</th>
                <th className="py-3 px-4">Change Access Type (Admin)</th>
                <th className="py-3 px-4">Department Ward</th>
                <th className="py-3 px-4">Badge ID</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Mail className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <div className="font-semibold text-slate-700">No registered emails found</div>
                    <p className="text-xs text-slate-500 mt-1">
                      {searchTerm || roleFilter !== 'ALL'
                        ? 'Try clearing the search or filter filters.'
                        : 'Click "+ Register New Email ID" to grant authorization to a hospital user.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((rec) => {
                  const roleConfig = ACCESS_TYPES.find((a) => a.role === rec.accessType) || ACCESS_TYPES[1];
                  const isCurrentUser = userEmail && rec.email.toLowerCase() === userEmail.toLowerCase();
                  const isUpdating = updatingId === rec.accessId;

                  return (
                    <tr
                      key={rec.accessId}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        rec.status === 'Suspended' ? 'bg-slate-50/50 opacity-75' : ''
                      }`}
                    >
                      {/* Name & Email */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              rec.accessType === 'admin'
                                ? 'bg-amber-100 text-amber-800'
                                : rec.accessType === 'physician'
                                ? 'bg-blue-100 text-blue-800'
                                : rec.accessType === 'nurse'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {rec.fullName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{rec.fullName}</span>
                              {isCurrentUser && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-slate-500 font-mono text-[11px] flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <span>{rec.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Current Role Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border ${roleConfig.badgeClass}`}
                        >
                          {rec.accessType === 'admin' ? (
                            <Shield className="w-3 h-3" />
                          ) : (
                            <UserCheck className="w-3 h-3" />
                          )}
                          <span>{roleConfig.label}</span>
                        </span>
                      </td>

                      {/* Change Access Type Dropdown (The direct admin control requested!) */}
                      <td className="py-3.5 px-4">
                        {isAdminActive ? (
                          <div className="relative inline-block">
                            <select
                              value={rec.accessType}
                              disabled={isUpdating}
                              onChange={(e) =>
                                handleQuickChangeAccessType(rec, e.target.value as StaffRole)
                              }
                              aria-label={`Change access role for ${rec.email}`}
                              className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-md font-semibold text-slate-800 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                            >
                              <option value="admin">Admin (Tier 1)</option>
                              <option value="physician">Physician (Tier 2)</option>
                              <option value="nurse">Nurse (Tier 2)</option>
                              <option value="lab_tech">Lab Tech (Tier 2)</option>
                            </select>
                            {isUpdating && (
                              <RefreshCw className="w-3 h-3 text-blue-600 animate-spin absolute right-2 top-2 pointer-events-none" />
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>{rec.accessType}</span>
                          </span>
                        )}
                      </td>

                      {/* Department */}
                      <td className="py-3.5 px-4 text-slate-700 font-medium">
                        {rec.department}
                      </td>

                      {/* Badge ID */}
                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {rec.badgeId}
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3.5 px-4">
                        {isAdminActive ? (
                          <button
                            onClick={() => handleQuickToggleStatus(rec)}
                            disabled={isUpdating}
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border cursor-pointer transition-colors ${
                              rec.status === 'Active'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                : rec.status === 'Pending'
                                ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'
                            }`}
                            title="Click to toggle status"
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                rec.status === 'Active'
                                  ? 'bg-emerald-500'
                                  : rec.status === 'Pending'
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                              }`}
                            />
                            <span>{rec.status}</span>
                          </button>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                              rec.status === 'Active'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-red-50 text-red-800 border-red-200'
                            }`}
                          >
                            <span>{rec.status}</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        {isAdminActive ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setEditingRecord(rec)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                              title="Edit full account details"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingRecord(rec)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                              title="Revoke / Delete user access"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              recordAuditEvent(
                                `Blocked unauthorized attempt to edit ${rec.email}`,
                                rec.accessId,
                                'Restricted-Blocked'
                              )
                            }
                            className="p-1.5 text-slate-300 hover:text-slate-500 cursor-pointer"
                            title="Action requires Administrator role"
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          5. ROLE ACCESS MATRIX GUIDE FOR ADMIN REFERENCE
         ========================================================================= */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          <span>Role Permissions Reference & Security Governance</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {ACCESS_TYPES.map((a) => (
            <div key={a.role} className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">{a.label}</span>
                <span className="text-[10px] font-mono text-slate-500">{a.tier}</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">{a.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* =========================================================================
          MODAL 1: ADD NEW EMAIL ID & ACCESS TYPE
         ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5 my-8 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Register New Email ID & Access Type
                  </h3>
                  <p className="text-xs text-slate-500">
                    Grant role-based hospital access to a clinician or administrator.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick 1-Click Role Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Quick Role Presets:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleApplyPreset('admin', 'Administration', 'Hospital Administrator')
                  }
                  className="px-2 py-1.5 text-[11px] font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md text-left transition-colors cursor-pointer"
                >
                  ⚡ Admin
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleApplyPreset('physician', 'Cardiology', 'Dr. Attending Physician, MD')
                  }
                  className="px-2 py-1.5 text-[11px] font-medium text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md text-left transition-colors cursor-pointer"
                >
                  ⚡ Physician
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('nurse', 'ICU', 'Staff Nurse, RN')}
                  className="px-2 py-1.5 text-[11px] font-medium text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md text-left transition-colors cursor-pointer"
                >
                  ⚡ Nurse
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleApplyPreset('lab_tech', 'Oncology', 'Diagnostic Specialist, MLS')
                  }
                  className="px-2 py-1.5 text-[11px] font-medium text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md text-left transition-colors cursor-pointer"
                >
                  ⚡ Lab Tech
                </button>
              </div>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitNewAccess} className="space-y-4">
              {/* Email Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Registered Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="e.g., dr.smith@hospital.org or gmail address"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  The user will authenticate with this email ID to access the system under the granted role.
                </p>
              </div>

              {/* Clinician Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinician Full Name & Credentials <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  placeholder="e.g., Dr. Elena Rostova, MD"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Access Role Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Access Role Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formAccessType}
                    onChange={(e) => {
                      const r = e.target.value as StaffRole;
                      setFormAccessType(r);
                      setFormBadgeId(generateSuggestedBadge(r));
                    }}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold focus:outline-none focus:border-blue-500"
                  >
                    <option value="admin">Administrator (Tier 1 Governance)</option>
                    <option value="physician">Physician (Tier 2 Direct Care)</option>
                    <option value="nurse">Nurse (Tier 2 Bedside Care)</option>
                    <option value="lab_tech">Lab Tech (Tier 2 Diagnostic)</option>
                  </select>
                </div>

                {/* Department */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department Assignment
                  </label>
                  <select
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value as DepartmentName)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Badge ID & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hospital Badge ID
                  </label>
                  <input
                    type="text"
                    required
                    value={formBadgeId}
                    onChange={(e) => setFormBadgeId(e.target.value)}
                    placeholder="e.g., BDG-PHY-104"
                    className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Account Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as UserAccessStatus)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="Active">Active (Permitted)</option>
                    <option value="Pending">Pending Review</option>
                    <option value="Suspended">Suspended (Blocked)</option>
                  </select>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isSubmitting ? 'Registering...' : 'Authorize & Register Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: EDIT FULL DETAILS
         ========================================================================= */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5 my-8 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Edit Registered Access: {editingRecord.email}
                </h3>
                <p className="text-xs text-slate-500 font-mono-tabular">
                  Access ID: {editingRecord.accessId}
                </p>
              </div>
              <button
                onClick={() => setEditingRecord(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditDetails} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinician Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editingRecord.fullName}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, fullName: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Access Role Type
                  </label>
                  <select
                    value={editingRecord.accessType}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        accessType: e.target.value as StaffRole,
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold focus:outline-none focus:border-blue-500"
                  >
                    <option value="admin">Admin (Tier 1)</option>
                    <option value="physician">Physician (Tier 2)</option>
                    <option value="nurse">Nurse (Tier 2)</option>
                    <option value="lab_tech">Lab Tech (Tier 2)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department
                  </label>
                  <select
                    value={editingRecord.department}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        department: e.target.value as DepartmentName,
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Badge ID
                  </label>
                  <input
                    type="text"
                    required
                    value={editingRecord.badgeId}
                    onChange={(e) =>
                      setEditingRecord({ ...editingRecord, badgeId: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Account Status
                  </label>
                  <select
                    value={editingRecord.status}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        status: e.target.value as UserAccessStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="Active">Active</option>
                    <option value="Pending">Pending Review</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: CONFIRM DELETE / REVOKE
         ========================================================================= */}
      {deletingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Revoke User Access</h3>
                <p className="text-xs text-slate-500">This action will delete the authorization.</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              Are you sure you want to revoke and delete access for{' '}
              <span className="font-semibold text-slate-900">{deletingRecord.fullName}</span> (
              <span className="font-mono text-slate-900">{deletingRecord.email}</span>)? The user will no longer be able to access hospital records.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeletingRecord(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Revoking...' : 'Yes, Revoke Access'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
