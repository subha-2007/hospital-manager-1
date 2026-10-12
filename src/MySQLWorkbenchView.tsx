/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Database,
  Download,
  FileCode,
  HardDrive,
  Info,
  Layers,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Table,
  Terminal,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  PatientRecord,
  DepartmentConfig,
  StaffProfile,
  AttendanceRecord,
  ClinicalOrder,
  AuditLog,
  UserAccessRecord,
} from './types';
import {
  executeSqlStatement,
  SqlQueryResult,
  DATABASE_TABLES_SCHEMA,
} from './sqlEngine';

interface Props {
  isAdminActive: boolean;
  patients: PatientRecord[];
  departments: DepartmentConfig[];
  staffProfiles: StaffProfile[];
  attendanceRecords: AttendanceRecord[];
  orders: ClinicalOrder[];
  auditLogs: AuditLog[];
  userAccessRecords?: UserAccessRecord[];
  userUid: string;
  userDisplayName: string;
  recordAuditEvent: (action: string, targetId: string, severity?: 'Info' | 'Elevated' | 'Restricted-Blocked') => Promise<void>;
  onSwitchToAdmin?: () => void;
}

const SAMPLE_SQL_SNIPPETS = [
  {
    label: '1. SELECT Critical Patients',
    sql: "SELECT mrn, fullName, age, department, roomNumber, triageStatus, vitalSigns\nFROM patients\nWHERE triageStatus = 'Critical'\nORDER BY age DESC;",
  },
  {
    label: '2. UPDATE Patient Vitals & Acuity',
    sql: "UPDATE patients\nSET vitalSigns = 'HR 78 bpm | BP 118/76 mmHg | SpO2 99%', triageStatus = 'Stable'\nWHERE mrn = 'MRN-2026-8410';",
  },
  {
    label: '3. INSERT New Patient Admission',
    sql: "INSERT INTO patients (mrn, fullName, age, bloodType, department, roomNumber, triageStatus, diagnosisSummary, vitalSigns, clinicalNotes, insuranceStatus)\nVALUES ('MRN-2026-9042', 'Elena Voronova', 54, 'A+', 'ICU', 'ICU-12B', 'Observation', 'Post-operative monitoring after valve repair', 'HR 78 bpm | BP 122/78 mmHg | SpO2 98%', 'Hemodynamically stable', 'Verified');",
  },
  {
    label: '4. SELECT Department Bed Capacities',
    sql: "SELECT name, totalBeds, occupiedBeds, diversionStatus, budgetCode\nFROM departments\nORDER BY occupiedBeds DESC;",
  },
  {
    label: '5. UPDATE Ward Diversion Status',
    sql: "UPDATE departments\nSET diversionStatus = 'Advisory', occupiedBeds = 23\nWHERE name = 'ICU';",
  },
  {
    label: '6. SELECT On-Duty Staff Directory',
    sql: "SELECT fullName, role, department, badgeId, shift, status\nFROM staff_profiles\nWHERE status = 'On Duty';",
  },
  {
    label: '7. SELECT Today Attendance Logs',
    sql: "SELECT staffName, department, shiftDate, shiftType, attendanceStatus, hoursLogged, verifiedByAdmin\nFROM attendance_logs\nWHERE shiftDate = '2026-10-05';",
  },
  {
    label: '8. DELETE Patient (Discharged Only)',
    sql: "DELETE FROM patients\nWHERE triageStatus = 'Discharged' AND mrn = 'MRN-2026-8418';",
  },
  {
    label: '9. SHOW TABLES & SCHEMA',
    sql: 'SHOW TABLES;\n-- Or run: DESCRIBE patients;\n-- Or run: DESCRIBE user_access;',
  },
  {
    label: '10. SELECT Registered User Access & Emails',
    sql: "SELECT email, fullName, accessType, department, badgeId, status\nFROM user_access\nORDER BY accessType ASC;",
  },
];

export function MySQLWorkbenchView({
  isAdminActive,
  patients,
  departments,
  staffProfiles,
  attendanceRecords,
  orders,
  auditLogs,
  userAccessRecords = [],
  userUid,
  userDisplayName,
  recordAuditEvent,
  onSwitchToAdmin,
}: Props) {
  // Mode switcher: 'workbench' (SQL IDE) or 'visual' (Normal Guided DML Builder)
  const [workbenchMode, setWorkbenchMode] = useState<'workbench' | 'visual'>('workbench');

  // Workbench SQL Editor state
  const [sqlQuery, setSqlQuery] = useState<string>(SAMPLE_SQL_SNIPPETS[0].sql);
  const [selectedSchemaTable, setSelectedSchemaTable] = useState<string>('patients');
  const [queryResult, setQueryResult] = useState<SqlQueryResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [actionHistory, setActionHistory] = useState<SqlQueryResult[]>([]);
  const [searchGridTerm, setSearchGridTerm] = useState('');

  // Normal / Visual DML Builder state
  const [visualTable, setVisualTable] = useState<string>('patients');
  const [visualDmlType, setVisualDmlType] = useState<'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT'>('UPDATE');
  
  // Visual Form Values
  const [visualForm, setVisualForm] = useState<Record<string, string>>({
    mrn: 'MRN-2026-8410',
    triageStatus: 'Stable',
    vitalSigns: 'HR 76 bpm | BP 120/80 mmHg | SpO2 99%',
    clinicalNotes: 'Stable under observation. Vitals normalized.',
    fullName: 'David Vance',
    age: '45',
    bloodType: 'O+',
    department: 'ICU',
    roomNumber: 'ICU-08',
    diagnosisSummary: 'Post-operative observation',
    insuranceStatus: 'Verified',
  });

  // Selected Target for Update/Delete in Visual Mode
  const [visualTargetId, setVisualTargetId] = useState<string>('');

  // Initialize target record if patients exist
  useEffect(() => {
    if (patients.length > 0 && !visualTargetId) {
      setVisualTargetId(patients[0].mrn);
    }
  }, [patients, visualTargetId]);

  // Execute SQL statement inside MySQL Workbench
  async function handleExecuteQuery(sqlToRun?: string) {
    const code = (sqlToRun || sqlQuery).trim();
    if (!code) return;

    if (!isAdminActive) {
      await recordAuditEvent(
        'Blocked unauthorized attempt to execute DML query via MySQL Workbench',
        'mysql_workbench_lock',
        'Restricted-Blocked'
      );
      setQueryResult({
        success: false,
        commandType: 'UNKNOWN',
        columns: [],
        rows: [],
        message: 'Error 1142 (42000): Access denied for user. Direct DML commands are strictly restricted to Tier 1 Administrators.',
        affectedRows: 0,
        durationMs: 0,
        rawSql: code,
      });
      return;
    }

    setExecuting(true);
    try {
      const res = await executeSqlStatement(code, {
        patients,
        departments,
        staffProfiles,
        attendanceRecords,
        orders,
        auditLogs,
        userAccessRecords,
        userUid,
        userDisplayName,
        recordAuditEvent,
      });

      setQueryResult(res);
      setActionHistory((prev) => [res, ...prev.slice(0, 24)]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const failRes: SqlQueryResult = {
        success: false,
        commandType: 'UNKNOWN',
        columns: [],
        rows: [],
        message: `Error 1064 (42000): ${msg}`,
        affectedRows: 0,
        durationMs: 0,
        rawSql: code,
      };
      setQueryResult(failRes);
      setActionHistory((prev) => [failRes, ...prev.slice(0, 24)]);
    } finally {
      setExecuting(false);
    }
  }

  // Generate SQL string from the Visual DML form
  function generateVisualSql(): string {
    if (visualDmlType === 'SELECT') {
      return `SELECT * FROM ${visualTable}\nWHERE department = '${visualForm.department || 'ICU'}'\nLIMIT 25;`;
    }

    if (visualDmlType === 'INSERT') {
      if (visualTable === 'patients') {
        return `INSERT INTO patients (mrn, fullName, age, bloodType, department, roomNumber, triageStatus, diagnosisSummary, vitalSigns, clinicalNotes, insuranceStatus)\nVALUES ('${visualForm.mrn || 'MRN-2026-9999'}', '${visualForm.fullName || 'Patient Name'}', ${visualForm.age || 40}, '${visualForm.bloodType || 'O+'}', '${visualForm.department || 'ICU'}', '${visualForm.roomNumber || 'ICU-01'}', '${visualForm.triageStatus || 'Observation'}', '${visualForm.diagnosisSummary || 'Clinical diagnosis'}', '${visualForm.vitalSigns || 'HR 80 | BP 120/80'}', '${visualForm.clinicalNotes || ''}', '${visualForm.insuranceStatus || 'Verified'}');`;
      }
      if (visualTable === 'departments') {
        return `INSERT INTO departments (name, headPhysician, totalBeds, occupiedBeds, diversionStatus, budgetCode)\nVALUES ('${visualForm.department || 'ICU'}', 'Dr. Chief Clinician, MD', 30, 15, 'Normal Operations', 'CC-NEW-101');`;
      }
      if (visualTable === 'staff_profiles') {
        return `INSERT INTO staff_profiles (fullName, role, department, badgeId, shift, status)\nVALUES ('${visualForm.fullName || 'Staff Member'}', 'physician', '${visualForm.department || 'ICU'}', 'BDG-CLN-99', 'Day (07:00-19:00)', 'On Duty');`;
      }
      return `INSERT INTO ${visualTable} VALUES (...);`;
    }

    if (visualDmlType === 'UPDATE') {
      if (visualTable === 'patients') {
        const target = visualTargetId || (patients[0]?.mrn ?? 'MRN-2026-8410');
        return `UPDATE patients\nSET triageStatus = '${visualForm.triageStatus || 'Stable'}', vitalSigns = '${visualForm.vitalSigns || 'HR 75 | BP 120/80'}', clinicalNotes = '${visualForm.clinicalNotes || ''}'\nWHERE mrn = '${target}';`;
      }
      if (visualTable === 'departments') {
        return `UPDATE departments\nSET diversionStatus = 'Advisory', occupiedBeds = 25\nWHERE name = '${visualForm.department || 'ICU'}';`;
      }
      if (visualTable === 'staff_profiles') {
        return `UPDATE staff_profiles\nSET status = 'In Surgery', shift = 'On-Call'\nWHERE badgeId = 'BDG-PHY-104';`;
      }
      return `UPDATE ${visualTable} SET ... WHERE ...;`;
    }

    if (visualDmlType === 'DELETE') {
      if (visualTable === 'patients') {
        const target = visualTargetId || (patients.find((p) => p.triageStatus === 'Discharged')?.mrn ?? 'MRN-2026-8418');
        return `DELETE FROM patients\nWHERE mrn = '${target}';`;
      }
      return `DELETE FROM ${visualTable} WHERE id = '...';`;
    }

    return '';
  }

  // Execute Visual DML Form
  async function handleExecuteVisualDml() {
    const generated = generateVisualSql();
    await handleExecuteQuery(generated);
  }

  // Export Results as CSV
  function handleExportCsv() {
    if (!queryResult || queryResult.rows.length === 0) return;
    const headers = queryResult.columns.join(',');
    const rows = queryResult.rows.map((row) =>
      queryResult.columns.map((c) => `"${String(row[c] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `aegis_query_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Filtered rows for results grid
  const filteredGridRows = (queryResult?.rows || []).filter((row) => {
    if (!searchGridTerm.trim()) return true;
    const term = searchGridTerm.toLowerCase();
    return Object.values(row).some((val) => String(val ?? '').toLowerCase().includes(term));
  });

  return (
    <div className="space-y-4">
      {/* =========================================================================
          TOP BANNER: WORKBENCH STATUS & MODE TOGGLE
         ========================================================================= */}
      <div className="bg-slate-900 text-slate-100 rounded-xl p-4 shadow-sm border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-inner shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>MySQL Workbench 8.0 Studio</span>
                  <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    Hospital DML Engine
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-tabular">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Connected: localhost:3306
                </span>
                <span>Database: <strong className="text-slate-200">aegis_hospital_db</strong></span>
                <span>
                  Active Role: {isAdminActive ? (
                    <strong className="text-amber-400">root@localhost (Tier 1 Admin)</strong>
                  ) : (
                    <strong className="text-red-400">guest_clinician (Tier 2 - DML Locked)</strong>
                  )}
                </span>
              </p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setWorkbenchMode('workbench')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                workbenchMode === 'workbench'
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              MySQL Workbench SQL IDE
            </button>
            <button
              onClick={() => setWorkbenchMode('visual')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                workbenchMode === 'visual'
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              Visual DML Command Center (Normal Guided)
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          RBAC LOCK GATE: IF NOT ADMIN, DISPLAY ENFORCED RESTRICTION
         ========================================================================= */}
      {!isAdminActive ? (
        <div className="bg-white border border-red-200 rounded-xl p-8 shadow-sm space-y-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-red-100 text-red-700 rounded-xl shrink-0">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-800 border border-red-300">
                <Lock className="w-3 h-3" />
                RBAC Access Denied · Tier 1 Administrator Privilege Required
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Direct DML Command Execution & MySQL Workbench are Restricted to Admins
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
                Under Hospital Security Architecture and HIPAA Security Rule Title 45 CFR Part 164, raw
                database manipulation through Data Manipulation Language (DML) commands (<code className="px-1 py-0.5 bg-slate-100 rounded text-red-700 font-mono text-xs">INSERT</code>,{' '}
                <code className="px-1 py-0.5 bg-slate-100 rounded text-red-700 font-mono text-xs">UPDATE</code>,{' '}
                <code className="px-1 py-0.5 bg-slate-100 rounded text-red-700 font-mono text-xs">DELETE</code>)
                is strictly prohibited for Regular Medical Staff. Only authenticated Hospital Administrators
                holding Tier 1 Governance rights can execute direct database commands.
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-700 space-y-1">
              <p className="font-semibold text-slate-900">How to test MySQL Workbench & DML as an Admin:</p>
              <p className="text-slate-600">
                Switch to <span className="font-semibold text-slate-900">Admin Mode (Tier 1)</span> in the top header role selector to unlock the MySQL Workbench SQL IDE and Visual DML Builder.
              </p>
            </div>
            {onSwitchToAdmin && (
              <button
                onClick={onSwitchToAdmin}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer shrink-0"
              >
                Switch to Tier 1 Admin Mode
              </button>
            )}
          </div>
        </div>
      ) : (
        /* =======================================================================
            ADMIN UNLOCKED: RENDER CHOSEN WORKBENCH MODE
           ======================================================================= */
        <div>
          {workbenchMode === 'workbench' ? (
            /* -------------------------------------------------------------------
                MODE 1: FULL MYSQL WORKBENCH SQL IDE
               ------------------------------------------------------------------- */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left Sidebar: Schemas Navigator & Snippets */}
              <div className="lg:col-span-3 space-y-4">
                {/* Schemas / Tables Tree */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-3.5 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-blue-600" />
                      Schemas: aegis_hospital_db
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono-tabular">6 Tables</span>
                  </div>

                  <div className="p-2 space-y-1 text-xs">
                    {Object.entries(DATABASE_TABLES_SCHEMA).map(([tbl, cols]) => (
                      <div key={tbl} className="rounded border border-transparent hover:border-slate-200">
                        <button
                          onClick={() => {
                            setSelectedSchemaTable(tbl);
                            setSqlQuery(`SELECT * FROM ${tbl} LIMIT 25;`);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between cursor-pointer transition-colors ${
                            selectedSchemaTable === tbl
                              ? 'bg-blue-50 text-blue-900 font-semibold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <Table className="w-3.5 h-3.5 text-slate-500" />
                            {tbl}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono-tabular">
                            {cols.length} cols
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Columns Inspector for Selected Table */}
                  <div className="p-3 bg-slate-50/70 border-t border-slate-200 text-xs">
                    <div className="font-semibold text-slate-800 mb-2 flex items-center justify-between">
                      <span>Columns in `{selectedSchemaTable}`:</span>
                      <button
                        onClick={() => setSqlQuery(`DESCRIBE ${selectedSchemaTable};`)}
                        className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                      >
                        Run DESCRIBE
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1 font-mono-tabular text-[11px]">
                      {DATABASE_TABLES_SCHEMA[selectedSchemaTable]?.map((col) => (
                        <div
                          key={col.field}
                          className="flex items-center justify-between p-1 rounded bg-white border border-slate-200/80"
                        >
                          <span className="font-medium text-slate-900">{col.field}</span>
                          <span className="text-slate-500 text-[10px]">{col.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quick SQL Snippets Palette */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-3.5 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-blue-600" />
                      SQL Snippet Templates
                    </span>
                  </div>
                  <div className="p-2 space-y-1">
                    {SAMPLE_SQL_SNIPPETS.map((snip, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSqlQuery(snip.sql)}
                        className="w-full text-left px-2.5 py-1.5 rounded text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-700 transition-colors flex items-center justify-between group cursor-pointer"
                      >
                        <span className="truncate">{snip.label}</span>
                        <Play className="w-3 h-3 text-slate-400 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Main SQL Editor & Results Area */}
              <div className="lg:col-span-9 space-y-4">
                {/* Query Editor Box */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  {/* Editor Header Bar with Execution Controls */}
                  <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-white border border-slate-200 rounded text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Code2 className="w-3.5 h-3.5 text-blue-600" />
                        SQL Query 1
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSqlQuery('')}
                        className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                        title="Clear SQL Editor"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(sqlQuery);
                        }}
                        className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-1"
                        title="Copy SQL to Clipboard"
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </button>
                      <button
                        onClick={() => handleExecuteQuery()}
                        disabled={executing || !sqlQuery.trim()}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded shadow-sm transition-all cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        {executing ? 'Executing...' : 'Execute (Ctrl+Enter)'}
                      </button>
                    </div>
                  </div>

                  {/* Monaco-Style Text Area */}
                  <div className="relative bg-slate-950 text-slate-100 font-mono text-xs">
                    <div className="flex">
                      {/* Line Number Counter */}
                      <div className="py-3 px-2 text-right bg-slate-900 text-slate-600 select-none font-mono text-xs w-10 shrink-0">
                        {sqlQuery.split('\n').map((_, i) => (
                          <div key={i}>{i + 1}</div>
                        ))}
                      </div>
                      {/* Text Input */}
                      <textarea
                        value={sqlQuery}
                        onChange={(e) => setSqlQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault();
                            handleExecuteQuery();
                          }
                        }}
                        rows={8}
                        placeholder="Enter SQL statement (e.g. SELECT * FROM patients; INSERT INTO ...; UPDATE ... SET ... WHERE ...;)"
                        className="w-full py-3 px-3 bg-transparent text-emerald-400 placeholder:text-slate-600 focus:outline-none resize-y font-mono leading-relaxed selection:bg-blue-600 selection:text-white"
                      />
                    </div>
                  </div>

                  {/* Quick Tip Footer */}
                  <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
                    <span>Press <kbd className="px-1 py-0.5 bg-slate-200 rounded text-slate-700 font-mono">Ctrl+Enter</kbd> to execute statement directly against live Firestore database.</span>
                    <span className="font-mono-tabular">Safe DML Guard Active</span>
                  </div>
                </div>

                {/* Output Panes: Result Grid & Action Output */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm space-y-0">
                  {/* Result Header & Export Toolbar */}
                  <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Table className="w-4 h-4 text-blue-600" />
                        Result Grid
                      </span>
                      {queryResult && (
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                            queryResult.success
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {queryResult.message}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={searchGridTerm}
                          onChange={(e) => setSearchGridTerm(e.target.value)}
                          placeholder="Filter results..."
                          className="pl-8 pr-3 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:border-slate-400 w-40 sm:w-52"
                        />
                      </div>
                      <button
                        onClick={handleExportCsv}
                        disabled={!queryResult || queryResult.rows.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        Export CSV
                      </button>
                    </div>
                  </div>

                  {/* Result Table Container */}
                  <div className="max-h-96 overflow-x-auto overflow-y-auto">
                    {queryResult && queryResult.columns.length > 0 ? (
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0 z-10 font-mono-tabular">
                            <th className="py-2.5 px-3 w-12 text-slate-400 border-r border-slate-200">#</th>
                            {queryResult.columns.map((col) => (
                              <th key={col} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono-tabular">
                          {filteredGridRows.length > 0 ? (
                            filteredGridRows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                                <td className="py-2 px-3 text-slate-400 border-r border-slate-200 bg-slate-50/50">
                                  {idx + 1}
                                </td>
                                {queryResult.columns.map((col) => {
                                  const cellVal = row[col];
                                  return (
                                    <td
                                      key={col}
                                      className="py-2 px-3 border-r border-slate-200 whitespace-nowrap text-slate-800"
                                    >
                                      {cellVal === null || cellVal === undefined ? (
                                        <span className="text-slate-400 italic">NULL</span>
                                      ) : typeof cellVal === 'boolean' ? (
                                        cellVal ? 'TRUE' : 'FALSE'
                                      ) : (
                                        String(cellVal)
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={queryResult.columns.length + 1}
                                className="py-8 text-center text-slate-500 italic"
                              >
                                No matching rows found in query result set.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    ) : (
                      <div className="py-12 text-center text-slate-400 text-xs">
                        {queryResult ? (
                          <div className="space-y-1">
                            <p className="font-semibold text-slate-700">{queryResult.message}</p>
                            <p className="text-[11px]">Command executed successfully against Firestore cluster.</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Database className="w-8 h-8 text-slate-300 mx-auto" />
                            <p>No query executed yet. Write or select a SQL statement above and click Execute.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Classic MySQL Workbench Bottom "Action Output" Log */}
                  <div className="border-t border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-slate-500" />
                        Action Output Log
                      </span>
                      <span className="text-slate-400 font-normal">{actionHistory.length} events logged</span>
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1.5 font-mono text-xs">
                      {actionHistory.length > 0 ? (
                        actionHistory.map((hist, idx) => (
                          <div
                            key={idx}
                            className={`p-2 rounded border flex items-start justify-between gap-3 text-[11px] ${
                              hist.success
                                ? 'bg-white border-emerald-200 text-slate-800'
                                : 'bg-red-50/60 border-red-200 text-red-900'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {hist.success ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                              )}
                              <div>
                                <div className="font-bold">
                                  {hist.commandType} · {hist.message}
                                </div>
                                <div className="text-[10px] text-slate-500 truncate max-w-xl">
                                  {hist.rawSql}
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0 font-mono-tabular">
                              {hist.durationMs}ms
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-400 italic text-[11px]">
                          Action logs will appear here after statements are executed.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* -------------------------------------------------------------------
                MODE 2: VISUAL DML COMMAND CENTER ("Normal Way of Performing DML")
               ------------------------------------------------------------------- */
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                    <Wrench className="w-3 h-3" />
                    Guided DML Operation Studio
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">
                    Normal Way of Performing DML Commands (Admin Visual Builder)
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Execute structured INSERT, UPDATE, DELETE, and SELECT operations through an interactive form interface without writing raw SQL. The platform validates constraints, generates standard SQL, and executes changes with real-time audit logging.
                  </p>
                </div>

                {/* Step 1: Select Target Table & Operation Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      1. Target Database Table
                    </label>
                    <select
                      value={visualTable}
                      onChange={(e) => setVisualTable(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 font-medium"
                    >
                      <option value="patients">patients (Admissions, Clinical Vitals, Demographics)</option>
                      <option value="departments">departments (Ward Bed Allocations, Diversion Status)</option>
                      <option value="staff_profiles">staff_profiles (Clinician Directory, Assigned Roles)</option>
                      <option value="attendance_logs">attendance_logs (Shift Check-Ins, Verification)</option>
                      <option value="user_access">user_access (Registered Email Accounts & Roles)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      2. DML Command Operation
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setVisualDmlType('UPDATE')}
                        className={`py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                          visualDmlType === 'UPDATE'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        UPDATE
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisualDmlType('INSERT')}
                        className={`py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                          visualDmlType === 'INSERT'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        INSERT
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisualDmlType('DELETE')}
                        className={`py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                          visualDmlType === 'DELETE'
                            ? 'bg-red-600 text-white border-red-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        DELETE
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisualDmlType('SELECT')}
                        className={`py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                          visualDmlType === 'SELECT'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        SELECT
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 2: Dynamic Form Fields based on Operation & Table */}
                <div className="space-y-4">
                  {/* UPDATE or DELETE Target Record Selector */}
                  {(visualDmlType === 'UPDATE' || visualDmlType === 'DELETE') && visualTable === 'patients' && (
                    <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-lg space-y-2">
                      <label className="block text-xs font-bold text-amber-900">
                        Target Patient Record (WHERE mrn = ?)
                      </label>
                      <select
                        value={visualTargetId}
                        onChange={(e) => {
                          setVisualTargetId(e.target.value);
                          const pat = patients.find((p) => p.mrn === e.target.value);
                          if (pat) {
                            setVisualForm((prev) => ({
                              ...prev,
                              triageStatus: pat.triageStatus,
                              vitalSigns: pat.vitalSigns,
                              clinicalNotes: pat.clinicalNotes,
                              department: pat.department,
                              insuranceStatus: pat.insuranceStatus,
                            }));
                          }
                        }}
                        className="w-full px-3 py-2 text-xs bg-white border border-amber-300 rounded-md font-mono"
                      >
                        {patients.map((p) => (
                          <option key={p.patientId} value={p.mrn}>
                            {p.mrn} — {p.fullName} ({p.department} · {p.triageStatus})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Form fields for INSERT or UPDATE */}
                  {(visualDmlType === 'INSERT' || visualDmlType === 'UPDATE') && (
                    <div className="space-y-4 border border-slate-200 rounded-lg p-4">
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Field Assignments ({visualDmlType === 'INSERT' ? 'VALUES' : 'SET Clause'})
                      </h3>

                      {visualTable === 'patients' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                          {visualDmlType === 'INSERT' && (
                            <>
                              <div>
                                <label className="block text-slate-600 mb-1 font-medium">MRN Code</label>
                                <input
                                  type="text"
                                  value={visualForm.mrn || ''}
                                  onChange={(e) => setVisualForm({ ...visualForm, mrn: e.target.value })}
                                  className="w-full px-3 py-1.5 border border-slate-300 rounded"
                                />
                              </div>
                              <div>
                                <label className="block text-slate-600 mb-1 font-medium">Full Name</label>
                                <input
                                  type="text"
                                  value={visualForm.fullName || ''}
                                  onChange={(e) => setVisualForm({ ...visualForm, fullName: e.target.value })}
                                  className="w-full px-3 py-1.5 border border-slate-300 rounded"
                                />
                              </div>
                              <div>
                                <label className="block text-slate-600 mb-1 font-medium">Age</label>
                                <input
                                  type="number"
                                  value={visualForm.age || '45'}
                                  onChange={(e) => setVisualForm({ ...visualForm, age: e.target.value })}
                                  className="w-full px-3 py-1.5 border border-slate-300 rounded"
                                />
                              </div>
                            </>
                          )}

                          <div>
                            <label className="block text-slate-600 mb-1 font-medium">Triage Acuity</label>
                            <select
                              value={visualForm.triageStatus || 'Observation'}
                              onChange={(e) => setVisualForm({ ...visualForm, triageStatus: e.target.value })}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                            >
                              <option value="Critical">Critical</option>
                              <option value="Observation">Observation</option>
                              <option value="Stable">Stable</option>
                              <option value="Discharged">Discharged</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-slate-600 mb-1 font-medium">Clinical Ward</label>
                            <select
                              value={visualForm.department || 'ICU'}
                              onChange={(e) => setVisualForm({ ...visualForm, department: e.target.value })}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                            >
                              <option value="ICU">ICU</option>
                              <option value="Cardiology">Cardiology</option>
                              <option value="Emergency">Emergency</option>
                              <option value="Neurology">Neurology</option>
                              <option value="Oncology">Oncology</option>
                              <option value="Pediatrics">Pediatrics</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-slate-600 mb-1 font-medium">Insurance Status</label>
                            <select
                              value={visualForm.insuranceStatus || 'Verified'}
                              onChange={(e) => setVisualForm({ ...visualForm, insuranceStatus: e.target.value })}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                            >
                              <option value="Verified">Verified</option>
                              <option value="Pending Review">Pending Review</option>
                              <option value="Self-Pay">Self-Pay</option>
                              <option value="Gov-Coverage">Gov-Coverage</option>
                            </select>
                          </div>

                          <div className="sm:col-span-2 md:col-span-3">
                            <label className="block text-slate-600 mb-1 font-medium">Vital Signs Telemetry</label>
                            <input
                              type="text"
                              value={visualForm.vitalSigns || ''}
                              onChange={(e) => setVisualForm({ ...visualForm, vitalSigns: e.target.value })}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-xs"
                            />
                          </div>

                          <div className="sm:col-span-2 md:col-span-3">
                            <label className="block text-slate-600 mb-1 font-medium">Clinical Notes / Handover</label>
                            <textarea
                              rows={2}
                              value={visualForm.clinicalNotes || ''}
                              onChange={(e) => setVisualForm({ ...visualForm, clinicalNotes: e.target.value })}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                            />
                          </div>
                        </div>
                      )}

                      {visualTable === 'departments' && (
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block text-slate-600 mb-1 font-medium">Ward</label>
                            <select
                              value={visualForm.department || 'ICU'}
                              onChange={(e) => setVisualForm({ ...visualForm, department: e.target.value })}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                            >
                              <option value="ICU">ICU</option>
                              <option value="Cardiology">Cardiology</option>
                              <option value="Emergency">Emergency</option>
                              <option value="Neurology">Neurology</option>
                              <option value="Oncology">Oncology</option>
                              <option value="Pediatrics">Pediatrics</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-slate-600 mb-1 font-medium">Diversion Status</label>
                            <select
                              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                              defaultValue="Normal Operations"
                            >
                              <option value="Normal Operations">Normal Operations</option>
                              <option value="Advisory">Advisory</option>
                              <option value="Critical Capacity">Critical Capacity</option>
                              <option value="Diversion">Diversion</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {visualDmlType === 'DELETE' && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 space-y-2">
                      <div className="flex items-center gap-2 font-bold text-red-800">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        Warning: Destructive DML Operation
                      </div>
                      <p>
                        Executing this command will permanently remove the record from the live Firestore database. An immutable security audit log entry will be generated automatically.
                      </p>
                    </div>
                  )}
                </div>

                {/* Step 3: Live Generated SQL Preview Box */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-blue-600" />
                      Live Generated SQL Statement (Preview)
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono-tabular">Standard ANSI SQL</span>
                  </div>

                  <div className="p-3 bg-slate-900 text-emerald-400 rounded-lg font-mono text-xs overflow-x-auto border border-slate-800 leading-relaxed">
                    {generateVisualSql()}
                  </div>
                </div>

                {/* Step 4: Execute DML Action */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                  <div className="text-xs text-slate-500">
                    Operation validated against RBAC Tier 1 permissions.
                  </div>
                  <button
                    onClick={handleExecuteVisualDml}
                    disabled={executing}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white rounded-lg shadow-sm transition-all cursor-pointer ${
                      visualDmlType === 'DELETE'
                        ? 'bg-red-600 hover:bg-red-700'
                        : visualDmlType === 'UPDATE'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    {executing ? 'Executing DML...' : `Execute ${visualDmlType} Command`}
                  </button>
                </div>
              </div>

              {/* Execution Feedback in Visual Mode */}
              {queryResult && (
                <div
                  className={`p-4 rounded-xl border flex items-start gap-3 text-xs ${
                    queryResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  {queryResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                  )}
                  <div>
                    <h4 className="font-bold">{queryResult.message}</h4>
                    <p className="mt-1 font-mono text-[11px] text-slate-700">{queryResult.rawSql}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
