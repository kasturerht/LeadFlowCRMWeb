import { 
  collection, 
  doc, 
  getDocs, 
  query, 
  where, 
  writeBatch, 
  onSnapshot, 
  setDoc,
  orderBy,
  limit 
} from 'firebase/firestore';
import { db } from './firebase';
import { Lead, UserProfile, Interaction, AuditLog } from '../types';

// Ingest Bulk Leads
export async function ingestFirebaseLeads(
  adminUserUid: string, 
  adminUserName: string, 
  parsedLeads: Omit<Lead, 'id' | 'status'>[]
): Promise<{ importedCount: number; duplicateCount: number }> {
  // Helper to standardize phone number
  const standardizePhone = (phoneStr: string): string => {
    let formatted = phoneStr.replace(/[^\d+]/g, '');
    if (formatted.length === 10 && !formatted.startsWith('+')) {
      formatted = '+91' + formatted;
    }
    return formatted;
  };

  // 1. Gather all formatted phone numbers, keeping unique ones from the input list itself
  const phoneToLeadMap = new Map<string, Omit<Lead, 'id' | 'status'>>();
  parsedLeads.forEach(lead => {
    const formatted = standardizePhone(lead.phone);
    if (formatted && !phoneToLeadMap.has(formatted)) {
      phoneToLeadMap.set(formatted, lead);
    }
  });

  const uniqueUploadedPhones = Array.from(phoneToLeadMap.keys());
  if (uniqueUploadedPhones.length === 0) {
    return { importedCount: 0, duplicateCount: 0 };
  }

  // 2. Query existing phone numbers in chunks of 30 (Firestore IN limit)
  const existingPhones = new Set<string>();
  const queryChunkSize = 30;
  for (let i = 0; i < uniqueUploadedPhones.length; i += queryChunkSize) {
    const chunk = uniqueUploadedPhones.slice(i, i + queryChunkSize);
    const q = query(collection(db, "leads"), where("phone", "in", chunk));
    const querySnap = await getDocs(q);
    querySnap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.phone) {
        existingPhones.add(data.phone);
      }
    });
  }

  // 3. Separate new leads from duplicates
  const leadsToInsert: Omit<Lead, 'id' | 'status'>[] = [];
  let duplicateCount = 0;

  for (const [phone, lead] of phoneToLeadMap.entries()) {
    if (existingPhones.has(phone)) {
      duplicateCount++;
    } else {
      leadsToInsert.push({
        ...lead,
        phone // Use standardized phone
      });
    }
  }

  if (leadsToInsert.length === 0) {
    return { importedCount: 0, duplicateCount };
  }

  // 4. Ingest new leads in batch writes of 500 (Firestore batch limit)
  const batchWriteSize = 500;
  for (let i = 0; i < leadsToInsert.length; i += batchWriteSize) {
    const batch = writeBatch(db);
    const currentBatchLeads = leadsToInsert.slice(i, i + batchWriteSize);

    currentBatchLeads.forEach(lead => {
      const newDocRef = doc(collection(db, "leads"));
      batch.set(newDocRef, {
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        source: lead.source || 'Bulk Upload',
        status: 'New',
        notes: lead.notes || 'Bulk CSV imported lead.',
        assignedTo: lead.assignedTo,
        label: (lead as any).label || 'General',
        archived: false,
        updatedAt: new Date().toISOString()
      });
    });

    await batch.commit();
  }

  // 5. Log Action
  await logFirebaseAction(
    "Bulk Upload",
    `Imported ${leadsToInsert.length} new leads (skipped ${duplicateCount} duplicates) via Excel copy-paste.`,
    adminUserUid,
    adminUserName
  );

  return { importedCount: leadsToInsert.length, duplicateCount };
}

// Auto Distribute (Round-Robin Splitter)
export async function autoDistributeFirebaseLeads(adminUserUid: string, adminUserName: string) {
  // 1. Fetch active telecallers
  const callersQuery = query(
    collection(db, "users"), 
    where("role", "==", "telecaller"), 
    where("active", "==", true)
  );
  const callersSnap = await getDocs(callersQuery);
  const activeCallers: string[] = [];
  callersSnap.forEach(docSnap => {
    activeCallers.push(docSnap.id);
  });

  if (activeCallers.length === 0) {
    throw new Error("Cannot auto-distribute. No active telecallers in pool!");
  }

  // 2. Fetch unassigned leads
  const unassignedQuery = query(
    collection(db, "leads"), 
    where("assignedTo", "==", null)
  );
  const leadsSnap = await getDocs(unassignedQuery);
  const unassignedCount = leadsSnap.size;
  if (unassignedCount === 0) return 0;

  // 3. Round-Robin Distribution
  const batch = writeBatch(db);
  let index = 0;

  leadsSnap.forEach(docSnap => {
    batch.update(doc(db, "leads", docSnap.id), {
      assignedTo: activeCallers[index],
      updatedAt: new Date().toISOString()
    });
    index = (index + 1) % activeCallers.length;
  });

  await batch.commit();

  // 4. Log Action
  await logFirebaseAction(
    "Lead Allocation",
    `Automated Round-Robin distributed ${unassignedCount} leads evenly across ${activeCallers.length} staff.`,
    adminUserUid,
    adminUserName
  );

  return unassignedCount;
}

// Log actions
export async function logFirebaseAction(action: string, details: string, userId: string, userName: string) {
  const auditDocRef = doc(collection(db, "auditLogs"));
  await setDoc(auditDocRef, {
    id: auditDocRef.id,
    action,
    details,
    userId,
    userName,
    timestamp: new Date().toISOString()
  });
}

// Real-time Subscribers
export function subscribeToLeads(callback: (leads: Lead[]) => void, filterUid?: string | null) {
  const leadsRef = collection(db, "leads");
  const q = filterUid 
    ? query(leadsRef, where("assignedTo", "==", filterUid))
    : leadsRef;

  return onSnapshot(q, (snapshot) => {
    const list: Lead[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      list.push({
        id: docSnap.id,
        name: data.name || '',
        phone: data.phone || '',
        email: data.email || '',
        source: data.source || '',
        status: data.status || 'New',
        notes: data.notes || '',
        assignedTo: data.assignedTo || null,
        label: data.label || 'General',
        updatedAt: data.updatedAt || '',
        archived: data.archived === true
      });
    });
    callback(list);
  });
}

export function subscribeToTelecallers(callback: (callers: UserProfile[]) => void) {
  const q = query(collection(db, "users"), where("role", "==", "telecaller"));
  return onSnapshot(q, (snapshot) => {
    const list: UserProfile[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      list.push({
        uid: docSnap.id,
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        role: data.role || 'telecaller',
        active: data.active === true,
        createdAt: data.createdAt || ''
      });
    });
    callback(list);
  });
}

export function subscribeToAllInteractions(callback: (interactions: Interaction[]) => void) {
  // Ordered by timestamp descending (up to 100 entries)
  const q = query(collection(db, "interactions"), orderBy("timestamp", "desc"), limit(100));
  return onSnapshot(q, (snapshot) => {
    const list: Interaction[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      list.push({
        id: docSnap.id,
        leadId: data.leadId || '',
        callerId: data.callerId || '',
        callerName: data.callerName || '',
        statusBefore: data.statusBefore || '',
        statusAfter: data.statusAfter || '',
        notes: data.notes || '',
        timestamp: data.timestamp || '',
        duration: data.duration || 0
      });
    });
    callback(list);
  });
}

export function subscribeToAuditLogs(callback: (logs: AuditLog[]) => void) {
  const q = query(collection(db, "auditLogs"), orderBy("timestamp", "desc"), limit(50));
  return onSnapshot(q, (snapshot) => {
    const list: AuditLog[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      list.push({
        id: docSnap.id,
        action: data.action || '',
        details: data.details || '',
        userId: data.userId || '',
        userName: data.userName || '',
        timestamp: data.timestamp || ''
      });
    });
    callback(list);
  });
}

// Bulk Assign Leads to Telecaller or Unassign
export async function bulkAssignLeads(
  leadIds: string[],
  telecallerUid: string | null,
  telecallerName: string | null,
  adminUserUid: string,
  adminUserName: string
) {
  const batch = writeBatch(db);

  leadIds.forEach(id => {
    batch.update(doc(db, "leads", id), {
      assignedTo: telecallerUid,
      updatedAt: new Date().toISOString()
    });
  });

  await batch.commit();

  // Log Action
  const details = telecallerUid
    ? `Bulk assigned ${leadIds.length} leads to telecaller ${telecallerName}.`
    : `Bulk unassigned ${leadIds.length} leads (moved back to unallocated pool).`;

  await logFirebaseAction(
    "Bulk Lead Assignment",
    details,
    adminUserUid,
    adminUserName
  );
}

// Bulk Archive / Unarchive Leads
export async function archiveFirebaseLeads(
  leadIds: string[],
  archiveState: boolean,
  adminUserUid: string,
  adminUserName: string
) {
  const batch = writeBatch(db);

  leadIds.forEach(id => {
    batch.update(doc(db, "leads", id), {
      archived: archiveState,
      updatedAt: new Date().toISOString()
    });
  });

  await batch.commit();

  // Log Action
  const details = archiveState
    ? `Bulk archived ${leadIds.length} leads (moved to archive folder).`
    : `Bulk unarchived ${leadIds.length} leads (restored to active roster).`;

  await logFirebaseAction(
    "Bulk Lead Archival",
    details,
    adminUserUid,
    adminUserName
  );
}

// Bulk Delete Leads
export async function deleteFirebaseLeads(
  leadIds: string[],
  adminUserUid: string,
  adminUserName: string
) {
  const batch = writeBatch(db);

  leadIds.forEach(id => {
    batch.delete(doc(db, "leads", id));
  });

  await batch.commit();

  // Log Action
  await logFirebaseAction(
    "Bulk Lead Deletion",
    `Permanently deleted ${leadIds.length} leads from database.`,
    adminUserUid,
    adminUserName
  );
}


