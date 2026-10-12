/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, sanitizeId, clampString } from './firebase';
import {
  PatientRecord,
  DepartmentConfig,
  StaffProfile,
  AttendanceRecord,
  ClinicalOrder,
  AuditLog,
} from './types';

export interface SqlQueryResult {
  success: boolean;
  commandType: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'SHOW' | 'DESCRIBE' | 'EXPLAIN' | 'UNKNOWN';
  table?: string;
  columns: string[];
  rows: Record<string, unknown>[];
  message: string;
  affectedRows: number;
  durationMs: number;
  rawSql: string;
}

export interface TableSchemaColumn {
  field: string;
  type: string;
  nullable: boolean;
  key: string;
  default: string;
  extra: string;
}

export const DATABASE_TABLES_SCHEMA: Record<string, TableSchemaColumn[]> = {
  patients: [
    { field: 'patientId', type: 'VARCHAR(128)', nullable: false, key: 'PRI', default: 'UUID', extra: 'auto_gen' },
    { field: 'mrn', type: 'VARCHAR(32)', nullable: false, key: 'UNI', default: 'None', extra: '' },
    { field: 'fullName', type: 'VARCHAR(100)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'age', type: 'INT', nullable: false, key: '', default: '0', extra: '' },
    { field: 'bloodType', type: 'ENUM(A+,A-,B+,B-,AB+,AB-,O+,O-)', nullable: false, key: '', default: 'O+', extra: '' },
    { field: 'department', type: 'ENUM(ICU,Cardiology,Emergency,Neurology,Oncology,Pediatrics)', nullable: false, key: '', default: 'ICU', extra: '' },
    { field: 'roomNumber', type: 'VARCHAR(20)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'triageStatus', type: 'ENUM(Critical,Observation,Stable,Discharged)', nullable: false, key: '', default: 'Observation', extra: '' },
    { field: 'diagnosisSummary', type: 'VARCHAR(500)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'vitalSigns', type: 'VARCHAR(200)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'clinicalNotes', type: 'TEXT(1000)', nullable: false, key: '', default: '', extra: '' },
    { field: 'insuranceStatus', type: 'ENUM(Verified,Pending Review,Self-Pay,Gov-Coverage)', nullable: false, key: '', default: 'Verified', extra: '' },
    { field: 'assignedStaffId', type: 'VARCHAR(128)', nullable: false, key: 'MUL', default: 'None', extra: '' },
    { field: 'assignedStaffName', type: 'VARCHAR(100)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'createdBy', type: 'VARCHAR(128)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'createdAt', type: 'TIMESTAMP', nullable: false, key: '', default: 'CURRENT_TIMESTAMP', extra: '' },
    { field: 'updatedAt', type: 'TIMESTAMP', nullable: false, key: '', default: 'CURRENT_TIMESTAMP', extra: 'on update' },
  ],
  departments: [
    { field: 'deptId', type: 'VARCHAR(128)', nullable: false, key: 'PRI', default: 'UUID', extra: '' },
    { field: 'name', type: 'ENUM(ICU,Cardiology,Emergency,Neurology,Oncology,Pediatrics)', nullable: false, key: 'UNI', default: 'ICU', extra: '' },
    { field: 'headPhysician', type: 'VARCHAR(100)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'totalBeds', type: 'INT', nullable: false, key: '', default: '30', extra: '' },
    { field: 'occupiedBeds', type: 'INT', nullable: false, key: '', default: '0', extra: '' },
    { field: 'diversionStatus', type: 'ENUM(Normal Operations,Advisory,Critical Capacity,Diversion)', nullable: false, key: '', default: 'Normal Operations', extra: '' },
    { field: 'budgetCode', type: 'VARCHAR(32)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'ownerId', type: 'VARCHAR(128)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'updatedAt', type: 'TIMESTAMP', nullable: false, key: '', default: 'CURRENT_TIMESTAMP', extra: '' },
  ],
  staff_profiles: [
    { field: 'staffId', type: 'VARCHAR(128)', nullable: false, key: 'PRI', default: 'UUID', extra: '' },
    { field: 'ownerId', type: 'VARCHAR(128)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'fullName', type: 'VARCHAR(100)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'role', type: 'ENUM(admin,physician,nurse,lab_tech)', nullable: false, key: '', default: 'physician', extra: '' },
    { field: 'department', type: 'VARCHAR(40)', nullable: false, key: '', default: 'ICU', extra: '' },
    { field: 'badgeId', type: 'VARCHAR(32)', nullable: false, key: 'UNI', default: 'None', extra: '' },
    { field: 'shift', type: 'VARCHAR(40)', nullable: false, key: '', default: 'Day (07:00-19:00)', extra: '' },
    { field: 'status', type: 'ENUM(On Duty,Off Duty,In Surgery)', nullable: false, key: '', default: 'On Duty', extra: '' },
    { field: 'createdAt', type: 'TIMESTAMP', nullable: false, key: '', default: 'CURRENT_TIMESTAMP', extra: '' },
    { field: 'updatedAt', type: 'TIMESTAMP', nullable: false, key: '', default: 'CURRENT_TIMESTAMP', extra: '' },
  ],
  attendance_logs: [
    { field: 'attendanceId', type: 'VARCHAR(128)', nullable: false, key: 'PRI', default: 'UUID', extra: '' },
    { field: 'staffUid', type: 'VARCHAR(128)', nullable: false, key: 'MUL', default: 'None', extra: '' },
    { field: 'ownerId', type: 'VARCHAR(128)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'staffName', type: 'VARCHAR(100)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'badgeId', type: 'VARCHAR(32)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'department', type: 'VARCHAR(40)', nullable: false, key: '', default: 'ICU', extra: '' },
    { field: 'shiftDate', type: 'VARCHAR(20)', nullable: false, key: '', default: 'YYYY-MM-DD', extra: '' },
    { field: 'shiftType', type: 'VARCHAR(40)', nullable: false, key: '', default: 'Day (07:00-19:00)', extra: '' },
    { field: 'attendanceStatus', type: 'ENUM(Present - Checked In,Completed Shift,Late Arrival,On Leave)', nullable: false, key: '', default: 'Present - Checked In', extra: '' },
    { field: 'clockInNote', type: 'VARCHAR(160)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'hoursLogged', type: 'DECIMAL(4,1)', nullable: false, key: '', default: '0.0', extra: '' },
    { field: 'verifiedByAdmin', type: 'BOOLEAN', nullable: false, key: '', default: 'FALSE', extra: '' },
    { field: 'createdAt', type: 'TIMESTAMP', nullable: false, key: '', default: 'CURRENT_TIMESTAMP', extra: '' },
    { field: 'updatedAt', type: 'TIMESTAMP', nullable: false, key: '', default: 'CURRENT_TIMESTAMP', extra: '' },
  ],
  clinical_orders: [
    { field: 'orderId', type: 'VARCHAR(128)', nullable: false, key: 'PRI', default: 'UUID', extra: '' },
    { field: 'patientId', type: 'VARCHAR(128)', nullable: false, key: 'MUL', default: 'None', extra: '' },
    { field: 'orderType', type: 'ENUM(Medication,Lab Panel,Imaging,Procedure)', nullable: false, key: '', default: 'Medication', extra: '' },
    { field: 'description', type: 'VARCHAR(300)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'priority', type: 'ENUM(STAT,Urgent,Routine)', nullable: false, key: '', default: 'Routine', extra: '' },
    { field: 'orderStatus', type: 'ENUM(Pending,In Progress,Completed,Cancelled)', nullable: false, key: '', default: 'Pending', extra: '' },
    { field: 'orderedBy', type: 'VARCHAR(128)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'orderedByName', type: 'VARCHAR(100)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'assignedStaffId', type: 'VARCHAR(128)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'createdAt', type: 'TIMESTAMP', nullable: false, key: '', default: 'CURRENT_TIMESTAMP', extra: '' },
    { field: 'updatedAt', type: 'TIMESTAMP', nullable: false, key: '', default: 'CURRENT_TIMESTAMP', extra: '' },
  ],
  audit_logs: [
    { field: 'logId', type: 'VARCHAR(128)', nullable: false, key: 'PRI', default: 'UUID', extra: '' },
    { field: 'actorId', type: 'VARCHAR(128)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'actorName', type: 'VARCHAR(100)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'actorRole', type: 'VARCHAR(32)', nullable: false, key: '', default: 'admin', extra: '' },
    { field: 'action', type: 'VARCHAR(120)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'targetId', type: 'VARCHAR(128)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'severity', type: 'ENUM(Info,Elevated,Restricted-Blocked)', nullable: false, key: '', default: 'Info', extra: '' },
    { field: 'createdAt', type: 'TIMESTAMP', nullable: false, key: '', default: 'CURRENT_TIMESTAMP', extra: '' },
  ],
  user_access: [
    { field: 'accessId', type: 'VARCHAR(128)', nullable: false, key: 'PRI', default: 'UUID', extra: '' },
    { field: 'email', type: 'VARCHAR(100)', nullable: false, key: 'UNI', default: 'None', extra: '' },
    { field: 'fullName', type: 'VARCHAR(100)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'accessType', type: 'ENUM(admin,physician,nurse,lab_tech)', nullable: false, key: '', default: 'physician', extra: '' },
    { field: 'department', type: 'VARCHAR(40)', nullable: false, key: '', default: 'ICU', extra: '' },
    { field: 'badgeId', type: 'VARCHAR(32)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'status', type: 'ENUM(Active,Suspended,Pending)', nullable: false, key: '', default: 'Active', extra: '' },
    { field: 'ownerId', type: 'VARCHAR(128)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'assignedByName', type: 'VARCHAR(100)', nullable: false, key: '', default: 'None', extra: '' },
    { field: 'createdAt', type: 'TIMESTAMP', nullable: false, key: '', default: 'CURRENT_TIMESTAMP', extra: '' },
    { field: 'updatedAt', type: 'TIMESTAMP', nullable: false, key: '', default: 'CURRENT_TIMESTAMP', extra: '' },
  ],
};

interface SqlExecutionContext {
  patients: PatientRecord[];
  departments: DepartmentConfig[];
  staffProfiles: StaffProfile[];
  attendanceRecords: AttendanceRecord[];
  orders: ClinicalOrder[];
  auditLogs: AuditLog[];
  userAccessRecords?: Array<{
    accessId: string;
    email: string;
    fullName: string;
    accessType: string;
    department: string;
    badgeId: string;
    status: string;
    ownerId: string;
    assignedByName: string;
    createdAt?: any;
    updatedAt?: any;
  }>;
  userUid: string;
  userDisplayName: string;
  recordAuditEvent: (action: string, targetId: string, severity?: 'Info' | 'Elevated' | 'Restricted-Blocked') => Promise<void>;
}

// Tokenize SQL while preserving strings
function tokenizeSql(sql: string): string[] {
  const tokens: string[] = [];
  const regex = /'([^']*)'|"([^"]*)"|`([^`]*)`|(\w+)|([(),;=<>!*])/g;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    if (match[1] !== undefined) tokens.push(match[1]); // Single quote string
    else if (match[2] !== undefined) tokens.push(match[2]); // Double quote string
    else if (match[3] !== undefined) tokens.push(match[3]); // Backtick identifier
    else if (match[4] !== undefined) tokens.push(match[4]); // Word/identifier
    else if (match[5] !== undefined) tokens.push(match[5]); // Punctuation/operators
  }
  return tokens;
}

// Strip quotes helper
function stripQuotes(str: string): string {
  if (!str) return '';
  const trimmed = str.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('`') && trimmed.endsWith('`'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export async function executeSqlStatement(
  rawSql: string,
  context: SqlExecutionContext
): Promise<SqlQueryResult> {
  const startTime = performance.now();
  const trimmed = rawSql.trim().replace(/;+$/, '');
  const tokens = tokenizeSql(trimmed);

  if (tokens.length === 0) {
    return {
      success: false,
      commandType: 'UNKNOWN',
      columns: [],
      rows: [],
      message: 'Empty SQL statement provided.',
      affectedRows: 0,
      durationMs: 0,
      rawSql,
    };
  }

  const primaryVerb = tokens[0].toUpperCase();

  try {
    // 1. SHOW TABLES / SHOW DATABASES
    if (primaryVerb === 'SHOW') {
      const second = (tokens[1] || '').toUpperCase();
      if (second === 'TABLES') {
        const tableNames = Object.keys(DATABASE_TABLES_SCHEMA).map((name) => ({
          'Tables_in_aegis_hospital_db': name,
        }));
        return {
          success: true,
          commandType: 'SHOW',
          columns: ['Tables_in_aegis_hospital_db'],
          rows: tableNames,
          message: `${tableNames.length} rows in set`,
          affectedRows: tableNames.length,
          durationMs: Math.round(performance.now() - startTime),
          rawSql,
        };
      }
      if (second === 'DATABASES') {
        const dbs = [{ Database: 'aegis_hospital_db' }, { Database: 'information_schema' }, { Database: 'performance_schema' }];
        return {
          success: true,
          commandType: 'SHOW',
          columns: ['Database'],
          rows: dbs,
          message: `${dbs.length} rows in set`,
          affectedRows: dbs.length,
          durationMs: Math.round(performance.now() - startTime),
          rawSql,
        };
      }
    }

    // 2. DESCRIBE / EXPLAIN table
    if (primaryVerb === 'DESCRIBE' || (primaryVerb === 'EXPLAIN' && tokens.length === 2)) {
      const targetTable = (tokens[1] || '').toLowerCase().replace(/[`"']/g, '');
      const schema = DATABASE_TABLES_SCHEMA[targetTable];
      if (!schema) {
        throw new Error(`Table 'aegis_hospital_db.${targetTable}' doesn't exist.`);
      }
      const rows = schema.map((col) => ({
        Field: col.field,
        Type: col.type,
        Null: col.nullable ? 'YES' : 'NO',
        Key: col.key,
        Default: col.default,
        Extra: col.extra,
      }));
      return {
        success: true,
        commandType: 'DESCRIBE',
        table: targetTable,
        columns: ['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'],
        rows,
        message: `${rows.length} rows in set`,
        affectedRows: rows.length,
        durationMs: Math.round(performance.now() - startTime),
        rawSql,
      };
    }

    // 3. SELECT (DML Query)
    if (primaryVerb === 'SELECT') {
      return executeSelectStatement(trimmed, context, startTime);
    }

    // 4. INSERT INTO (DML Mutation)
    if (primaryVerb === 'INSERT') {
      return await executeInsertStatement(trimmed, context, startTime);
    }

    // 5. UPDATE (DML Mutation)
    if (primaryVerb === 'UPDATE') {
      return await executeUpdateStatement(trimmed, context, startTime);
    }

    // 6. DELETE FROM (DML Mutation)
    if (primaryVerb === 'DELETE') {
      return await executeDeleteStatement(trimmed, context, startTime);
    }

    throw new Error(
      `Unsupported SQL command '${primaryVerb}'. Aegis MySQL Workbench supports DML (SELECT, INSERT, UPDATE, DELETE), SHOW TABLES, and DESCRIBE.`
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      commandType: (['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(primaryVerb)
        ? primaryVerb
        : 'UNKNOWN') as SqlQueryResult['commandType'],
      columns: [],
      rows: [],
      message: `Error 1064 (42000): ${errorMsg}`,
      affectedRows: 0,
      durationMs: Math.round(performance.now() - startTime),
      rawSql,
    };
  }
}

// -------------------------------------------------------------
// SELECT Execution
// -------------------------------------------------------------
function executeSelectStatement(
  sql: string,
  context: SqlExecutionContext,
  startTime: number
): SqlQueryResult {
  // Parse: SELECT <cols> FROM <table> [WHERE <condition>] [ORDER BY <col> [ASC|DESC]] [LIMIT <n>]
  const selectMatch = sql.match(
    /SELECT\s+([\s\S]+?)\s+FROM\s+([`\w]+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([\s\S]+?))?(?:\s+LIMIT\s+(\d+))?$/i
  );

  if (!selectMatch) {
    throw new Error('Syntax error in SELECT statement. Expected: SELECT [cols|*] FROM [table] [WHERE condition] [ORDER BY col [ASC|DESC]] [LIMIT n]');
  }

  const [, rawCols, rawTable, rawWhere, rawOrderBy, rawLimit] = selectMatch;
  const tableName = stripQuotes(rawTable).toLowerCase();

  let dataset: Record<string, unknown>[] = [];
  if (tableName === 'patients') {
    dataset = context.patients.map((p) => ({ ...p }));
  } else if (tableName === 'departments') {
    dataset = context.departments.map((d) => ({ ...d }));
  } else if (tableName === 'staff_profiles') {
    dataset = context.staffProfiles.map((s) => ({ ...s }));
  } else if (tableName === 'attendance_logs') {
    dataset = context.attendanceRecords.map((a) => ({ ...a }));
  } else if (tableName === 'clinical_orders' || tableName === 'orders') {
    dataset = context.orders.map((o) => ({ ...o }));
  } else if (tableName === 'audit_logs') {
    dataset = context.auditLogs.map((l) => ({ ...l }));
  } else if (tableName === 'user_access' || tableName === 'users') {
    dataset = (context.userAccessRecords || []).map((u) => ({ ...u }));
  } else {
    throw new Error(`Table 'aegis_hospital_db.${tableName}' does not exist.`);
  }

  // Format Timestamps for display in grid
  dataset = dataset.map((item) => {
    const formatted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item)) {
      if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
        formatted[k] = (v as { toDate: () => Date }).toDate().toISOString().replace('T', ' ').slice(0, 19);
      } else {
        formatted[k] = v;
      }
    }
    return formatted;
  });

  // Apply WHERE filtering (basic comparisons: =, !=, <, >, LIKE)
  if (rawWhere && rawWhere.trim()) {
    const whereClause = rawWhere.trim();
    dataset = dataset.filter((row) => evaluateWhereClause(row, whereClause));
  }

  // Apply ORDER BY
  if (rawOrderBy && rawOrderBy.trim()) {
    const orderParts = rawOrderBy.trim().split(/\s+/);
    const orderCol = stripQuotes(orderParts[0]);
    const direction = (orderParts[1] || 'ASC').toUpperCase() === 'DESC' ? -1 : 1;
    dataset.sort((a, b) => {
      const valA = a[orderCol] ?? '';
      const valB = b[orderCol] ?? '';
      if (typeof valA === 'number' && typeof valB === 'number') {
        return (valA - valB) * direction;
      }
      return String(valA).localeCompare(String(valB)) * direction;
    });
  }

  // Apply LIMIT
  if (rawLimit) {
    const limitNum = parseInt(rawLimit, 10);
    if (!isNaN(limitNum) && limitNum > 0) {
      dataset = dataset.slice(0, limitNum);
    }
  }

  // Determine Columns
  let columns: string[] = [];
  const requestedCols = rawCols.trim();
  if (requestedCols === '*' || requestedCols === 'aegis_hospital_db.*') {
    const schema = DATABASE_TABLES_SCHEMA[tableName];
    if (schema) {
      columns = schema.map((s) => s.field);
    } else if (dataset.length > 0) {
      columns = Object.keys(dataset[0]);
    } else {
      columns = ['id'];
    }
  } else {
    columns = requestedCols
      .split(',')
      .map((c) => stripQuotes(c.trim()))
      .filter(Boolean);
  }

  // Filter row fields to selected columns
  const finalRows = dataset.map((row) => {
    const projected: Record<string, unknown> = {};
    for (const col of columns) {
      projected[col] = row[col] !== undefined ? row[col] : null;
    }
    return projected;
  });

  const durationMs = Math.round(performance.now() - startTime);
  return {
    success: true,
    commandType: 'SELECT',
    table: tableName,
    columns,
    rows: finalRows,
    message: `${finalRows.length} rows in set (${(durationMs / 1000).toFixed(3)} sec)`,
    affectedRows: finalRows.length,
    durationMs,
    rawSql: sql,
  };
}

// -------------------------------------------------------------
// INSERT Execution
// -------------------------------------------------------------
async function executeInsertStatement(
  sql: string,
  context: SqlExecutionContext,
  startTime: number
): Promise<SqlQueryResult> {
  // Syntax: INSERT INTO <table> [(col1, col2, ...)] VALUES (val1, val2, ...)
  const insertMatch = sql.match(
    /INSERT\s+INTO\s+([`\w]+)(?:\s*\(([\s\S]+?)\))?\s+VALUES\s*\(([\s\S]+?)\)/i
  );

  if (!insertMatch) {
    throw new Error('Syntax error in INSERT statement. Expected: INSERT INTO [table] (col1, col2, ...) VALUES (val1, val2, ...)');
  }

  const [, rawTable, rawCols, rawVals] = insertMatch;
  const tableName = stripQuotes(rawTable).toLowerCase();

  const values = parseSqlValuesList(rawVals);
  let colNames: string[] = [];

  if (rawCols && rawCols.trim()) {
    colNames = rawCols.split(',').map((c) => stripQuotes(c.trim()));
  } else {
    const schema = DATABASE_TABLES_SCHEMA[tableName];
    if (!schema) throw new Error(`Unknown table '${tableName}'`);
    colNames = schema.map((s) => s.field);
  }

  if (colNames.length !== values.length) {
    throw new Error(`Column count doesn't match value count at row 1. Expected ${colNames.length} columns, received ${values.length} values.`);
  }

  const rowData: Record<string, unknown> = {};
  for (let i = 0; i < colNames.length; i++) {
    rowData[colNames[i]] = values[i];
  }

  const uTag = context.userUid.slice(0, 10).replace(/[^a-zA-Z0-9_-]/g, '_');

  // Insert into live Firestore based on table
  if (tableName === 'patients') {
    const mrn = String(rowData.mrn || `MRN-2026-${Math.floor(1000 + Math.random() * 8999)}`);
    const patientId = String(rowData.patientId || `pat_${uTag}_${mrn.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
    const fullName = clampString(String(rowData.fullName || 'New Patient'), 2, 100, 'New Patient');
    const age = Number(rowData.age || 40);
    const bloodType = String(rowData.bloodType || 'O+');
    const department = String(rowData.department || 'ICU');
    const roomNumber = sanitizeId(String(rowData.roomNumber || 'ICU-10'), 20);
    const triageStatus = String(rowData.triageStatus || 'Observation');
    const diagnosisSummary = clampString(String(rowData.diagnosisSummary || 'Routine admission assessment'), 2, 500);
    const vitalSigns = clampString(String(rowData.vitalSigns || 'HR 75 bpm | BP 120/80 mmHg | SpO2 98%'), 2, 200);
    const clinicalNotes = clampString(String(rowData.clinicalNotes || ''), 0, 1000, '');
    const insuranceStatus = String(rowData.insuranceStatus || 'Verified');
    const assignedStaffId = sanitizeId(String(rowData.assignedStaffId || context.userUid), 128);
    const assignedStaffName = clampString(String(rowData.assignedStaffName || context.userDisplayName || 'Dr. Attending Clinician'), 2, 100);

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
      createdBy: context.userUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await context.recordAuditEvent(
      `DML INSERT INTO patients: Created record ${mrn} (${fullName})`,
      patientId,
      'Elevated'
    );
  } else if (tableName === 'departments') {
    const deptId = String(rowData.deptId || `dept_${uTag}_${String(rowData.name || 'icu').toLowerCase()}`);
    const name = String(rowData.name || 'ICU');
    const headPhysician = clampString(String(rowData.headPhysician || 'Dr. Chief of Ward, MD'), 2, 100);
    const totalBeds = Number(rowData.totalBeds || 30);
    const occupiedBeds = Number(rowData.occupiedBeds || 0);
    const diversionStatus = String(rowData.diversionStatus || 'Normal Operations');
    const budgetCode = sanitizeId(String(rowData.budgetCode || 'CC-GEN-100'), 32);

    await setDoc(doc(db, 'departments', deptId), {
      deptId,
      name,
      headPhysician,
      totalBeds,
      occupiedBeds,
      diversionStatus,
      budgetCode,
      ownerId: context.userUid,
      updatedAt: serverTimestamp(),
    });

    await context.recordAuditEvent(
      `DML INSERT INTO departments: Added/configured department ${name}`,
      deptId,
      'Elevated'
    );
  } else if (tableName === 'staff_profiles') {
    const staffId = String(rowData.staffId || `staff_${uTag}_${Date.now().toString(36)}`);
    const fullName = clampString(String(rowData.fullName || 'Clinician Staff'), 2, 100);
    const role = String(rowData.role || 'physician');
    const department = String(rowData.department || 'ICU');
    const badgeId = sanitizeId(String(rowData.badgeId || `BDG-MED-${Math.floor(100 + Math.random() * 899)}`), 32);
    const shift = String(rowData.shift || 'Day (07:00-19:00)');
    const status = String(rowData.status || 'On Duty');

    await setDoc(doc(db, 'staff_profiles', staffId), {
      staffId,
      ownerId: context.userUid,
      fullName,
      role,
      department,
      badgeId,
      shift,
      status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await context.recordAuditEvent(
      `DML INSERT INTO staff_profiles: Created profile for ${fullName} (${role})`,
      staffId,
      'Elevated'
    );
  } else if (tableName === 'attendance_logs') {
    const attendanceId = String(rowData.attendanceId || `att_${uTag}_${Date.now().toString(36)}`);
    const staffUid = sanitizeId(String(rowData.staffUid || context.userUid), 128);
    const staffName = clampString(String(rowData.staffName || context.userDisplayName), 2, 100);
    const badgeId = sanitizeId(String(rowData.badgeId || 'BDG-CLN-001'), 32);
    const department = String(rowData.department || 'ICU');
    const shiftDate = String(rowData.shiftDate || new Date().toISOString().slice(0, 10));
    const shiftType = String(rowData.shiftType || 'Day (07:00-19:00)');
    const attendanceStatus = String(rowData.attendanceStatus || 'Present - Checked In');
    const clockInNote = clampString(String(rowData.clockInNote || 'Logged via MySQL Workbench DML'), 2, 160);
    const hoursLogged = Number(rowData.hoursLogged || 8.0);
    const verifiedByAdmin = Boolean(rowData.verifiedByAdmin === true || rowData.verifiedByAdmin === 'true');

    await setDoc(doc(db, 'attendance_logs', attendanceId), {
      attendanceId,
      staffUid,
      ownerId: context.userUid,
      staffName,
      badgeId,
      department,
      shiftDate,
      shiftType,
      attendanceStatus,
      clockInNote,
      hoursLogged,
      verifiedByAdmin,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await context.recordAuditEvent(
      `DML INSERT INTO attendance_logs: Added shift log for ${staffName}`,
      attendanceId,
      'Elevated'
    );
  } else if (tableName === 'user_access' || tableName === 'users') {
    const accessId = String(rowData.accessId || `acc_${uTag}_${Date.now().toString(36)}`);
    const email = clampString(String(rowData.email || 'user@hospital.org'), 5, 100);
    const fullName = clampString(String(rowData.fullName || 'Clinician Staff'), 2, 100);
    const accessType = String(rowData.accessType || 'physician');
    const department = String(rowData.department || 'ICU');
    const badgeId = sanitizeId(String(rowData.badgeId || `BDG-ACC-${Math.floor(100 + Math.random() * 899)}`), 32);
    const status = String(rowData.status || 'Active');

    await setDoc(doc(db, 'user_access', accessId), {
      accessId,
      email,
      fullName,
      accessType,
      department,
      badgeId,
      status,
      ownerId: context.userUid,
      assignedByName: context.userDisplayName || 'Hospital Administrator',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await context.recordAuditEvent(
      `DML INSERT INTO user_access: Registered ${email} with role ${accessType}`,
      accessId,
      'Elevated'
    );
  } else {
    throw new Error(`Direct DML INSERT into table '${tableName}' is not supported.`);
  }

  const durationMs = Math.round(performance.now() - startTime);
  return {
    success: true,
    commandType: 'INSERT',
    table: tableName,
    columns: colNames,
    rows: [rowData],
    message: `Query OK, 1 row affected (${(durationMs / 1000).toFixed(3)} sec)`,
    affectedRows: 1,
    durationMs,
    rawSql: sql,
  };
}

// -------------------------------------------------------------
// UPDATE Execution
// -------------------------------------------------------------
async function executeUpdateStatement(
  sql: string,
  context: SqlExecutionContext,
  startTime: number
): Promise<SqlQueryResult> {
  // Syntax: UPDATE <table> SET col1 = val1, col2 = val2 [WHERE <condition>]
  const updateMatch = sql.match(
    /UPDATE\s+([`\w]+)\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+?))?$/i
  );

  if (!updateMatch) {
    throw new Error('Syntax error in UPDATE statement. Expected: UPDATE [table] SET col1 = val1, col2 = val2 WHERE [condition]');
  }

  const [, rawTable, rawAssignments, rawWhere] = updateMatch;
  const tableName = stripQuotes(rawTable).toLowerCase();

  // Parse SET assignments: col = val, col2 = val2
  const assignments: Record<string, unknown> = {};
  const assignPairs = splitSetAssignments(rawAssignments);
  for (const pair of assignPairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const colName = stripQuotes(pair.slice(0, eqIdx).trim());
    const valRaw = pair.slice(eqIdx + 1).trim();
    assignments[colName] = parseLiteralValue(valRaw);
  }

  if (Object.keys(assignments).length === 0) {
    throw new Error('No valid field assignments in UPDATE statement.');
  }

  let matchedRecords: { id: string; [key: string]: unknown }[] = [];

  if (tableName === 'patients') {
    matchedRecords = context.patients.map((p) => ({ ...p, id: p.patientId }));
  } else if (tableName === 'departments') {
    matchedRecords = context.departments.map((d) => ({ ...d, id: d.deptId }));
  } else if (tableName === 'staff_profiles') {
    matchedRecords = context.staffProfiles.map((s) => ({ ...s, id: s.staffId }));
  } else if (tableName === 'attendance_logs') {
    matchedRecords = context.attendanceRecords.map((a) => ({ ...a, id: a.attendanceId }));
  } else if (tableName === 'user_access' || tableName === 'users') {
    matchedRecords = (context.userAccessRecords || []).map((u) => ({ ...u, id: u.accessId }));
  } else {
    throw new Error(`UPDATE operations on table '${tableName}' are not supported.`);
  }

  if (rawWhere && rawWhere.trim()) {
    matchedRecords = matchedRecords.filter((row) => evaluateWhereClause(row, rawWhere.trim()));
  }

  if (matchedRecords.length === 0) {
    return {
      success: true,
      commandType: 'UPDATE',
      table: tableName,
      columns: Object.keys(assignments),
      rows: [],
      message: `Query OK, 0 rows affected, 0 rows matched (${((performance.now() - startTime) / 1000).toFixed(3)} sec)`,
      affectedRows: 0,
      durationMs: Math.round(performance.now() - startTime),
      rawSql: sql,
    };
  }

  // Execute Firestore document updates
  let updatedCount = 0;
  for (const record of matchedRecords) {
    const docRef = doc(db, tableName, record.id);
    const patchData: Record<string, unknown> = {
      ...assignments,
      updatedAt: serverTimestamp(),
    };
    delete patchData.id;
    delete patchData.createdAt;

    await updateDoc(docRef, patchData);
    updatedCount++;
  }

  await context.recordAuditEvent(
    `DML UPDATE on ${tableName}: Modified ${updatedCount} record(s) [${Object.keys(assignments).join(', ')}]`,
    matchedRecords[0]?.id || 'bulk_update',
    'Elevated'
  );

  const durationMs = Math.round(performance.now() - startTime);
  return {
    success: true,
    commandType: 'UPDATE',
    table: tableName,
    columns: Object.keys(assignments),
    rows: matchedRecords.map((r) => ({ ...r, ...assignments })),
    message: `Query OK, ${updatedCount} row(s) affected (${(durationMs / 1000).toFixed(3)} sec)`,
    affectedRows: updatedCount,
    durationMs,
    rawSql: sql,
  };
}

// -------------------------------------------------------------
// DELETE Execution
// -------------------------------------------------------------
async function executeDeleteStatement(
  sql: string,
  context: SqlExecutionContext,
  startTime: number
): Promise<SqlQueryResult> {
  // Syntax: DELETE FROM <table> WHERE <condition>
  const deleteMatch = sql.match(/DELETE\s+FROM\s+([`\w]+)(?:\s+WHERE\s+([\s\S]+?))?$/i);

  if (!deleteMatch) {
    throw new Error('Syntax error in DELETE statement. Expected: DELETE FROM [table] WHERE [condition]');
  }

  const [, rawTable, rawWhere] = deleteMatch;
  const tableName = stripQuotes(rawTable).toLowerCase();

  if (!rawWhere || !rawWhere.trim()) {
    throw new Error('Safety check: DELETE without a WHERE clause is blocked in Aegis MySQL Workbench to prevent whole-table destruction.');
  }

  let candidates: { id: string; label: string; [key: string]: unknown }[] = [];

  if (tableName === 'patients') {
    candidates = context.patients.map((p) => ({ ...p, id: p.patientId, label: `${p.mrn} (${p.fullName})` }));
  } else if (tableName === 'departments') {
    candidates = context.departments.map((d) => ({ ...d, id: d.deptId, label: d.name }));
  } else if (tableName === 'staff_profiles') {
    candidates = context.staffProfiles.map((s) => ({ ...s, id: s.staffId, label: `${s.fullName} (${s.badgeId})` }));
  } else if (tableName === 'attendance_logs') {
    candidates = context.attendanceRecords.map((a) => ({ ...a, id: a.attendanceId, label: `${a.staffName} (${a.shiftDate})` }));
  } else if (tableName === 'user_access' || tableName === 'users') {
    candidates = (context.userAccessRecords || []).map((u) => ({ ...u, id: u.accessId, label: `${u.fullName} (${u.email})` }));
  } else {
    throw new Error(`DELETE on table '${tableName}' is not supported.`);
  }

  const matched = candidates.filter((row) => evaluateWhereClause(row, rawWhere.trim()));

  if (matched.length === 0) {
    return {
      success: true,
      commandType: 'DELETE',
      table: tableName,
      columns: ['status'],
      rows: [],
      message: `Query OK, 0 rows affected (${((performance.now() - startTime) / 1000).toFixed(3)} sec)`,
      affectedRows: 0,
      durationMs: Math.round(performance.now() - startTime),
      rawSql: sql,
    };
  }

  for (const item of matched) {
    await deleteDoc(doc(db, tableName, item.id));
  }

  await context.recordAuditEvent(
    `DML DELETE FROM ${tableName}: Archived ${matched.length} row(s) [${matched.map((m) => m.label).slice(0, 3).join(', ')}]`,
    matched[0].id,
    'Elevated'
  );

  const durationMs = Math.round(performance.now() - startTime);
  return {
    success: true,
    commandType: 'DELETE',
    table: tableName,
    columns: ['deleted_id', 'label'],
    rows: matched.map((m) => ({ deleted_id: m.id, label: m.label })),
    message: `Query OK, ${matched.length} row(s) affected (${(durationMs / 1000).toFixed(3)} sec)`,
    affectedRows: matched.length,
    durationMs,
    rawSql: sql,
  };
}

// -------------------------------------------------------------
// Helper Parsers
// -------------------------------------------------------------
function parseLiteralValue(str: string): unknown {
  const trimmed = str.trim();
  if (trimmed.toUpperCase() === 'NULL') return null;
  if (trimmed.toUpperCase() === 'TRUE') return true;
  if (trimmed.toUpperCase() === 'FALSE') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return stripQuotes(trimmed);
}

function parseSqlValuesList(rawValues: string): unknown[] {
  const result: unknown[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < rawValues.length; i++) {
    const char = rawValues[i];
    if ((char === "'" || char === '"') && (i === 0 || rawValues[i - 1] !== '\\')) {
      if (inQuote && char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      }
      current += char;
    } else if (char === ',' && !inQuote) {
      result.push(parseLiteralValue(current));
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) {
    result.push(parseLiteralValue(current));
  }
  return result;
}

function splitSetAssignments(rawAssignments: string): string[] {
  const pairs: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < rawAssignments.length; i++) {
    const char = rawAssignments[i];
    if ((char === "'" || char === '"') && (i === 0 || rawAssignments[i - 1] !== '\\')) {
      if (inQuote && char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      }
      current += char;
    } else if (char === ',' && !inQuote) {
      pairs.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) {
    pairs.push(current.trim());
  }
  return pairs;
}

function evaluateWhereClause(row: Record<string, unknown>, clause: string): boolean {
  // Support AND-separated conditions
  const andClauses = clause.split(/\s+AND\s+/i);
  for (const cond of andClauses) {
    if (!evaluateSingleCondition(row, cond.trim())) {
      return false;
    }
  }
  return true;
}

function evaluateSingleCondition(row: Record<string, unknown>, cond: string): boolean {
  // Look for operators: !=, <>, <=, >=, =, <, >, LIKE, IN
  const match = cond.match(/^([`\w]+)\s*(=|!=|<>|<=|>=|<|>|LIKE)\s*(.+)$/i);
  if (!match) return true;

  const field = stripQuotes(match[1]);
  const op = match[2].toUpperCase();
  const rawTargetVal = match[3].trim();
  const targetVal = parseLiteralValue(rawTargetVal);

  const rowVal = row[field];

  if (op === '=' || op === '==') {
    return String(rowVal).toLowerCase() === String(targetVal).toLowerCase();
  }
  if (op === '!=' || op === '<>') {
    return String(rowVal).toLowerCase() !== String(targetVal).toLowerCase();
  }
  if (op === 'LIKE') {
    const pattern = String(targetVal).replace(/%/g, '.*').replace(/_/g, '.');
    const regex = new RegExp(`^${pattern}$`, 'i');
    return regex.test(String(rowVal ?? ''));
  }
  if (op === '<') {
    return Number(rowVal) < Number(targetVal);
  }
  if (op === '<=') {
    return Number(rowVal) <= Number(targetVal);
  }
  if (op === '>') {
    return Number(rowVal) > Number(targetVal);
  }
  if (op === '>=') {
    return Number(rowVal) >= Number(targetVal);
  }
  return true;
}
