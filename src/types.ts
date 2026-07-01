export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'telecaller';
  active: boolean;
  createdAt?: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  status: string;
  notes: string;
  assignedTo: string | null; // UID of telecaller
  updatedAt?: string;
  label?: string;
  followUpDate?: string | null;
  archived?: boolean;
  visited?: boolean;
  batchId?: string;
  uploadedAt?: string;
  attemptCount?: number;
}

export interface Interaction {
  id: string;
  leadId: string;
  callerId: string;
  callerName: string;
  statusBefore: string;
  statusAfter: string;
  notes: string;
  timestamp: string;
  duration: number;
  followUpDate?: string | null;
  isVisitLog?: boolean;
  isManualDuration?: boolean;
}

export interface AuditLog {
  id: string;
  action: string;
  details: string;
  userId: string;
  userName: string;
  timestamp: string;
}

export interface UploadBatch {
  id: string;
  label: string;
  leadCount: number;
  uploadedAt: string;
  uploadedBy: string;
}
