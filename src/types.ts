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
  status: 'Converted' | 'Warm' | 'Not Interested' | 'Busy' | 'Ringing' | 'Cold' | 'New';
  notes: string;
  assignedTo: string | null; // UID of telecaller
  updatedAt?: string;
  label?: string;
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
}

export interface AuditLog {
  id: string;
  action: string;
  details: string;
  userId: string;
  userName: string;
  timestamp: string;
}
