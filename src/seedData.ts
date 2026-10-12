import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { clampString, db, handleFirestoreError, OperationType } from './firebase';

export async function seedHospitalDatabase(userUid: string, userDisplayName: string) {
  const clinicianName = clampString(
    userDisplayName || 'Dr. Attending Clinician',
    2,
    100,
    'Dr. Attending Clinician'
  );
  const userBadgeId = 'BDG-CLN-001';
  const uTag = userUid.slice(0, 10).replace(/[^a-zA-Z0-9_-]/g, '_');

  const staffMeiId = `staff_${uTag}_dr_mei_lin`;
  const staffChidiId = `staff_${uTag}_rn_chidi_okafor`;
  const staffJulianId = `staff_${uTag}_dr_julian_vance`;
  const staffSarahId = `staff_${uTag}_tech_sarah_jenkins`;

  // 1. Seed Staff Profiles (/staff_profiles/{staffId})
  const staffList = [
    {
      staffId: `staff_${uTag}_self`,
      ownerId: userUid,
      fullName: clinicianName,
      role: 'physician',
      department: 'ICU',
      badgeId: userBadgeId,
      shift: 'Day (07:00-19:00)',
      status: 'On Duty',
    },
    {
      staffId: staffMeiId,
      ownerId: userUid,
      fullName: 'Dr. Mei Lin, MD',
      role: 'physician',
      department: 'Cardiology',
      badgeId: 'BDG-PHY-104',
      shift: 'Day (07:00-19:00)',
      status: 'On Duty',
    },
    {
      staffId: staffChidiId,
      ownerId: userUid,
      fullName: 'Chidi Okafor, RN BSN',
      role: 'nurse',
      department: 'ICU',
      badgeId: 'BDG-NRS-219',
      shift: 'Night (19:00-07:00)',
      status: 'On Duty',
    },
    {
      staffId: staffJulianId,
      ownerId: userUid,
      fullName: 'Dr. Julian Vance, MD',
      role: 'physician',
      department: 'Emergency',
      badgeId: 'BDG-PHY-308',
      shift: 'On-Call',
      status: 'In Surgery',
    },
    {
      staffId: staffSarahId,
      ownerId: userUid,
      fullName: 'Sarah Jenkins, MLS',
      role: 'lab_tech',
      department: 'Oncology',
      badgeId: 'BDG-LAB-412',
      shift: 'Day (07:00-19:00)',
      status: 'Off Duty',
    },
  ] as const;

  for (const s of staffList) {
    const path = `staff_profiles/${s.staffId}`;
    try {
      await setDoc(doc(db, 'staff_profiles', s.staffId), {
        ...s,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  const patElenaId = `pat_${uTag}_elena_rostova`;
  const patMarcusId = `pat_${uTag}_marcus_sterling`;
  const patPriyaId = `pat_${uTag}_priya_nair`;
  const patThomasId = `pat_${uTag}_thomas_oconnor`;
  const patArthurId = `pat_${uTag}_arthur_pendelton`;
  const patSofiaId = `pat_${uTag}_sofia_mendel`;
  const patDaisukeId = `pat_${uTag}_daisuke_sato`;

  // 2. Seed Hospital Patients (/patients/{patientId})
  // 4 patients assigned to userUid (visible in Medical Staff Tier 2 "Patients Under Me" view)
  // 3 patients assigned to other clinicians (visible in Admin Tier 1 full hospital census)
  const patientsList = [
    {
      patientId: patElenaId,
      mrn: 'MRN-2026-8410',
      fullName: 'Elena Rostova',
      age: 64,
      bloodType: 'O-',
      department: 'ICU',
      roomNumber: 'ICU-04A',
      triageStatus: 'Critical',
      diagnosisSummary:
        'Acute decompensated heart failure with pulmonary edema; continuous hemodynamic monitoring.',
      vitalSigns: 'HR 112 bpm | BP 94/58 mmHg | SpO2 91% | Temp 37.4C',
      clinicalNotes:
        '[2026-10-05 06:45 · ICU Handover] Titrating IV norepinephrine and furosemide infusion. Hourly urine output tracked.',
      insuranceStatus: 'Verified',
      assignedStaffId: userUid,
      assignedStaffName: clinicianName,
      createdBy: userUid,
    },
    {
      patientId: patMarcusId,
      mrn: 'MRN-2026-8412',
      fullName: 'Marcus Sterling',
      age: 52,
      bloodType: 'A+',
      department: 'Cardiology',
      roomNumber: 'CRD-302',
      triageStatus: 'Observation',
      diagnosisSummary:
        'Post-PCI drug-eluting stent placement to LAD; serial troponin trending downward.',
      vitalSigns: 'HR 76 bpm | BP 126/78 mmHg | SpO2 98% | Temp 36.8C',
      clinicalNotes:
        '[2026-10-05 07:10 · Cardiology Rounds] Dual antiplatelet therapy initiated. Telemetry shows normal sinus rhythm without ectopy.',
      insuranceStatus: 'Verified',
      assignedStaffId: userUid,
      assignedStaffName: clinicianName,
      createdBy: userUid,
    },
    {
      patientId: patPriyaId,
      mrn: 'MRN-2026-8415',
      fullName: 'Priya Nair',
      age: 39,
      bloodType: 'B+',
      department: 'Neurology',
      roomNumber: 'NEU-210',
      triageStatus: 'Stable',
      diagnosisSummary:
        'Transient ischemic attack workup; carotid duplex and MRI brain without acute infarct.',
      vitalSigns: 'HR 68 bpm | BP 118/74 mmHg | SpO2 99% | Temp 36.6C',
      clinicalNotes:
        '[2026-10-05 07:30 · Neurology Consult] Neurological checks q4h intact. Cleared by physical therapy for ambulation.',
      insuranceStatus: 'Pending Review',
      assignedStaffId: userUid,
      assignedStaffName: clinicianName,
      createdBy: userUid,
    },
    {
      patientId: patThomasId,
      mrn: 'MRN-2026-8418',
      fullName: 'Thomas OConnor',
      age: 47,
      bloodType: 'AB+',
      department: 'Emergency',
      roomNumber: 'ED-12',
      triageStatus: 'Discharged',
      diagnosisSummary:
        'Resolved acute anaphylaxis following outpatient allergen exposure; 6-hour observation complete.',
      vitalSigns: 'HR 72 bpm | BP 122/80 mmHg | SpO2 99% | Temp 36.7C',
      clinicalNotes:
        '[2026-10-05 08:00 · ED Discharge] Discharged home with epinephrine auto-injector prescription and allergy clinic referral.',
      insuranceStatus: 'Verified',
      assignedStaffId: userUid,
      assignedStaffName: clinicianName,
      createdBy: userUid,
    },
    {
      patientId: patArthurId,
      mrn: 'MRN-2026-8421',
      fullName: 'Arthur Pendelton',
      age: 71,
      bloodType: 'O+',
      department: 'Oncology',
      roomNumber: 'ONC-408',
      triageStatus: 'Observation',
      diagnosisSummary:
        'Febrile neutropenia post cycle-3 systemic chemotherapy; broad-spectrum empiric coverage.',
      vitalSigns: 'HR 98 bpm | BP 110/68 mmHg | SpO2 95% | Temp 38.5C',
      clinicalNotes:
        '[2026-10-05 06:30 · Oncology Care] Blood cultures drawn x2 prior to cefepime administration. ANC 380/uL.',
      insuranceStatus: 'Gov-Coverage',
      assignedStaffId: staffMeiId,
      assignedStaffName: 'Dr. Mei Lin, MD',
      createdBy: userUid,
    },
    {
      patientId: patSofiaId,
      mrn: 'MRN-2026-8425',
      fullName: 'Sofia Mendel',
      age: 9,
      bloodType: 'A-',
      department: 'Pediatrics',
      roomNumber: 'PED-105',
      triageStatus: 'Stable',
      diagnosisSummary:
        'Moderate asthma exacerbation responsive to nebulized albuterol/ipratropium and systemic steroids.',
      vitalSigns: 'HR 104 bpm | BP 102/64 mmHg | SpO2 97% | Temp 37.0C',
      clinicalNotes:
        '[2026-10-05 07:15 · Pediatrics] Weaned to room air; breath sounds clear bilaterally. Parent asthma action plan reviewed.',
      insuranceStatus: 'Verified',
      assignedStaffId: staffChidiId,
      assignedStaffName: 'Chidi Okafor, RN BSN',
      createdBy: userUid,
    },
    {
      patientId: patDaisukeId,
      mrn: 'MRN-2026-8429',
      fullName: 'Daisuke Sato',
      age: 58,
      bloodType: 'B-',
      department: 'Emergency',
      roomNumber: 'ED-TRAUMA-01',
      triageStatus: 'Critical',
      diagnosisSummary:
        'Right tension pneumothorax status post needle decompression and tube thoracostomy.',
      vitalSigns: 'HR 118 bpm | BP 104/66 mmHg | SpO2 94% | Temp 36.5C',
      clinicalNotes:
        '[2026-10-05 06:20 · Trauma Resuscitation] Chest tube to -20 cmH2O suction; portable CXR confirms lung re-expansion.',
      insuranceStatus: 'Self-Pay',
      assignedStaffId: staffJulianId,
      assignedStaffName: 'Dr. Julian Vance, MD',
      createdBy: userUid,
    },
  ] as const;

  for (const p of patientsList) {
    const path = `patients/${p.patientId}`;
    try {
      await setDoc(doc(db, 'patients', p.patientId), {
        ...p,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  // 3. Seed Clinical Orders Subcollection (/patients/{patientId}/orders/{orderId})
  const ordersList = [
    {
      orderId: `ord_${uTag}_lasix_01`,
      patientId: patElenaId,
      orderType: 'Medication',
      description: 'Furosemide 40mg IV push q12h; strict intake/output monitoring',
      priority: 'STAT',
      orderStatus: 'In Progress',
      orderedBy: userUid,
      orderedByName: clinicianName,
      assignedStaffId: userUid,
    },
    {
      orderId: `ord_${uTag}_abg_02`,
      patientId: patElenaId,
      orderType: 'Lab Panel',
      description: 'Arterial Blood Gas (ABG) + Serum Lactate + BMP',
      priority: 'STAT',
      orderStatus: 'Pending',
      orderedBy: userUid,
      orderedByName: clinicianName,
      assignedStaffId: userUid,
    },
    {
      orderId: `ord_${uTag}_echo_03`,
      patientId: patMarcusId,
      orderType: 'Imaging',
      description: 'Transthoracic Echocardiogram (TTE) to evaluate LVEF post-stent',
      priority: 'Urgent',
      orderStatus: 'In Progress',
      orderedBy: userUid,
      orderedByName: clinicianName,
      assignedStaffId: userUid,
    },
    {
      orderId: `ord_${uTag}_mri_04`,
      patientId: patPriyaId,
      orderType: 'Imaging',
      description: 'MRA Head and Neck without contrast',
      priority: 'Routine',
      orderStatus: 'Completed',
      orderedBy: userUid,
      orderedByName: clinicianName,
      assignedStaffId: userUid,
    },
  ] as const;

  for (const o of ordersList) {
    const path = `patients/${o.patientId}/orders/${o.orderId}`;
    try {
      await setDoc(doc(db, 'patients', o.patientId, 'orders', o.orderId), {
        ...o,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  // 4. Seed Hospital Departments (/departments/{deptId})
  const departmentsList = [
    {
      deptId: `dept_${uTag}_icu`,
      name: 'ICU',
      headPhysician: 'Dr. Henrik Lindqvist, MD',
      totalBeds: 24,
      occupiedBeds: 22,
      diversionStatus: 'Critical Capacity',
      budgetCode: 'CC-ICU-901',
      ownerId: userUid,
    },
    {
      deptId: `dept_${uTag}_cardiology`,
      name: 'Cardiology',
      headPhysician: 'Dr. Mei Lin, MD',
      totalBeds: 40,
      occupiedBeds: 31,
      diversionStatus: 'Normal Operations',
      budgetCode: 'CC-CRD-204',
      ownerId: userUid,
    },
    {
      deptId: `dept_${uTag}_emergency`,
      name: 'Emergency',
      headPhysician: 'Dr. Julian Vance, MD',
      totalBeds: 36,
      occupiedBeds: 33,
      diversionStatus: 'Advisory',
      budgetCode: 'CC-EMG-101',
      ownerId: userUid,
    },
    {
      deptId: `dept_${uTag}_neurology`,
      name: 'Neurology',
      headPhysician: 'Dr. Amara Osei, MD PhD',
      totalBeds: 28,
      occupiedBeds: 19,
      diversionStatus: 'Normal Operations',
      budgetCode: 'CC-NEU-305',
      ownerId: userUid,
    },
    {
      deptId: `dept_${uTag}_oncology`,
      name: 'Oncology',
      headPhysician: 'Dr. Robert Chen, MD',
      totalBeds: 32,
      occupiedBeds: 25,
      diversionStatus: 'Normal Operations',
      budgetCode: 'CC-ONC-410',
      ownerId: userUid,
    },
    {
      deptId: `dept_${uTag}_pediatrics`,
      name: 'Pediatrics',
      headPhysician: 'Dr. Clara Morales, MD',
      totalBeds: 30,
      occupiedBeds: 16,
      diversionStatus: 'Normal Operations',
      budgetCode: 'CC-PED-502',
      ownerId: userUid,
    },
  ] as const;

  for (const d of departmentsList) {
    const path = `departments/${d.deptId}`;
    try {
      await setDoc(doc(db, 'departments', d.deptId), {
        ...d,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  // 5. Seed Medical Staff Attendance Logs (/attendance_logs/{attendanceId})
  const attendanceList = [
    {
      attendanceId: `att_${uTag}_self_today`,
      staffUid: userUid,
      ownerId: userUid,
      staffName: clinicianName,
      badgeId: userBadgeId,
      department: 'ICU',
      shiftDate: '2026-10-05',
      shiftType: 'Day (07:00-19:00)',
      attendanceStatus: 'Present - Checked In',
      clockInNote: 'Clocked in at 06:52 · Received ICU & Cardiology morning rounds handover',
      hoursLogged: 6.5,
      verifiedByAdmin: false,
    },
    {
      attendanceId: `att_${uTag}_self_prev_1`,
      staffUid: userUid,
      ownerId: userUid,
      staffName: clinicianName,
      badgeId: userBadgeId,
      department: 'ICU',
      shiftDate: '2026-10-04',
      shiftType: 'Day (07:00-19:00)',
      attendanceStatus: 'Completed Shift',
      clockInNote: 'Clocked in 06:55 to 19:10 · Completed 4 patient discharges and ICU rounds',
      hoursLogged: 12.2,
      verifiedByAdmin: true,
    },
    {
      attendanceId: `att_${uTag}_self_prev_2`,
      staffUid: userUid,
      ownerId: userUid,
      staffName: clinicianName,
      badgeId: userBadgeId,
      department: 'Cardiology',
      shiftDate: '2026-10-03',
      shiftType: 'Day (07:00-19:00)',
      attendanceStatus: 'Completed Shift',
      clockInNote: 'Clocked in 06:58 to 19:00 · Cath lab post-procedure telemetry coverage',
      hoursLogged: 12.0,
      verifiedByAdmin: true,
    },
    {
      attendanceId: `att_${uTag}_self_prev_3`,
      staffUid: userUid,
      ownerId: userUid,
      staffName: clinicianName,
      badgeId: userBadgeId,
      department: 'Neurology',
      shiftDate: '2026-10-01',
      shiftType: 'On-Call',
      attendanceStatus: 'Completed Shift',
      clockInNote: 'On-call stroke alert coverage · 8 hours active bedside consultation',
      hoursLogged: 8.0,
      verifiedByAdmin: true,
    },
    {
      attendanceId: `att_${uTag}_mei_lin_today`,
      staffUid: staffMeiId,
      ownerId: userUid,
      staffName: 'Dr. Mei Lin, MD',
      badgeId: 'BDG-PHY-104',
      department: 'Cardiology',
      shiftDate: '2026-10-05',
      shiftType: 'Day (07:00-19:00)',
      attendanceStatus: 'Present - Checked In',
      clockInNote: 'Clocked in at 06:48 · Attending Cardiology & Oncology consults',
      hoursLogged: 7.0,
      verifiedByAdmin: true,
    },
    {
      attendanceId: `att_${uTag}_chidi_okafor_today`,
      staffUid: staffChidiId,
      ownerId: userUid,
      staffName: 'Chidi Okafor, RN BSN',
      badgeId: 'BDG-NRS-219',
      department: 'ICU',
      shiftDate: '2026-10-05',
      shiftType: 'Night (19:00-07:00)',
      attendanceStatus: 'Completed Shift',
      clockInNote: 'Night shift completed 19:00-07:05 · Handed over to day team',
      hoursLogged: 12.0,
      verifiedByAdmin: false,
    },
    {
      attendanceId: `att_${uTag}_julian_vance_today`,
      staffUid: staffJulianId,
      ownerId: userUid,
      staffName: 'Dr. Julian Vance, MD',
      badgeId: 'BDG-PHY-308',
      department: 'Emergency',
      shiftDate: '2026-10-05',
      shiftType: 'On-Call',
      attendanceStatus: 'Late Arrival',
      clockInNote: 'Arrived 07:22 due to transit delay · Currently in Trauma Bay 1',
      hoursLogged: 5.5,
      verifiedByAdmin: false,
    },
  ] as const;

  for (const att of attendanceList) {
    const path = `attendance_logs/${att.attendanceId}`;
    try {
      await setDoc(doc(db, 'attendance_logs', att.attendanceId), {
        ...att,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  // 6. Seed Initial Security Audit Logs (/audit_logs/{logId})
  const seedTs = Date.now();
  const logsList = [
    {
      logId: `log_${uTag}_${seedTs}_01`,
      actorId: userUid,
      actorName: clinicianName,
      actorRole: 'admin',
      action:
        'Initialized Hospital DB with Zero-Trust Tier 1 (Admin) & Tier 2 (Medical Staff) policies',
      targetId: 'system_rbac_init',
      severity: 'Info',
    },
    {
      logId: `log_${uTag}_${seedTs}_02`,
      actorId: userUid,
      actorName: clinicianName,
      actorRole: 'physician',
      action:
        'Medical Staff checked in for 2026-10-05 Day Shift with 4 assigned patients under care',
      targetId: `att_${uTag}_self_today`,
      severity: 'Info',
    },
    {
      logId: `log_${uTag}_${seedTs}_03`,
      actorId: userUid,
      actorName: clinicianName,
      actorRole: 'physician',
      action:
        'Blocked Tier 2 Medical Staff attempt to alter billing insuranceStatus on MRN-2026-8412',
      targetId: patMarcusId,
      severity: 'Restricted-Blocked',
    },
  ] as const;

  for (const l of logsList) {
    const path = `audit_logs/${l.logId}`;
    try {
      await setDoc(doc(db, 'audit_logs', l.logId), {
        ...l,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  // 7. Seed Initial Registered User Email Authorizations (/user_access/{accessId})
  const userAccessList = [
    {
      accessId: `acc_${uTag}_admin_01`,
      email: 'subhaanandpps@gmail.com',
      fullName: 'Super Administrator',
      accessType: 'admin' as const,
      department: 'Administration' as const,
      badgeId: 'BDG-ADM-001',
      status: 'Active' as const,
      ownerId: userUid,
      assignedByName: clinicianName,
    },
    {
      accessId: `acc_${uTag}_admin_02`,
      email: 'subha.anand@bscdsaih.christuniversity.in',
      fullName: 'Academic Medical Admin',
      accessType: 'admin' as const,
      department: 'Administration' as const,
      badgeId: 'BDG-ADM-002',
      status: 'Active' as const,
      ownerId: userUid,
      assignedByName: clinicianName,
    },
    {
      accessId: `acc_${uTag}_mei_lin`,
      email: 'dr.meilin@hospital.org',
      fullName: 'Dr. Mei Lin, MD',
      accessType: 'physician' as const,
      department: 'Cardiology' as const,
      badgeId: 'BDG-PHY-104',
      status: 'Active' as const,
      ownerId: userUid,
      assignedByName: clinicianName,
    },
    {
      accessId: `acc_${uTag}_chidi_okafor`,
      email: 'rn.chidi@hospital.org',
      fullName: 'Chidi Okafor, RN BSN',
      accessType: 'nurse' as const,
      department: 'ICU' as const,
      badgeId: 'BDG-NRS-219',
      status: 'Active' as const,
      ownerId: userUid,
      assignedByName: clinicianName,
    },
    {
      accessId: `acc_${uTag}_julian_vance`,
      email: 'dr.julian@hospital.org',
      fullName: 'Dr. Julian Vance, MD',
      accessType: 'physician' as const,
      department: 'Emergency' as const,
      badgeId: 'BDG-PHY-308',
      status: 'Active' as const,
      ownerId: userUid,
      assignedByName: clinicianName,
    },
    {
      accessId: `acc_${uTag}_sarah_jenkins`,
      email: 'sarah.jenkins@hospital.org',
      fullName: 'Sarah Jenkins, MLS',
      accessType: 'lab_tech' as const,
      department: 'Oncology' as const,
      badgeId: 'BDG-LAB-412',
      status: 'Active' as const,
      ownerId: userUid,
      assignedByName: clinicianName,
    },
    {
      accessId: `acc_${uTag}_lucas_ross`,
      email: 'resident.ross@hospital.org',
      fullName: 'Dr. Lucas Ross, MD',
      accessType: 'physician' as const,
      department: 'Pediatrics' as const,
      badgeId: 'BDG-PHY-512',
      status: 'Pending' as const,
      ownerId: userUid,
      assignedByName: clinicianName,
    },
  ];

  for (const acc of userAccessList) {
    const path = `user_access/${acc.accessId}`;
    try {
      await setDoc(doc(db, 'user_access', acc.accessId), {
        ...acc,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}
