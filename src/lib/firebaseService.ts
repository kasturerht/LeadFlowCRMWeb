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
) {
  const batch = writeBatch(db);
  
  parsedLeads.forEach(lead => {
    const newDocRef = doc(collection(db, "leads"));
    
    // Standardize phone format (+91 prefix if 10 digits)
    let formattedPhone = lead.phone.replace(/[^\d+]/g, '');
    if (formattedPhone.length === 10 && !formattedPhone.startsWith('+')) {
      formattedPhone = '+91' + formattedPhone;
    }

    batch.set(newDocRef, {
      name: lead.name,
      phone: formattedPhone,
      email: lead.email,
      source: lead.source || 'Bulk Upload',
      status: 'New',
      notes: lead.notes || 'Bulk CSV imported lead.',
      assignedTo: lead.assignedTo,
      label: (lead as any).label || 'General',
      updatedAt: new Date().toISOString()
    });
  });

  await batch.commit();

  await logFirebaseAction(
    "Bulk Upload",
    `Imported ${parsedLeads.length} new leads via Excel copy-paste.`,
    adminUserUid,
    adminUserName
  );
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
        updatedAt: data.updatedAt || ''
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
