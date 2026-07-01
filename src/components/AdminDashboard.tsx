import { useState, useEffect } from 'react';
import { UserProfile, Lead, AuditLog, UploadBatch } from '../types';
import { 
  ingestFirebaseLeads, 
  autoDistributeFirebaseLeads, 
  subscribeToLeads, 
  subscribeToTelecallers, 
  subscribeToAuditLogs,
  bulkAssignLeads,
  archiveFirebaseLeads,
  deleteFirebaseLeads,
  subscribeToUploadBatches,
  rollbackUploadBatch,
  getPrimaryCategory
} from '../lib/firebaseService';
import ReportsTab from './ReportsTab';
import { doc, updateDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  Activity, 
  ArrowRightLeft, 
  CheckCircle2, 
  Edit2,
  FileSpreadsheet, 
  LogOut, 
  Plus,
  Smartphone, 
  TrendingUp, 
  Upload, 
  Users,
  X,
  Award,
  Clock,
  ShieldAlert,
  Trophy,
  Flame,
  Sun,
  Moon,
  Trash2
} from 'lucide-react';

interface AdminDashboardProps {
  adminUser: UserProfile;
  onLogout: () => void;
  onSwitchToTelecallerSimulator: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export default function AdminDashboard({ 
  adminUser, 
  onLogout, 
  onSwitchToTelecallerSimulator,
  theme,
  toggleTheme
}: AdminDashboardProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [telecallers, setTelecallers] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // State for Bulk Input
  const [bulkLeadInput, setBulkLeadInput] = useState('');
  const [bulkLeadLabel, setBulkLeadLabel] = useState('');
  const [selectedCallersForUpload, setSelectedCallersForUpload] = useState<string[]>([]);
  const [bulkIngestLoading, setBulkIngestLoading] = useState(false);
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState({ text: '', isError: false });

  // State for Telecaller Management
  const [showAddCallerForm, setShowAddCallerForm] = useState(false);
  const [newCallerName, setNewCallerName] = useState('');
  const [newCallerEmail, setNewCallerEmail] = useState('');
  const [newCallerPhone, setNewCallerPhone] = useState('');
  const [newCallerPassword, setNewCallerPassword] = useState('');
  const [callerAddLoading, setCallerAddLoading] = useState(false);
  
  const [editingCallerUid, setEditingCallerUid] = useState<string | null>(null);
  const [editingCallerName, setEditingCallerName] = useState('');
  const [editingCallerEmail, setEditingCallerEmail] = useState('');
  const [editingCallerPhone, setEditingCallerPhone] = useState('');
  const [callerEditLoading, setCallerEditLoading] = useState(false);
  
  // Selection states for Leads Directory Bulk Actions
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkAssignLoading, setBulkAssignLoading] = useState(false);
  const [bulkAssignTarget, setBulkAssignTarget] = useState<string>('');
  const [bulkArchiveLoading, setBulkArchiveLoading] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  // Leads Directory filters states
  const [leadsDirectoryFilter, setLeadsDirectoryFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [archiveStatusFilter, setArchiveStatusFilter] = useState<string>('ALL');
  const [archiveDateFilter, setArchiveDateFilter] = useState<'all' | '7days' | '30days' | 'older30days'>('all');

  // Modals visibility states for operations
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [showSplitterModal, setShowSplitterModal] = useState(false);

  // Batch rollback states
  const [uploadBatches, setUploadBatches] = useState<UploadBatch[]>([]);
  const [showBatchHistoryModal, setShowBatchHistoryModal] = useState(false);
  const [rollbackLoadingBatchId, setRollbackLoadingBatchId] = useState<string | null>(null);
  const [batchIdToRollbackConfirm, setBatchIdToRollbackConfirm] = useState<string | null>(null);


  const handleToggleActiveState = async (caller: UserProfile) => {
    try {
      const userRef = doc(db, 'users', caller.uid);
      const nextActiveState = !caller.active;
      
      await updateDoc(userRef, {
        active: nextActiveState
      });

      if (!nextActiveState) {
        const activeLeadsToRelease = leads.filter(lead => 
          lead.assignedTo === caller.uid && 
          lead.status !== 'Converted' && 
          lead.status !== 'Not Interested'
        );

        if (activeLeadsToRelease.length > 0) {
          const batch = writeBatch(db);
          activeLeadsToRelease.forEach(lead => {
            batch.update(doc(db, 'leads', lead.id), {
              assignedTo: null,
              updatedAt: new Date().toISOString()
            });
          });
          await batch.commit();

          flashMessage(`Telecaller ${caller.name} is now Inactive. Released ${activeLeadsToRelease.length} active leads back to unallocated pool.`);
          return;
        }
      }

      flashMessage(`Telecaller ${caller.name} is now ${nextActiveState ? 'Active' : 'Inactive'}.`);
    } catch (err: any) {
      flashMessage("Failed to update status: " + err.message, true);
    }
  };

  const handleSaveCallerEdit = async (callerUid: string) => {
    if (!editingCallerName.trim() || !editingCallerEmail.trim()) {
      flashMessage("Name and Email are required!", true);
      return;
    }
    setCallerEditLoading(true);
    try {
      const userRef = doc(db, 'users', callerUid);
      await updateDoc(userRef, {
        name: editingCallerName.trim(),
        email: editingCallerEmail.trim(),
        phone: editingCallerPhone.trim()
      });
      setEditingCallerUid(null);
      flashMessage("Telecaller details updated successfully.");
    } catch (err: any) {
      flashMessage("Failed to update telecaller: " + err.message, true);
    } finally {
      setCallerEditLoading(false);
    }
  };

  const handleBulkAssign = async (telecallerUid: string | null, telecallerName: string | null) => {
    if (selectedLeadIds.length === 0) return;
    setBulkAssignLoading(true);
    try {
      await bulkAssignLeads(
        selectedLeadIds,
        telecallerUid,
        telecallerName,
        adminUser.uid,
        adminUser.name
      );
      flashMessage(`Successfully assigned ${selectedLeadIds.length} leads to ${telecallerName || 'Unassigned'}.`);
      setSelectedLeadIds([]);
      setBulkAssignTarget('');
    } catch (err: any) {
      flashMessage("Bulk assignment failed: " + err.message, true);
    } finally {
      setBulkAssignLoading(false);
    }
  };

  const handleBulkArchive = async (archiveState: boolean) => {
    if (selectedLeadIds.length === 0) return;
    setBulkArchiveLoading(true);
    try {
      await archiveFirebaseLeads(
        selectedLeadIds,
        archiveState,
        adminUser.uid,
        adminUser.name
      );
      flashMessage(`Successfully ${archiveState ? 'archived' : 'unarchived'} ${selectedLeadIds.length} leads.`);
      setSelectedLeadIds([]);
    } catch (err: any) {
      flashMessage("Bulk archival failed: " + err.message, true);
    } finally {
      setBulkArchiveLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLeadIds.length === 0) return;
    setBulkDeleteLoading(true);
    try {
      await deleteFirebaseLeads(
        selectedLeadIds,
        adminUser.uid,
        adminUser.name
      );
      flashMessage(`Successfully permanently deleted ${selectedLeadIds.length} leads from database.`);
      setSelectedLeadIds([]);
      setShowDeleteConfirmModal(false);
    } catch (err: any) {
      flashMessage("Bulk deletion failed: " + err.message, true);
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  const handleRollbackBatch = async (batchId: string) => {
    setRollbackLoadingBatchId(batchId);
    try {
      await rollbackUploadBatch(batchId, adminUser.uid, adminUser.name);
      flashMessage(`बॅच यशस्वीरित्या रोलबॅक (डिलीट) करण्यात आली आहे.`);
      setBatchIdToRollbackConfirm(null);
    } catch (err: any) {
      flashMessage("बॅच रोलबॅक करण्यात अडथळा आला: " + err.message, true);
    } finally {
      setRollbackLoadingBatchId(null);
    }
  };



  const handleAddNewTelecaller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCallerName.trim() || !newCallerEmail.trim() || !newCallerPassword) {
      flashMessage("Please fill all fields for the new telecaller account.", true);
      return;
    }
    if (newCallerPassword.length < 6) {
      flashMessage("Password must be at least 6 characters.", true);
      return;
    }
    setCallerAddLoading(true);

    // Use secondary app to prevent logging out currently logged in admin
    const { initializeApp } = await import('firebase/app');
    const { getAuth, createUserWithEmailAndPassword } = await import('firebase/auth');
    const { firebaseConfig } = await import('../lib/firebase');

    let secondaryApp;
    try {
      const tempAppName = 'SecondaryAuth-' + Date.now();
      secondaryApp = initializeApp(firebaseConfig, tempAppName);
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        newCallerEmail.trim(),
        newCallerPassword
      );

      const uid = userCredential.user.uid;

      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, {
        name: newCallerName.trim(),
        email: newCallerEmail.trim(),
        phone: newCallerPhone.trim(),
        role: 'telecaller',
        active: true,
        createdAt: new Date().toISOString()
      });

      flashMessage(`Telecaller account ${newCallerName} created successfully!`);
      setNewCallerName('');
      setNewCallerEmail('');
      setNewCallerPhone('');
      setNewCallerPassword('');
      setShowAddCallerForm(false);
    } catch (err: any) {
      flashMessage("Failed to create telecaller: " + err.message, true);
    } finally {
      if (secondaryApp) {
        const { deleteApp } = await import('firebase/app');
        await deleteApp(secondaryApp);
      }
      setCallerAddLoading(false);
    }
  };

  // Tab State
  const [activeTab, setActiveTab] = useState<'overview' | 'leads' | 'staff' | 'interactions' | 'reports'>('overview');

  // Firestore Subscriptions
  useEffect(() => {
    const unsubLeads = subscribeToLeads((list) => setLeads(list));
    const unsubCallers = subscribeToTelecallers((list) => setTelecallers(list));
    const unsubLogs = subscribeToAuditLogs((list) => setAuditLogs(list));
    const unsubBatches = subscribeToUploadBatches((list) => setUploadBatches(list));

    return () => {
      unsubLeads();
      unsubCallers();
      unsubLogs();
      unsubBatches();
    };
  }, []);

  const flashMessage = (text: string, isError = false) => {
    setFeedbackMsg({ text, isError });
    setTimeout(() => {
      setFeedbackMsg({ text: '', isError: false });
    }, 5000);
  };

  // Bulk Upload Parse Handler
  const handleBulkLeadUpload = async () => {
    if (!bulkLeadInput.trim()) {
      flashMessage("Bulk entry text is empty. Please paste CSV/txt tabular leads.", true);
      return;
    }
    setBulkIngestLoading(true);
    const lines = bulkLeadInput.split('\n');
    const parsedLeads: Omit<Lead, 'id' | 'status'>[] = [];

    let callerIndex = 0;
    lines.forEach(line => {
      if (!line.trim()) return;
      // split by comma or tab
      const cols = line.includes('\t') ? line.split('\t') : line.split(',');
      if (cols.length >= 2) {
        const assignedTo = selectedCallersForUpload.length > 0 
          ? selectedCallersForUpload[callerIndex] 
          : null;

        const trimmed = cols.map(c => c.trim());
        let phone = '';
        let phoneIdx = -1;
        let email = '';
        let emailIdx = -1;
        let name = '';
        let nameIdx = -1;
        let source = '';
        let sourceIdx = -1;
        let notes = '';

        // 1. Identify Phone (contains 10-13 digits) - Scan right-to-left
        for (let i = trimmed.length - 1; i >= 0; i--) {
          const digits = trimmed[i].replace(/[^\d]/g, '');
          if (digits.length >= 10 && digits.length <= 13) {
            phone = trimmed[i];
            phoneIdx = i;
            break;
          }
        }

        // 2. Identify Email (contains '@')
        for (let i = 0; i < trimmed.length; i++) {
          if (i === phoneIdx) continue;
          if (trimmed[i].includes('@')) {
            email = trimmed[i];
            emailIdx = i;
            break;
          }
        }

        // 3. Identify Source/Platform (e.g. fb, ig, facebook, instagram, google, meta)
        const platformKeywords = ['fb', 'ig', 'facebook', 'instagram', 'meta', 'google', 'campaign'];
        for (let i = 0; i < trimmed.length; i++) {
          if (i === phoneIdx || i === emailIdx) continue;
          if (platformKeywords.includes(trimmed[i].toLowerCase())) {
            source = trimmed[i];
            sourceIdx = i;
            break;
          }
        }

        // Helper check for name candidacy
        const isNameCandidate = (val: string): boolean => {
          if (!val || val.length === 0) return false;
          const lower = val.toLowerCase();
          if (lower === 'true' || lower === 'false' || lower === 'fb' || lower === 'ig' || lower === 'facebook' || lower === 'instagram') return false;
          if (lower.startsWith('http') || lower.includes('www.')) return false;
          // Exclude if it is a pure number (serial, timestamp, ID) or standard scientific notation
          if (/^\d+$/.test(val) || /^\d+\.\d+E\+\d+$/.test(val)) return false;
          if (val.includes('|') || val.includes('_') || val.includes('/') || val.includes(':')) return false;
          if (val.length > 35) return false;
          return true;
        };

        // 4. Identify Name - Scan right-to-left starting from phoneIdx - 1
        for (let i = phoneIdx - 1; i >= 0; i--) {
          if (i === emailIdx || i === sourceIdx) continue;
          if (isNameCandidate(trimmed[i])) {
            name = trimmed[i];
            nameIdx = i;
            break;
          }
        }

        // 5. Notes (all remaining columns joined)
        const remainingNotes: string[] = [];
        for (let i = 0; i < trimmed.length; i++) {
          if (i === phoneIdx || i === emailIdx || i === sourceIdx || i === nameIdx) continue;
          if (trimmed[i].length > 0) {
            remainingNotes.push(trimmed[i]);
          }
        }
        notes = remainingNotes.join(' | ');

        // Fallbacks
        if (!name) name = 'Lead';
        if (!source) source = 'Bulk Upload';
        if (!notes) notes = 'Imported lead.';

        parsedLeads.push({
          name,
          phone,
          email,
          source,
          notes,
          assignedTo,
          label: bulkLeadLabel.trim() || 'General'
        } as any);

        if (selectedCallersForUpload.length > 0) {
          callerIndex = (callerIndex + 1) % selectedCallersForUpload.length;
        }
      }
    });

    if (parsedLeads.length === 0) {
      flashMessage("No valid records found. Format should be: Name, Phone, Email, Source, Notes", true);
      setBulkIngestLoading(false);
      return;
    }

    try {
      const { importedCount, duplicateCount } = await ingestFirebaseLeads(adminUser.uid, adminUser.name, parsedLeads);
      if (importedCount === 0) {
        flashMessage(`No new leads imported. Skipped ${duplicateCount} duplicate records.`, true);
      } else {
        flashMessage(`Successfully imported ${importedCount} new leads. Skipped ${duplicateCount} duplicate records.`, false);
      }
      setBulkLeadInput('');
      setSelectedCallersForUpload([]);
      setBulkLeadLabel('');
    } catch (err: any) {
      flashMessage("Upload Sync failed: " + err.message, true);
    } finally {
      setBulkIngestLoading(false);
    }
  };

  // Auto-distribute Round Robin
  const handleAutoDistribution = async () => {
    setAllocationLoading(true);
    try {
      const count = await autoDistributeFirebaseLeads(adminUser.uid, adminUser.name);
      if (count === 0) {
        flashMessage("No unassigned leads found. Distribution complete!", false);
      } else {
        flashMessage(`Automated splitter distributed ${count} leads evenly across telecallers.`, false);
      }
    } catch (err: any) {
      flashMessage(err.message || "Lead allocation failed.", true);
    } finally {
      setAllocationLoading(false);
    }
  };

  // Counts & stats
  const activeLeads = leads.filter(l => !l.archived);
  const totalLeadsCount = leads.length;
  const activeLeadsCount = activeLeads.length;
  const convertedCount = activeLeads.filter(l => getPrimaryCategory(l) === 'CONVERTED').length;
  const followupCount = activeLeads.filter(l => getPrimaryCategory(l) === 'FOLLOWUP').length;
  const pendingCount = activeLeads.filter(l => getPrimaryCategory(l) === 'PENDING').length;
  const unassignedCount = activeLeads.filter(l => l.assignedTo === null).length;

  const conversionRate = activeLeadsCount > 0 
    ? Math.round((convertedCount / activeLeadsCount) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top Banner */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3.5">
          {/* Sleek brand icon matching login screen */}
          <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800/80 flex items-center justify-center font-black text-zinc-100 shadow-inner select-none">
            L<span className="text-indigo-500">.</span>
          </div>
          <div>
            <div className="flex items-end gap-0.5">
              <h1 className="text-sm font-black tracking-[0.2em] text-slate-100 leading-none">
                LEADFLOW
              </h1>
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mb-0.5"></span>
            </div>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1.5">Admin Workspace Panel</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold">{adminUser.name}</p>
            <p className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Super Administrator</p>
          </div>

          <button
            onClick={onSwitchToTelecallerSimulator}
            className="flex items-center gap-2 py-2 px-3 bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 text-zinc-350 hover:text-white rounded-lg text-xs font-bold transition shadow-sm"
          >
            <Smartphone size={14} />
            <span>Caller Simulator</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-lg transition shadow-sm flex items-center justify-center"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={16} className="animate-spin-slow" /> : <Moon size={16} />}
          </button>

          <button
            onClick={onLogout}
            className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-500/50 text-rose-300 hover:text-rose-200 font-bold rounded-xl transition shadow-sm flex items-center gap-1.5 text-xs"
            title="Sign Out of Secure Workspace"
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
        {/* Left Side Panel Tabs */}
        <nav className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-800/80 bg-slate-900/20 p-4 space-y-2 shrink-0">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest px-3 mb-3">Navigation</div>
          {[
            { id: 'overview', label: 'Dashboard Overview', icon: TrendingUp },
            { id: 'leads', label: 'Leads Directory', icon: FileSpreadsheet },
            { id: 'staff', label: 'Telecallers Pool', icon: Users },
            { id: 'reports', label: 'Reports & Analytics', icon: Award }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  activeTab === tab.id 
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-900/10' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Content Box */}
        <main className="flex-1 p-6 overflow-y-auto max-w-7xl mx-auto w-full">
          {/* Feedback messages */}
          {feedbackMsg.text && (
            <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 text-sm transition animate-pulse ${
              feedbackMsg.isError 
                ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}>
              <CheckCircle2 size={18} />
              <p>{feedbackMsg.text}</p>
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            (() => {
              // 1. Ingested source types aggregation
              const fbSourceCount = leads.filter(l => {
                const s = (l.source || '').toLowerCase();
                return s === 'fb' || s === 'facebook';
              }).length;
              const igSourceCount = leads.filter(l => {
                const s = (l.source || '').toLowerCase();
                return s === 'ig' || s === 'instagram';
              }).length;
              const otherSourceCount = totalLeadsCount - (fbSourceCount + igSourceCount);

              const fbPct = totalLeadsCount > 0 ? Math.round((fbSourceCount / totalLeadsCount) * 100) : 0;
              const igPct = totalLeadsCount > 0 ? Math.round((igSourceCount / totalLeadsCount) * 100) : 0;
              const otherPct = totalLeadsCount > 0 ? Math.round((otherSourceCount / totalLeadsCount) * 100) : 0;

              // 2. Category labels aggregation
              const labelsMap: { [key: string]: number } = {};
              leads.forEach(l => {
                const lbl = l.label || 'General';
                labelsMap[lbl] = (labelsMap[lbl] || 0) + 1;
              });
              const sortedLabels = Object.entries(labelsMap)
                .map(([name, count]) => {
                  const percentage = totalLeadsCount > 0 ? Math.round((count / totalLeadsCount) * 100) : 0;
                  return { name, count, percentage };
                })
                .sort((a, b) => b.count - a.count);

              // 3. Find highest converting caller
              const topPerformer = (() => {
                if (telecallers.length === 0) return null;
                const callersWithMetrics = telecallers.map(caller => {
                  const assigned = leads.filter(l => l.assignedTo === caller.uid).length;
                  const converted = leads.filter(l => l.assignedTo === caller.uid && l.status === 'Converted').length;
                  const rate = assigned > 0 ? Math.round((converted / assigned) * 100) : 0;
                  return { ...caller, assigned, converted, rate };
                });
                const sorted = callersWithMetrics.sort((a, b) => b.converted - a.converted || b.rate - a.rate);
                return sorted[0] && sorted[0].converted > 0 ? sorted[0] : null;
              })();

              // 4. Live Conversions Feed
              const recentConversions = leads
                .filter(item => item.status === 'Converted')
                .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
                .slice(0, 3);

              return (
                <div className="space-y-6">
                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Total Database Leads', count: totalLeadsCount, desc: `${activeLeadsCount} active (${totalLeadsCount - activeLeadsCount} archived)`, color: 'text-violet-400', bg: 'bg-violet-500/5 border-violet-500/10', icon: FileSpreadsheet },
                      { label: 'Deals Closed (Converted)', count: convertedCount, desc: `${conversionRate}% Active Win Rate`, color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/10', icon: Trophy },
                      { label: 'Follow-ups (Warm)', count: followupCount, desc: 'Callbacks scheduled', color: 'text-amber-400', bg: 'bg-amber-500/5 border-amber-500/10', icon: Flame },
                      { label: 'Pending Queue', count: pendingCount, desc: `${unassignedCount} Unassigned leads`, color: 'text-cyan-400', bg: 'bg-cyan-500/5 border-cyan-500/10', icon: Clock }
                    ].map((stat, i) => {
                      const Icon = stat.icon;
                      return (
                        <div key={i} className={`p-5 rounded-2xl border ${stat.bg} shadow-md flex items-center justify-between group hover:scale-[1.02] hover:border-slate-700/80 transition-all duration-300`}>
                          <div className="space-y-1">
                            <p className="text-xs text-slate-400 font-semibold">{stat.label}</p>
                            <p className={`text-3xl font-black mt-2 ${stat.color}`}>{stat.count}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{stat.desc}</p>
                          </div>
                          <div className={`p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 ${stat.color} group-hover:bg-slate-800/60 transition shrink-0`}>
                            <Icon size={20} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Charts area */}
                    <div className="lg:col-span-2 space-y-6 flex flex-col">
                      {/* Telecaller Status Grid */}
                      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-slate-950/20 group hover:border-slate-700 transition">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-bold text-sm text-slate-200">Telecaller Workload Activity</h3>
                            <p className="text-[10px] text-slate-500">Live tracker of caller engagement</p>
                          </div>
                          <Users size={16} className="text-slate-400 group-hover:text-violet-400 transition" />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {telecallers.length === 0 ? (
                            <div className="col-span-full py-4 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                              No telecallers active. Add staff in the pool.
                            </div>
                          ) : (
                            telecallers.slice(0, 4).map(caller => {
                              const callerAssigned = leads.filter(l => l.assignedTo === caller.uid).length;
                              const callerConverted = leads.filter(l => l.assignedTo === caller.uid && l.status === 'Converted').length;
                              const callerRate = callerAssigned > 0 ? Math.round((callerConverted / callerAssigned) * 100) : 0;
                              return (
                                <div key={caller.uid} className="bg-slate-950/50 rounded-xl p-3 border border-slate-800/80 shadow-inner flex flex-col justify-between">
                                  <div className="flex justify-between items-start mb-2">
                                    <span className="font-bold text-xs truncate max-w-[80%] text-slate-300">{caller.name}</span>
                                    <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${caller.active ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-600'}`}></span>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-slate-500">Assigned</span>
                                      <span className="font-mono text-cyan-400 font-semibold">{callerAssigned}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-slate-500">Win Rate</span>
                                      <span className={`font-mono font-bold ${callerRate > 15 ? 'text-emerald-400' : 'text-slate-400'}`}>{callerRate}%</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Secondary pane */}
                    <div className="space-y-6">
                      {/* Top Performer Ribbon */}
                      {topPerformer ? (
                        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-2xl p-5 shadow-lg shadow-amber-950/10 group hover:border-amber-500/40 transition">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500/80 group-hover:text-amber-400 transition flex items-center gap-2">
                              <Award size={14} /> Peak Performer
                            </h3>
                          </div>
                          <div className="flex items-center gap-3 mt-3">
                            <div className="h-10 w-10 bg-amber-500/20 rounded-full flex items-center justify-center border border-amber-500/30 text-amber-400 font-bold shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                              {topPerformer.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-black text-amber-100">{topPerformer.name}</p>
                              <p className="text-[10px] text-amber-500/70 font-semibold mt-0.5">{topPerformer.converted} Conversions • {topPerformer.rate}% Rate</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 flex flex-col items-center justify-center text-center h-[130px] border-dashed">
                          <Award size={20} className="text-slate-700 mb-2" />
                          <div>
                            <p className="text-xs font-bold text-slate-500">Peak Performer</p>
                            <p className="text-[10px] text-slate-500 leading-relaxed">
                              Sync engine operational. Zero high-priority warm pipeline reminders active.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Live Conversions Celebration Ticker */}
                  {recentConversions.length > 0 ? (
                    <div className="bg-gradient-to-r from-violet-950/30 to-indigo-950/30 border border-violet-800/20 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4 shadow-lg shadow-violet-950/5 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-transparent to-indigo-500/5 pointer-events-none"></div>
                      <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-violet-400 shrink-0">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="flex items-center gap-1.5">🏆 Live Conversions Celebration</span>
                      </div>
                      <div className="flex-1 w-full overflow-hidden">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-start gap-4 md:gap-6 animate-in slide-in-from-right duration-500">
                          {recentConversions.map((conv) => (
                            <div key={conv.id} className="flex items-center gap-2 border-l sm:border-l-0 sm:border-r border-slate-800/80 pl-3 sm:pl-0 pr-4 py-0.5 last:border-0 shrink-0 text-xs">
                              <span className="text-[10px] text-slate-500">🎉</span>
                              <strong className="text-slate-200 font-bold">{telecallers.find(t => t.uid === conv.assignedTo)?.name || 'Someone'}</strong>
                              <span className="text-slate-400">converted</span>
                              <strong className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent font-black">{conv.name}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-900/20 border border-slate-850 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-3 shadow-sm relative overflow-hidden">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 shrink-0">
                        <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                        <span>📞 Live Conversions Feed</span>
                      </div>
                      <div className="flex-1 text-[10px] italic text-slate-500">
                        No closed deals reported in this database batch yet. Callers are actively placing calls!
                      </div>
                    </div>
                  )}

                  {/* Quick Operations toolbar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border border-slate-800/80 bg-slate-900/10 rounded-2xl">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Quick Operations</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Ingest new CSV leads or trigger unallocated lead distribution</p>
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                      <button
                        onClick={() => {
                          setShowIngestModal(true);
                          setBulkLeadInput('');
                          setSelectedCallersForUpload([]);
                        }}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-2 px-4 bg-cyan-950/40 hover:bg-cyan-950 border border-cyan-900 hover:border-cyan-700 text-cyan-300 hover:text-white rounded-xl text-xs font-bold transition shadow-lg shadow-cyan-900/10"
                      >
                        <Upload size={14} />
                        <span>Ingest Bulk Leads</span>
                      </button>
                      <button
                        onClick={() => setShowSplitterModal(true)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-2 px-4 bg-violet-950/40 hover:bg-violet-950 border border-violet-900 hover:border-violet-700 text-violet-300 hover:text-white rounded-xl text-xs font-bold transition shadow-lg shadow-violet-900/10"
                      >
                        <ArrowRightLeft size={14} />
                        <span>Run Splitter</span>
                      </button>
                    </div>
                  </div>

                  {/* Visual Analytics Widgets Layout Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Column 1: Pipeline Distribution */}
                    <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4 flex flex-col justify-between">
                      <div>
                        <h3 className="text-md font-bold flex items-center gap-2 text-slate-200">
                          <Activity className="text-violet-400" size={18} />
                          <span>Pipeline Distribution</span>
                        </h3>
                        <p className="text-[10px] text-slate-500 mt-0.5">Real-time status metrics of all leads in pipeline</p>
                      </div>

                      <div className="space-y-3.5 pt-2 flex-1 flex flex-col justify-center">
                        {(() => {
                          const getCategoryMetrics = (cat: string) => {
                            const count = activeLeads.filter(l => getPrimaryCategory(l) === cat).length;
                            const percentage = activeLeadsCount > 0 ? Math.round((count / activeLeadsCount) * 100) : 0;
                            return { count, percentage };
                          };

                          return [
                            { label: 'Pending Queue (0 Attempts)', cat: 'PENDING', color: 'bg-amber-500', barBg: 'bg-amber-950/30', border: 'border-amber-900/30', text: 'text-amber-400' },
                            { label: 'Follow-ups (Scheduled)', cat: 'FOLLOWUP', color: 'bg-blue-500', barBg: 'bg-blue-950/30', border: 'border-blue-900/30', text: 'text-blue-400' },
                            { label: 'Visit Scheduled', cat: 'VISIT_SCHEDULED', color: 'bg-emerald-500', barBg: 'bg-emerald-950/30', border: 'border-emerald-900/30', text: 'text-emerald-400' },
                            { label: 'Visited Site', cat: 'VISITED', color: 'bg-purple-500', barBg: 'bg-purple-950/30', border: 'border-purple-900/30', text: 'text-purple-400' },
                            { label: 'Attempted (Busy/Ringing/No Answer)', cat: 'ATTEMPTED', color: 'bg-violet-500', barBg: 'bg-violet-950/30', border: 'border-violet-900/30', text: 'text-violet-400' },
                            { label: 'Deals Closed (Converted)', cat: 'CONVERTED', color: 'bg-teal-500', barBg: 'bg-teal-950/30', border: 'border-teal-900/30', text: 'text-teal-400' },
                            { label: 'Rejected / Closed', cat: 'REJECTED', color: 'bg-rose-500', barBg: 'bg-rose-950/30', border: 'border-rose-900/30', text: 'text-rose-400' }
                          ].map(({ label, cat, color, barBg, border, text }) => {
                            const { count, percentage } = getCategoryMetrics(cat);
                            return (
                              <div key={cat} className="space-y-1">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-slate-300 font-medium">{label}</span>
                                  <span className="text-slate-500 text-[10px]">{count} leads <span className={`ml-1 font-bold ${text}`}>({percentage}%)</span></span>
                                </div>
                                <div className={`h-2 w-full rounded-full ${barBg} border ${border} overflow-hidden`}>
                                  <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${percentage}%` }}></div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* Column 2: Lead Acquisition & Demographics stacked */}
                    <div className="space-y-6">
                      {/* Lead Acquisition Channels */}
                      <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4 flex flex-col justify-between h-[calc(50%-0.75rem)] min-h-[190px]">
                        <div>
                          <h3 className="text-md font-bold flex items-center gap-2 text-slate-200">
                            <TrendingUp className="text-indigo-400" size={18} />
                            <span>Lead Acquisition Channels</span>
                          </h3>
                          <p className="text-[10px] text-slate-500 mt-0.5">Distribution of lead sources across FB, IG and others</p>
                        </div>

                        <div className="space-y-3 py-1 flex-1 flex flex-col justify-center">
                          {/* FB Progress */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-350 font-medium flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                Facebook Campaign
                              </span>
                              <span className="text-slate-400 text-[10px]">{fbSourceCount} leads <span className="font-bold text-indigo-400">({fbPct}%)</span></span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-indigo-950/20 border border-indigo-900/20 overflow-hidden">
                              <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${fbPct}%` }}></div>
                            </div>
                          </div>

                          {/* IG Progress */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-350 font-medium flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500"></span>
                                Instagram Ads
                              </span>
                              <span className="text-slate-400 text-[10px]">{igSourceCount} leads <span className="font-bold text-violet-400">({igPct}%)</span></span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-violet-950/20 border border-violet-900/20 overflow-hidden">
                              <div className="h-full rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${igPct}%` }}></div>
                            </div>
                          </div>

                          {/* Others Progress */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-350 font-medium flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                                Google / Website Form
                              </span>
                              <span className="text-slate-400 text-[10px]">{otherSourceCount} leads <span className="font-bold text-cyan-400">({otherPct}%)</span></span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-cyan-950/20 border border-cyan-900/20 overflow-hidden">
                              <div className="h-full rounded-full bg-cyan-500 transition-all duration-500" style={{ width: `${otherPct}%` }}></div>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800/60 text-[9px] uppercase font-bold text-slate-500 flex justify-between">
                          <span>Realtime Influx</span>
                          <span className="text-indigo-400 tracking-wider">Campaign Active</span>
                        </div>
                      </div>

                      {/* Audience Label Share */}
                      <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4 flex flex-col justify-between h-[calc(50%-0.75rem)] min-h-[190px]">
                        <div>
                          <h3 className="text-md font-bold flex items-center gap-2 text-slate-200">
                            <Award className="text-violet-400" size={18} />
                            <span>Audience Campaign Label Share</span>
                          </h3>
                          <p className="text-[10px] text-slate-500 mt-0.5">Lead density breakdown across customized labels</p>
                        </div>

                        <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[110px] pr-1 py-1">
                          {sortedLabels.length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-4">No custom labels mapped.</p>
                          ) : (
                            sortedLabels.map(lbl => (
                              <div key={lbl.name} className="flex items-center justify-between p-1.5 border border-slate-850 bg-slate-950/20 rounded-xl hover:border-slate-800 transition">
                                <span className="text-xs font-semibold text-slate-350 flex items-center gap-1.5">
                                  🏷️ {lbl.name}
                                </span>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="text-[9px] font-mono text-slate-500">{lbl.count} leads</span>
                                  <span className="text-xs font-bold text-violet-400 font-mono">{lbl.percentage}%</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-800/60 flex justify-between items-center text-[10px] text-slate-500">
                          <span>Realtime metrics mapped</span>
                          <button 
                            onClick={() => setActiveTab('reports')}
                            className="font-bold text-violet-400 hover:text-violet-300 hover:underline transition"
                          >
                            View Analytics
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Column 3: Telecaller Leaderboard */}
                    <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4">
                      <div>
                        <h3 className="text-md font-bold flex items-center gap-2 text-slate-200">
                          <Users className="text-cyan-400" size={18} />
                          <span>Telecaller Leaderboard</span>
                        </h3>
                        <p className="text-[10px] text-slate-500 mt-0.5">Agent performance ranked by closed conversions & workload</p>
                      </div>

                      <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[310px] pr-1">
                        {(() => {
                          const rankedCallers = telecallers
                            .map(caller => {
                              const assigned = leads.filter(l => l.assignedTo === caller.uid).length;
                              const converted = leads.filter(l => l.assignedTo === caller.uid && l.status === 'Converted').length;
                              const rate = assigned > 0 ? Math.round((converted / assigned) * 100) : 0;
                              return { ...caller, assigned, converted, rate };
                            })
                            .sort((a, b) => b.converted - a.converted || b.rate - a.rate);

                          if (rankedCallers.length === 0) {
                            return <p className="text-xs text-slate-500 text-center py-8">No telecallers active in the system.</p>;
                          }

                          const medals = ['🥇', '🥈', '🥉', '👤'];

                          return rankedCallers.map((caller, index) => {
                            const medal = index < 3 ? medals[index] : medals[3];
                            return (
                              <div key={caller.uid} className="flex items-center justify-between p-2.5 border border-slate-800/80 bg-slate-950/40 rounded-xl hover:border-slate-700/80 transition group">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-xs shrink-0">{medal}</span>
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-200 truncate group-hover:text-violet-400 transition">{caller.name}</p>
                                    <p className="text-[9px] text-slate-500 truncate">Workload: {caller.assigned} leads</p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-xs font-bold text-emerald-400 font-mono">+{caller.converted} Conversions</span>
                                  <p className="text-[9px] uppercase font-bold tracking-wider text-slate-500 mt-0.5">
                                    Success: <span className="text-slate-300">{caller.rate}%</span>
                                  </p>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Administrative Audit log list */}
                  <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl backdrop-blur-sm relative overflow-hidden group hover:border-slate-700/80 transition-all duration-300">
                    <h3 className="text-md font-bold mb-4 flex items-center gap-2">
                      <Activity size={18} className="text-violet-400" />
                      <span>Administrative Audit History</span>
                    </h3>
                    <div className="divide-y divide-slate-850 max-h-60 overflow-y-auto space-y-2 pr-2">
                      {auditLogs.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-6">No administrative events logged yet.</p>
                      ) : (
                        auditLogs.map((log) => (
                          <div key={log.id} className="pt-2.5 text-xs flex justify-between gap-4">
                            <div>
                              <p className="font-semibold text-slate-350">{log.action}</p>
                              <p className="text-slate-500 text-[10px] mt-0.5">{log.details}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-slate-400 font-medium">👤 {log.userName}</p>
                              <p className="text-[10px] text-slate-500 font-mono">{(() => { const d = new Date(log.timestamp); const t = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); const now = new Date(); return d.toDateString() === now.toDateString() ? 'Today, ' + t : d.toLocaleDateString([], {month:'short', day:'numeric'}) + ', ' + t; })()}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })()
          )}

          {/* TAB 2: LEADS DIRECTORY */}
          {activeTab === 'leads' && (() => {
            // Client-side filtering logic to handle dynamic archiving
            const displayedLeads = leads.filter(lead => {
              if (leadsDirectoryFilter === 'active') {
                if (lead.archived === true) return false;
              } else if (leadsDirectoryFilter === 'archived') {
                if (lead.archived !== true) return false;

                // Status Filter
                if (archiveStatusFilter !== 'ALL' && lead.status !== archiveStatusFilter) return false;

                // Date Filter
                if (archiveDateFilter !== 'all') {
                  if (!lead.updatedAt) return false;
                  const updatedTime = new Date(lead.updatedAt).getTime();
                  const now = Date.now();
                  const diffDays = (now - updatedTime) / (1000 * 60 * 60 * 24);

                  if (archiveDateFilter === '7days') {
                    if (diffDays > 7) return false;
                  } else if (archiveDateFilter === '30days') {
                    if (diffDays > 30) return false;
                  } else if (archiveDateFilter === 'older30days') {
                    if (diffDays <= 30) return false;
                  }
                }
              }
              return true;
            });

            return (
              <>
                {/* Silicon Valley style Tab Switcher */}
                <div className="flex flex-wrap gap-2 mb-4 bg-zinc-900/10 border-b border-zinc-800/80 pb-4">
                  {[
                    { id: 'active', label: 'Active Leads' },
                    { id: 'archived', label: 'Archived Leads' },
                    { id: 'all', label: 'All Database Leads' }
                  ].map(subTab => (
                    <button
                      key={subTab.id}
                      onClick={() => {
                        setLeadsDirectoryFilter(subTab.id as any);
                        setSelectedLeadIds([]); // reset selection on tab change
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                        leadsDirectoryFilter === subTab.id 
                          ? 'bg-violet-600 border-transparent text-white shadow-lg shadow-violet-900/20' 
                          : 'bg-zinc-900 hover:bg-zinc-800/80 border-zinc-800 text-slate-400'
                      }`}
                    >
                      {subTab.label}
                    </button>
                  ))}
                </div>

                {/* Glassmorphic Filters for Archived Leads Tab */}
                {leadsDirectoryFilter === 'archived' && (
                  <div className="p-4 mb-4 bg-slate-900/40 border border-slate-800 rounded-2xl flex flex-wrap gap-4 items-center animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Archive Status</span>
                      <select
                        value={archiveStatusFilter}
                        onChange={(e) => setArchiveStatusFilter(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-violet-500 text-slate-200 cursor-pointer"
                      >
                        <option value="ALL">Show All Status</option>
                        <option value="New">New</option>
                        <option value="Warm">Warm (Follow-up)</option>
                        <option value="Converted">Converted (Closed Deal)</option>
                        <option value="Not Interested">Not Interested</option>
                        <option value="Busy">Busy</option>
                        <option value="Ringing">Ringing</option>
                        <option value="Cold">Cold</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Archive Date Range</span>
                      <select
                        value={archiveDateFilter}
                        onChange={(e) => setArchiveDateFilter(e.target.value as any)}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-violet-500 text-slate-200 cursor-pointer"
                      >
                        <option value="all">All Time</option>
                        <option value="7days">Last 7 Days</option>
                        <option value="30days">Last 30 Days</option>
                        <option value="older30days">Older than 30 Days</option>
                      </select>
                    </div>

                    <div className="ml-auto text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider">
                      Matched: {displayedLeads.length} archived leads
                    </div>
                  </div>
                )}

                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-md capitalize">
                        {leadsDirectoryFilter} Leads Listing
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Viewing {displayedLeads.length} leads out of {leads.length} total database records.
                      </p>
                    </div>
                    <div>
                      <button
                        onClick={() => setShowBatchHistoryModal(true)}
                        className="flex items-center justify-center gap-2 py-2 px-4 bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-705 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition shadow-md"
                      >
                        📋 View Import History
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 uppercase font-bold tracking-wider bg-slate-900/40">
                          <th className="p-4 w-12 text-center">
                            <input
                              type="checkbox"
                              checked={displayedLeads.length > 0 && selectedLeadIds.length === displayedLeads.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedLeadIds(displayedLeads.map(l => l.id));
                                } else {
                                  setSelectedLeadIds([]);
                                }
                              }}
                              className="rounded border-slate-700 text-violet-600 focus:ring-violet-500 bg-slate-950 h-4 w-4 cursor-pointer"
                            />
                          </th>
                          <th className="p-4">Name</th>
                          <th className="p-4">Phone</th>
                          <th className="p-4">Source</th>
                          <th className="p-4">Label</th>
                          <th className="p-4">Assigned To</th>
                          <th className="p-4">Status</th>
                          <th className="p-4">Last Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {displayedLeads.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-slate-500 font-bold uppercase tracking-wider">
                              No records match the active directory filter.
                            </td>
                          </tr>
                        ) : (
                          displayedLeads.map((lead) => {
                            const assignedCaller = telecallers.find(t => t.uid === lead.assignedTo);
                            const isSelected = selectedLeadIds.includes(lead.id);
                            return (
                              <tr 
                                key={lead.id} 
                                className={`hover:bg-slate-900/30 transition ${
                                  isSelected ? 'bg-violet-950/20 hover:bg-violet-950/25' : ''
                                }`}
                              >
                                <td className="p-4 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {
                                      if (isSelected) {
                                        setSelectedLeadIds(selectedLeadIds.filter(id => id !== lead.id));
                                      } else {
                                        setSelectedLeadIds([...selectedLeadIds, lead.id]);
                                      }
                                    }}
                                    className="rounded border-slate-700 text-violet-600 focus:ring-violet-500 bg-slate-950 h-4 w-4 cursor-pointer"
                                  />
                                </td>
                                <td className="p-4 font-bold text-slate-200">{lead.name}</td>
                                <td className="p-4 font-mono text-slate-400">{lead.phone}</td>
                                <td className="p-4">
                                  <span className="px-2.5 py-1 bg-slate-850 border border-slate-850 rounded-lg text-slate-400 font-medium">
                                    {lead.source}
                                  </span>
                                </td>
                                <td className="p-4">
                                  <span className="px-2.5 py-1 bg-violet-950/40 border border-violet-800/30 rounded-lg text-violet-300 font-semibold text-[10px] flex items-center gap-1.5 w-fit">
                                    🏷️ {lead.label || 'General'}
                                  </span>
                                </td>
                                <td className="p-4 text-slate-300">
                                  {assignedCaller ? (
                                    <span className="font-semibold text-violet-400">👤 {assignedCaller.name}</span>
                                  ) : (
                                    <span className="text-slate-500 italic">Unassigned</span>
                                  )}
                                </td>
                                <td className="p-4">
                                  <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] uppercase border ${
                                    lead.status === 'Converted' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                    lead.status === 'Follow-up' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                    lead.status === 'Not Interested' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                                    'bg-sky-500/10 border-sky-500/20 text-sky-400'
                                  }`}>
                                    {lead.status}
                                  </span>
                                </td>
                                <td className="p-4 text-slate-400 max-w-xs truncate" title={lead.notes}>
                                  {lead.notes || '—'}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>


            {/* Floating Glassmorphic Bulk Action Bar */}
            {selectedLeadIds.length > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl animate-in slide-in-from-bottom duration-300">
                <div className="bg-slate-900/80 border border-slate-800 backdrop-blur-md rounded-2xl p-4 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white shadow-lg shadow-violet-900/40">
                      {selectedLeadIds.length}
                    </span>
                    <span className="text-xs font-semibold text-slate-200">
                      leads selected
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    {/* Telecaller assignment dropdown, disabled for Archived tab to prevent accidental re-assignments without restoring first */}
                    <select
                      value={bulkAssignTarget}
                      onChange={(e) => setBulkAssignTarget(e.target.value)}
                      disabled={bulkAssignLoading || leadsDirectoryFilter === 'archived'}
                      className="flex-1 md:flex-none text-xs bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 outline-none focus:border-violet-500 text-slate-200 cursor-pointer disabled:opacity-40"
                    >
                      <option value="" disabled>Select Telecaller...</option>
                      <option value="unassign">❌ Make Unassigned</option>
                      {telecallers.filter(t => t.active).map(caller => (
                        <option key={caller.uid} value={caller.uid}>
                          👤 {caller.name}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => {
                        if (!bulkAssignTarget) return;
                        const isUnassign = bulkAssignTarget === "unassign";
                        const callerId = isUnassign ? null : bulkAssignTarget;
                        const caller = isUnassign ? null : telecallers.find(t => t.uid === bulkAssignTarget);
                        handleBulkAssign(callerId, caller ? caller.name : null);
                      }}
                      disabled={bulkAssignLoading || !bulkAssignTarget || leadsDirectoryFilter === 'archived'}
                      className="py-2 px-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-violet-900/10 flex items-center justify-center whitespace-nowrap"
                    >
                      {bulkAssignLoading ? 'Assigning...' : 'Assign'}
                    </button>

                    {/* Archive / Unarchive Action Button */}
                    {leadsDirectoryFilter === 'archived' ? (
                      <button
                        onClick={() => handleBulkArchive(false)}
                        disabled={bulkArchiveLoading}
                        className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-900/10 flex items-center justify-center whitespace-nowrap gap-1.5"
                      >
                        📂 {bulkArchiveLoading ? 'Restoring...' : 'Unarchive Selected'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBulkArchive(true)}
                        disabled={bulkArchiveLoading}
                        className="py-2 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-amber-900/10 flex items-center justify-center whitespace-nowrap gap-1.5"
                      >
                        📁 {bulkArchiveLoading ? 'Archiving...' : 'Archive Selected'}
                      </button>
                    )}
                    <button
                      onClick={() => setShowDeleteConfirmModal(true)}
                      disabled={bulkAssignLoading || bulkArchiveLoading || bulkDeleteLoading}
                      className="py-2 px-3 bg-red-650 hover:bg-red-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-red-900/10 flex items-center justify-center gap-1.5"
                      title="Permanently Delete Selected Leads"
                    >
                      <Trash2 size={14} />
                      <span className="hidden sm:inline">Delete</span>
                    </button>

                    <button
                      onClick={() => {
                        setSelectedLeadIds([]);
                        setBulkAssignTarget('');
                      }}
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 border border-slate-700/80 rounded-xl text-xs transition disabled:opacity-50"
                      disabled={bulkAssignLoading || bulkArchiveLoading || bulkDeleteLoading}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete Confirmation Modal Overlay */}
            {showDeleteConfirmModal && (
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
                  <div className="flex items-center gap-3 text-red-500 pb-2 border-b border-slate-800">
                    <ShieldAlert size={24} className="shrink-0 animate-bounce" />
                    <h3 className="font-bold text-md text-slate-200">Confirm Permanent Deletion</h3>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed py-2">
                    Are you absolutely sure you want to permanently delete <span className="text-red-400 font-bold font-mono">[{selectedLeadIds.length}]</span> selected leads from the database? 
                    <br />
                    <strong className="text-red-450 block mt-2">⚠️ Warning: This action is irreversible and the deleted records cannot be recovered.</strong>
                  </p>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setShowDeleteConfirmModal(false)}
                      disabled={bulkDeleteLoading}
                      className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-400 border border-slate-700 rounded-xl text-xs transition font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBulkDelete}
                      disabled={bulkDeleteLoading}
                      className="flex-1 py-2.5 bg-red-650 hover:bg-red-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-red-900/10 flex justify-center items-center gap-1.5"
                    >
                      {bulkDeleteLoading ? 'Deleting...' : 'Permanently Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}


          {/* TAB 3: TELECALLERS POOL */}
          {activeTab === 'staff' && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="font-bold text-md">Telecaller Staff Roster</h3>
                  <p className="text-xs text-slate-400">Manage telecaller accounts, edit their details, and toggle active status.</p>
                </div>
                <button
                  onClick={() => {
                    setShowAddCallerForm(!showAddCallerForm);
                    setNewCallerName('');
                    setNewCallerEmail('');
                    setNewCallerPhone('');
                    setNewCallerPassword('');
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs transition shrink-0"
                >
                  {showAddCallerForm ? <X size={14} /> : <Plus size={14} />}
                  <span>{showAddCallerForm ? 'Cancel' : 'Add New Telecaller'}</span>
                </button>
              </div>

              {/* Add Caller Form */}
              {showAddCallerForm && (
                <form 
                  onSubmit={handleAddNewTelecaller}
                  className="p-5 border border-slate-800 bg-slate-950 rounded-2xl grid grid-cols-1 sm:grid-cols-4 gap-4 items-end animate-in fade-in duration-200"
                >
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Agent Name"
                      value={newCallerName}
                      onChange={(e) => setNewCallerName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl focus:border-cyan-500 text-xs outline-none text-slate-100 placeholder-slate-600 transition"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email</label>
                    <input
                      type="email"
                      required
                      placeholder="agent@leadflow.com"
                      value={newCallerEmail}
                      onChange={(e) => setNewCallerEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl focus:border-cyan-500 text-xs outline-none text-slate-100 placeholder-slate-600 transition"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mobile Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543210"
                      value={newCallerPhone}
                      onChange={(e) => setNewCallerPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl focus:border-cyan-500 text-xs outline-none text-slate-100 placeholder-slate-600 transition"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Password</label>
                    <input
                      type="password"
                      required
                      placeholder="Min 6 chars"
                      value={newCallerPassword}
                      onChange={(e) => setNewCallerPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl focus:border-cyan-500 text-xs outline-none text-slate-100 placeholder-slate-600 transition"
                    />
                  </div>

                  <div className="sm:col-span-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={callerAddLoading}
                      className="py-2.5 px-6 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-cyan-900/10"
                    >
                      {callerAddLoading ? 'Creating Auth...' : 'Register Telecaller'}
                    </button>
                  </div>
                </form>
              )}

              {/* Roster Cards List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {telecallers.length === 0 ? (
                  <p className="col-span-2 text-xs text-slate-500 text-center py-8">No telecallers registered in system.</p>
                ) : (
                  telecallers.map((caller) => {
                    const assignedLeadsCount = leads.filter(l => l.assignedTo === caller.uid).length;
                    const callerConversions = leads.filter(l => l.assignedTo === caller.uid && l.status === 'Converted').length;

                    return (
                      <div key={caller.uid} className="p-4 border border-slate-800 bg-slate-950 hover:bg-slate-900/30 transition rounded-2xl flex items-center justify-between gap-4">
                        <div 
                          onClick={() => {
                            setEditingCallerUid(caller.uid);
                            setEditingCallerName(caller.name);
                            setEditingCallerEmail(caller.email);
                            setEditingCallerPhone(caller.phone || '');
                          }}
                          className="flex-1 min-w-0 cursor-pointer group"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-slate-200 group-hover:text-violet-400 transition truncate">{caller.name}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCallerUid(caller.uid);
                                setEditingCallerName(caller.name);
                                setEditingCallerEmail(caller.email);
                                setEditingCallerPhone(caller.phone || '');
                              }}
                              className="text-slate-500 hover:text-slate-300 p-1 hover:bg-slate-800 rounded-lg transition"
                              title="Edit Telecaller Info"
                            >
                              <Edit2 size={14} />
                            </button>
                          </div>
                          <p className="text-xs text-slate-400 group-hover:text-slate-300 transition truncate">Email: {caller.email}</p>
                          <p className="text-xs text-slate-400 group-hover:text-slate-300 transition truncate mt-0.5">Mobile: {caller.phone || '—'}</p>
                          <div className="flex gap-4 mt-3 text-[10px] font-mono text-slate-500">
                            <span>Leads: {assignedLeadsCount}</span>
                            <span className="text-emerald-500/80 font-bold">Conversions: {callerConversions}</span>
                          </div>
                        </div>

                        {/* Active/Inactive Toggle Switch ON/OFF */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className={`text-[9px] uppercase font-bold tracking-wider ${caller.active ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {caller.active ? 'Active' : 'Inactive'}
                          </span>
                          <button
                            onClick={() => handleToggleActiveState(caller)}
                            type="button"
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                              caller.active ? 'bg-emerald-500' : 'bg-slate-800'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                caller.active ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Edit Telecaller Info Modal Popup */}
              {editingCallerUid && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <h3 className="font-bold text-md text-slate-200">Edit Telecaller Details</h3>
                      <button 
                        onClick={() => setEditingCallerUid(null)}
                        className="p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div className="space-y-4 py-2">
                      {feedbackMsg.text && feedbackMsg.isError && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs transition duration-200">
                          ⚠️ {feedbackMsg.text}
                        </div>
                      )}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Full Name</label>
                        <input
                          type="text"
                          value={editingCallerName}
                          onChange={(e) => setEditingCallerName(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:border-violet-500 text-xs outline-none text-slate-100"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Address</label>
                        <input
                          type="email"
                          value={editingCallerEmail}
                          onChange={(e) => setEditingCallerEmail(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:border-violet-500 text-xs outline-none text-slate-100"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mobile Number</label>
                        <input
                          type="text"
                          placeholder="e.g. +91 9876543210"
                          value={editingCallerPhone}
                          onChange={(e) => setEditingCallerPhone(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:border-violet-500 text-xs outline-none text-slate-100"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 border-t border-slate-800 pt-4">
                      <button
                        onClick={() => setEditingCallerUid(null)}
                        className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-400 border border-slate-700 rounded-xl text-xs transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveCallerEdit(editingCallerUid)}
                        disabled={callerEditLoading}
                        className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-violet-900/10 flex justify-center items-center"
                      >
                        {callerEditLoading ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}



          {/* TAB 5: REPORTS & ANALYTICS */}
          {activeTab === 'reports' && (
            <ReportsTab leads={leads} telecallers={telecallers} />
          )}
                      
        </main>
      </div>

      {/* Ingest Bulk Leads Modal */}
      {showIngestModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="text-cyan-400" size={18} />
                <h3 className="font-bold text-md text-slate-200">Ingest Bulk Leads Sheets</h3>
              </div>
              <button 
                onClick={() => setShowIngestModal(false)}
                className="p-1.5 bg-slate-850 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 py-2">
              <p className="text-xs text-slate-400 leading-relaxed">
                Copy and paste columns from Excel or CSV. Format should be:
                <br />
                <span className="text-slate-350 font-mono font-bold block mt-1 bg-slate-950 p-2 rounded-lg text-center border border-slate-850">
                  Name, Phone, Email, Source, Notes
                </span>
                (Paste one lead record per line. Phone codes format automatically.)
              </p>

              <textarea
                rows={5}
                placeholder="Rohan Sharma, 9876543210, rohan@gmail.com, Google Ads, Price query
Amit Kumar, 8887776665, amit@yahoo.com, FB Campaign, callback after 5"
                value={bulkLeadInput}
                onChange={(e) => setBulkLeadInput(e.target.value)}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-cyan-500 text-xs font-mono text-slate-350 placeholder-slate-650 resize-none transition"
              />

              {/* Category / Label Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Lead Label / Targeted Audience (Optional):
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {['Students', 'Parents', 'Females', 'Teachers', 'Google Ads', 'Website Form'].map(lbl => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setBulkLeadLabel(lbl)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                        bulkLeadLabel === lbl
                          ? 'bg-violet-600/20 border-violet-500 text-violet-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      🏷️ {lbl}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Or type custom label (e.g. Winter Campaign, Pune Batch)"
                  value={bulkLeadLabel}
                  onChange={(e) => setBulkLeadLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:border-cyan-500 text-xs outline-none text-slate-100 placeholder-slate-650 resize-none transition"
                />
              </div>

              {/* Checklist of Active Telecallers to assign */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-slate-450 uppercase tracking-wider">
                  Assign to telecallers on upload (optional):
                </p>
                {telecallers.filter(t => t.active).length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic">No active telecallers in pool.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-1.5 bg-slate-950 border border-slate-850 rounded-xl">
                    {telecallers.filter(t => t.active).map(caller => {
                      const isSelected = selectedCallersForUpload.includes(caller.uid);
                      return (
                        <button
                          key={caller.uid}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedCallersForUpload(selectedCallersForUpload.filter(id => id !== caller.uid));
                            } else {
                              setSelectedCallersForUpload([...selectedCallersForUpload, caller.uid]);
                            }
                          }}
                          type="button"
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition ${
                            isSelected 
                              ? 'bg-cyan-600/10 border-cyan-500 text-cyan-400' 
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          👤 {caller.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-800 pt-4">
              <button
                onClick={() => setShowIngestModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-400 border border-slate-700 rounded-xl text-xs transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleBulkLeadUpload();
                  setShowIngestModal(false);
                }}
                disabled={bulkIngestLoading || !bulkLeadInput.trim()}
                className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-cyan-900/10 flex justify-center items-center gap-2"
              >
                <Upload size={14} />
                <span>{bulkIngestLoading ? 'Uploading...' : 'Ingest & Sync Leads'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead Splitter Modal */}
      {showSplitterModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="text-violet-400" size={18} />
                <h3 className="font-bold text-md text-slate-200">Round-Robin Lead Splitter</h3>
              </div>
              <button 
                onClick={() => setShowSplitterModal(false)}
                className="p-1.5 bg-slate-850 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-205 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 py-2">
              <p className="text-xs text-slate-400 leading-relaxed">
                Trigger equal split distribution of all currently unassigned leads across your active telecaller agents.
              </p>

              <div className="flex items-center justify-between bg-slate-950 p-4 border border-slate-800/80 rounded-xl">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Unassigned Leads</p>
                  <p className="text-xl font-black text-slate-200">{unassignedCount}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Active Staff</p>
                  <p className="text-xl font-black text-slate-205">
                    {telecallers.filter(t => t.active).length}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-800 pt-4">
              <button
                onClick={() => setShowSplitterModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-400 border border-slate-700 rounded-xl text-xs transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleAutoDistribution();
                  setShowSplitterModal(false);
                }}
                disabled={allocationLoading || unassignedCount === 0 || telecallers.filter(t => t.active).length === 0}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-violet-900/10 flex justify-center items-center gap-2"
              >
                {allocationLoading ? 'Splitting...' : 'Run Splitter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import History Modal */}
      {showBatchHistoryModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="text-violet-400" size={18} />
                <h3 className="font-bold text-md text-slate-200">Leads Import History</h3>
              </div>
              <button 
                onClick={() => setShowBatchHistoryModal(false)}
                className="p-1.5 bg-slate-850 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-205 transition"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed shrink-0">
              येथे पूर्वी केलेल्या सर्व बल्क अपलोड्सची यादी आहे. चुकीचा डेटा अपलोड झाला असल्यास, तुम्ही <strong>"Delete Batch (Rollback)"</strong> बटणावर क्लिक करून संपूर्ण बॅच एका क्लिकवर डेटाबेसमधून काढू शकता.
            </p>

            <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-800">
              {uploadBatches.length === 0 ? (
                <div className="text-center py-12 text-slate-550 font-bold uppercase tracking-wider">
                  कोणतीही अपलोड हिस्ट्री उपलब्ध नाही.
                </div>
              ) : (
                uploadBatches.map((batch) => {
                  const uploadDate = new Date(batch.uploadedAt);
                  const formattedDate = uploadDate.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  }) + ' ' + uploadDate.toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  const isLoading = rollbackLoadingBatchId === batch.id;

                  return (
                    <div 
                      key={batch.id} 
                      className="p-4 border border-slate-800 bg-slate-950/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-700 transition animate-in fade-in duration-200"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 bg-violet-950/40 border border-violet-800/30 rounded-lg text-violet-300 font-semibold text-[10px]">
                            🏷️ {batch.label}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 font-bold">
                            {batch.id}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-205">
                          {batch.leadCount} Leads Imported
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span>📅 {formattedDate}</span>
                          <span>•</span>
                          <span>👤 By {batch.uploadedBy}</span>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {batchIdToRollbackConfirm === batch.id ? (
                          <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right duration-250">
                            <span className="text-[10px] text-red-400 font-bold mr-1">नक्की डिलीट करायचे?</span>
                            <button
                              onClick={() => handleRollbackBatch(batch.id)}
                              disabled={isLoading}
                              className="py-1.5 px-3 bg-red-650 hover:bg-red-600 disabled:opacity-50 text-white font-bold rounded-lg text-[10px] transition"
                            >
                              {isLoading ? 'डिलिट होत आहे...' : 'हो'}
                            </button>
                            <button
                              onClick={() => setBatchIdToRollbackConfirm(null)}
                              disabled={isLoading}
                              className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] transition"
                            >
                              नाही
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setBatchIdToRollbackConfirm(batch.id)}
                            disabled={rollbackLoadingBatchId !== null}
                            className="py-2 px-3 bg-red-950/40 hover:bg-red-950 border border-red-900 hover:border-red-700 text-red-400 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                          >
                            <Trash2 size={12} />
                            <span>Delete Batch (Rollback)</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-slate-800 pt-4 flex justify-end shrink-0">
              <button
                onClick={() => setShowBatchHistoryModal(false)}
                className="py-2 px-5 bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 rounded-xl text-xs transition font-semibold"
              >
                बंद करा (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
