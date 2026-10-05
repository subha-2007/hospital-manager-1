import React, { useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  AttendanceRecord,
  AttendanceStatus,
  DepartmentName,
  PatientRecord,
  ShiftType,
  StaffProfile,
} from './types';

interface Props {
  userUid: string;
  userDisplayName: string;
  isAdminActive: boolean;
  attendanceRecords: AttendanceRecord[];
  patients: PatientRecord[];
  staffProfiles: StaffProfile[];
  onCheckInShift: (data: {
    shiftDate: string;
    shiftType: ShiftType;
    department: DepartmentName;
    attendanceStatus: AttendanceStatus;
    clockInNote: string;
    hoursLogged: number;
  }) => Promise<void>;
  onUpdateAttendance: (
    record: AttendanceRecord,
    updates: {
      attendanceStatus?: AttendanceStatus;
      clockInNote?: string;
      hoursLogged?: number;
      verifiedByAdmin?: boolean;
    }
  ) => Promise<void>;
  onSelectPatientForCare: (patient: PatientRecord) => void;
  onSelectPatientOrders: (patientId: string) => void;
  onSimulateBlocked: (desc: string, targetId: string) => Promise<void>;
}

const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  'Present - Checked In',
  'Completed Shift',
  'Late Arrival',
  'On Leave',
];

const SHIFT_TYPES: ShiftType[] = ['Day (07:00-19:00)', 'Night (19:00-07:00)', 'On-Call'];

export function AttendanceAndCaseloadView({
  userUid,
  userDisplayName,
  isAdminActive,
  attendanceRecords,
  patients,
  staffProfiles,
  onCheckInShift,
  onUpdateAttendance,
  onSelectPatientForCare,
  onSelectPatientOrders,
  onSimulateBlocked,
}: Props) {
  const [showCheckInForm, setShowCheckInForm] = useState(false);

  // Compute personal medical staff metrics
  const myAttendance = attendanceRecords.filter((a) => a.staffUid === userUid);
  const myAssignedPatients = patients.filter((p) => p.assignedStaffId === userUid);
  const myActivePatients = myAssignedPatients.filter((p) => p.triageStatus !== 'Discharged');
  const myCriticalPatients = myAssignedPatients.filter((p) => p.triageStatus === 'Critical');

  const totalHoursLogged = myAttendance.reduce((sum, r) => sum + r.hoursLogged, 0);
  const presentShiftsCount = myAttendance.filter(
    (r) => r.attendanceStatus === 'Present - Checked In' || r.attendanceStatus === 'Completed Shift'
  ).length;
  const attendanceRate =
    myAttendance.length > 0 ? Math.round((presentShiftsCount / myAttendance.length) * 100) : 100;

  const todayRecord = myAttendance.find((r) => r.shiftDate === '2026-10-05') || myAttendance[0];

  async function handleSubmitCheckIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await onCheckInShift({
      shiftDate: String(fd.get('shiftDate') || '2026-10-05'),
      shiftType: (fd.get('shiftType') as ShiftType) || 'Day (07:00-19:00)',
      department: (fd.get('department') as DepartmentName) || 'ICU',
      attendanceStatus: (fd.get('attendanceStatus') as AttendanceStatus) || 'Present - Checked In',
      clockInNote: String(fd.get('clockInNote') || 'Checked in on time for clinical rounds'),
      hoursLogged: Number(fd.get('hoursLogged') || 8),
    });
    setShowCheckInForm(false);
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Medical Staff Personal Attendance & Caseload Summary Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="text-xs text-slate-500">
              <span>Clinician Attendance & Assigned Patient Roster</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span>{userDisplayName}</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 mt-1">
              {isAdminActive
                ? 'Hospital-Wide Staff Attendance & Clinician Caseload Distribution (Admin View)'
                : 'My Shift Attendance & Patients Under My Care (Medical Staff View)'}
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            {todayRecord && todayRecord.attendanceStatus === 'Present - Checked In' && !todayRecord.verifiedByAdmin && (
              <button
                onClick={() =>
                  onUpdateAttendance(todayRecord, {
                    attendanceStatus: 'Completed Shift',
                    hoursLogged: 12,
                    clockInNote: `${todayRecord.clockInNote} · Shift completed (12.0h)`,
                  })
                }
                className="px-3.5 py-2 text-xs font-semibold text-emerald-900 bg-emerald-100 rounded-lg hover:bg-emerald-200 transition-colors cursor-pointer"
              >
                Complete Current Shift (Log 12h)
              </button>
            )}
            <button
              onClick={() => setShowCheckInForm(!showCheckInForm)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Log Shift Check-In
            </button>
          </div>
        </div>

        {/* 4-Column Clinician Attendance & Patient Load Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-xs text-slate-500">My Shift Status Today</div>
            <div className="text-sm font-bold text-slate-900 mt-1.5">
              {todayRecord ? todayRecord.attendanceStatus : 'Not Checked In'}
            </div>
            <div className="text-[11px] text-slate-500 font-mono-tabular mt-1">
              {todayRecord ? `${todayRecord.shiftDate} · ${todayRecord.shiftType}` : 'Log shift check-in above'}
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-xs text-slate-500">My Attendance Rate & Hours</div>
            <div className="text-xl font-bold text-emerald-700 font-mono-tabular mt-1">
              {attendanceRate}% Present
            </div>
            <div className="text-[11px] text-slate-500 font-mono-tabular mt-1">
              {totalHoursLogged.toFixed(1)} hrs logged across {myAttendance.length} shifts
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-xs text-slate-500">Patients Assigned Under Me</div>
            <div className="text-xl font-bold text-slate-900 font-mono-tabular mt-1">
              {myAssignedPatients.length} Total ({myActivePatients.length} Active)
            </div>
            <div className="text-[11px] text-slate-500 font-mono-tabular mt-1">
              {myCriticalPatients.length} Critical Acuity ·{' '}
              {myAssignedPatients.length - myActivePatients.length} Discharged
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-xs text-slate-500">Admin Verification Status</div>
            <div className="text-sm font-bold text-slate-900 mt-1.5">
              {myAttendance.filter((a) => a.verifiedByAdmin).length} / {myAttendance.length} Verified
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Verified shifts are locked from Tier 2 edits
            </div>
          </div>
        </div>

        {/* Optional New Shift Check-In Form */}
        {showCheckInForm && (
          <form
            onSubmit={handleSubmitCheckIn}
            className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
          >
            <div className="text-xs font-semibold text-slate-900">
              Record Shift Check-In & Attendance Entry
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Shift Date (YYYY-MM-DD)
                </label>
                <input
                  name="shiftDate"
                  defaultValue="2026-10-05"
                  pattern="^[0-9\-]+$"
                  required
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Shift Window
                </label>
                <select
                  name="shiftType"
                  defaultValue="Day (07:00-19:00)"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                >
                  {SHIFT_TYPES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Clinical Ward
                </label>
                <select
                  name="department"
                  defaultValue="ICU"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                >
                  {['ICU', 'Cardiology', 'Emergency', 'Neurology', 'Oncology', 'Pediatrics'].map(
                    (d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Hours Logged
                </label>
                <input
                  name="hoursLogged"
                  type="number"
                  step="0.5"
                  min={0}
                  max={24}
                  defaultValue={8}
                  required
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md font-mono-tabular"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Attendance Status
                </label>
                <select
                  name="attendanceStatus"
                  defaultValue="Present - Checked In"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                >
                  {ATTENDANCE_STATUSES.map((as) => (
                    <option key={as} value={as}>
                      {as}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Clock-In & Handover Note
                </label>
                <input
                  name="clockInNote"
                  defaultValue="Clocked in for ward rounds; reviewed telemetry for assigned patients"
                  required
                  minLength={2}
                  maxLength={160}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCheckInForm(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md cursor-pointer"
              >
                Save Attendance Log
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Section 2: Split View — Left: Patients Under My Care | Right: Attendance Log History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): Patients Assigned Under This Medical Staff Member */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Patients Under My Care ({myAssignedPatients.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Direct clinical responsibility (<span className="font-mono-tabular">assignedStaffId == auth.uid</span>)
              </p>
            </div>
          </div>

          {myAssignedPatients.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No patients currently assigned to you. Click &ldquo;Seed Sample Hospital Database&rdquo; to
              populate your assigned caseload.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {myAssignedPatients.map((pat) => {
                const isDischarged = pat.triageStatus === 'Discharged';
                return (
                  <div key={pat.patientId} className="p-4 space-y-2 hover:bg-slate-50/80">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-mono-tabular text-slate-500">
                          <span>{pat.mrn}</span>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span>{pat.department}</span>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span>Room {pat.roomNumber}</span>
                        </div>
                        <div className="text-sm font-bold text-slate-900 mt-0.5">
                          {pat.fullName}{' '}
                          <span className="text-xs font-normal text-slate-500 font-mono-tabular">
                            ({pat.age}y · {pat.bloodType})
                          </span>
                        </div>
                      </div>

                      <span
                        className={`text-xs font-semibold ${
                          pat.triageStatus === 'Critical'
                            ? 'text-red-600'
                            : pat.triageStatus === 'Observation'
                            ? 'text-amber-600'
                            : pat.triageStatus === 'Stable'
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {pat.triageStatus}
                      </span>
                    </div>

                    <div className="text-xs font-mono-tabular text-slate-800 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200/80">
                      {pat.vitalSigns}
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-2">{pat.diagnosisSummary}</p>

                    <div className="pt-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500">
                        Billing: {pat.insuranceStatus}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onSelectPatientOrders(pat.patientId)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 cursor-pointer"
                        >
                          Clinical Orders
                        </button>
                        <button
                          onClick={() => onSelectPatientForCare(pat)}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 cursor-pointer"
                        >
                          {isDischarged && !isAdminActive ? 'View Chart (Locked)' : 'Update Care'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* If Admin is active, also show Caseload Summary Across Other Clinicians */}
          {isAdminActive && staffProfiles.length > 0 && (
            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2">
              <div className="text-xs font-semibold text-slate-900">
                Hospital-Wide Clinician Caseload Breakdown (Admin Only)
              </div>
              <div className="space-y-1.5 text-xs">
                {staffProfiles.map((sp) => {
                  const count = patients.filter(
                    (p) =>
                      p.assignedStaffId === sp.staffId ||
                      (sp.badgeId === 'BDG-CLN-001' && p.assignedStaffId === userUid)
                  ).length;
                  return (
                    <div
                      key={sp.staffId}
                      className="flex items-center justify-between text-slate-700"
                    >
                      <span>
                        {sp.fullName} <span className="text-slate-400">· {sp.department}</span>
                      </span>
                      <span className="font-mono-tabular font-semibold text-slate-900">
                        {count} {count === 1 ? 'patient' : 'patients'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (7 cols): Attendance Log Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {isAdminActive
                  ? 'All Hospital Staff Shift Attendance Logs (Admin Governance)'
                  : 'My Shift Attendance & Timecard History'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAdminActive
                  ? 'Tier 1 Administrators can verify & lock shift logs or adjust attendance status across all staff.'
                  : 'Tier 2 Medical Staff can update their own unverified shift status and hours. Admin-verified logs are locked.'}
              </p>
            </div>
            <span className="text-xs font-mono-tabular text-slate-500">
              {attendanceRecords.length} Records
            </span>
          </div>

          {attendanceRecords.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No attendance logs found. Click &ldquo;Seed Sample Hospital Database&rdquo; or &ldquo;Log Shift
              Check-In&rdquo; above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">Date & Shift</th>
                    <th className="py-3 px-4">Clinician & Ward</th>
                    <th className="py-3 px-4">Attendance Status</th>
                    <th className="py-3 px-4 text-right">Hours</th>
                    <th className="py-3 px-4 text-right">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {attendanceRecords.map((rec) => {
                    const isLockedForStaff = !isAdminActive && rec.verifiedByAdmin;
                    return (
                      <tr key={rec.attendanceId} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 align-top">
                          <div className="font-mono-tabular font-semibold text-slate-900">
                            {rec.shiftDate}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{rec.shiftType}</div>
                        </td>

                        <td className="py-3 px-4 align-top">
                          <div className="font-semibold text-slate-900">{rec.staffName}</div>
                          <div className="text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                            {rec.badgeId} · {rec.department}
                          </div>
                          <div className="text-[11px] text-slate-600 mt-1">{rec.clockInNote}</div>
                        </td>

                        <td className="py-3 px-4 align-top">
                          <select
                            value={rec.attendanceStatus}
                            disabled={isLockedForStaff}
                            onChange={(e) =>
                              onUpdateAttendance(rec, {
                                attendanceStatus: e.target.value as AttendanceStatus,
                              })
                            }
                            aria-label="Attendance Status"
                            className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-md font-medium text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                          >
                            {ATTENDANCE_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3 px-4 align-top text-right font-mono-tabular">
                          <span className="font-semibold text-slate-900">
                            {rec.hoursLogged.toFixed(1)}h
                          </span>
                        </td>

                        <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                          {isAdminActive ? (
                            <button
                              onClick={() =>
                                onUpdateAttendance(rec, {
                                  verifiedByAdmin: !rec.verifiedByAdmin,
                                })
                              }
                              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                                rec.verifiedByAdmin
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-900 text-white hover:bg-slate-800'
                              }`}
                            >
                              {rec.verifiedByAdmin ? 'Verified (Unlock)' : 'Verify & Lock'}
                            </button>
                          ) : rec.verifiedByAdmin ? (
                            <button
                              onClick={() =>
                                onSimulateBlocked(
                                  `Modify admin-verified attendance record ${rec.attendanceId}`,
                                  rec.attendanceId
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-500 bg-slate-100 rounded-md cursor-pointer"
                              title="Admin-verified attendance records cannot be altered by Medical Staff"
                            >
                              <Lock className="w-3 h-3" />
                              Verified Locked
                            </button>
                          ) : (
                            <span className="text-[11px] text-amber-700 font-medium">
                              Pending Admin Sign-Off
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
