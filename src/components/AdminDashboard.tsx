import { useState, useEffect } from 'react';
import { UserProfile, Lead, Interaction, AuditLog } from '../types';
import { 
  ingestFirebaseLeads, 
  autoDistributeFirebaseLeads, 
  subscribeToLeads, 
  subscribeToTelecallers, 
  subscribeToAllInteractions, 
  subscribeToAuditLogs,
  bulkAssignLeads
} from '../lib/firebaseService';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
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
  BarChart3,
  Calendar,
  Clock,
  PhoneCall,
  Award,
  Sparkles,
  ShieldAlert,
  Trophy,
  Flame,
  Sun,
  Moon
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
  const [interactions, setInteractions] = useState<Interaction[]>([]);
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

  // Modals visibility states for operations
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [showSplitterModal, setShowSplitterModal] = useState(false);

  // Reports Filters States
  const [reportDateRange, setReportDateRange] = useState<'today' | 'yesterday' | '7days' | '30days' | 'all' | 'custom'>('all');
  const [reportCustomStartDate, setReportCustomStartDate] = useState('');
  const [reportCustomEndDate, setReportCustomEndDate] = useState('');
  const [reportTelecallerFilter, setReportTelecallerFilter] = useState('ALL');
  const [reportLabelFilter, setReportLabelFilter] = useState('ALL');
  const [reportStatusFilter, setReportStatusFilter] = useState('ALL');
  const [showReportRecords, setShowReportRecords] = useState(false);

  const handleToggleActiveState = async (caller: UserProfile) => {
    try {
      const userRef = doc(db, 'users', caller.uid);
      await updateDoc(userRef, {
        active: !caller.active
      });
      flashMessage(`Telecaller ${caller.name} is now ${!caller.active ? 'Active' : 'Inactive'}.`);
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
    const unsubInteractions = subscribeToAllInteractions((list) => setInteractions(list));
    const unsubLogs = subscribeToAuditLogs((list) => setAuditLogs(list));

    return () => {
      unsubLeads();
      unsubCallers();
      unsubInteractions();
      unsubLogs();
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
        let email = '';
        let name = '';
        let source = '';
        let notes = '';

        // 1. Identify Phone (contains 10-13 digits)
        let phoneIdx = -1;
        for (let i = 0; i < trimmed.length; i++) {
          const digits = trimmed[i].replace(/[^\d]/g, '');
          if (digits.length >= 10 && digits.length <= 13) {
            phone = trimmed[i];
            phoneIdx = i;
            break;
          }
        }

        // 2. Identify Email (contains '@')
        let emailIdx = -1;
        for (let i = 0; i < trimmed.length; i++) {
          if (i === phoneIdx) continue;
          if (trimmed[i].includes('@')) {
            email = trimmed[i];
            emailIdx = i;
            break;
          }
        }

        // 3. Identify Source/Platform (e.g. fb, ig, facebook, instagram, google, meta)
        let sourceIdx = -1;
        const platformKeywords = ['fb', 'ig', 'facebook', 'instagram', 'meta', 'google', 'campaign'];
        for (let i = 0; i < trimmed.length; i++) {
          if (i === phoneIdx || i === emailIdx) continue;
          if (platformKeywords.includes(trimmed[i].toLowerCase())) {
            source = trimmed[i];
            sourceIdx = i;
            break;
          }
        }

        // 4. Identify Name
        let nameIdx = -1;
        for (let i = 0; i < trimmed.length; i++) {
          if (i === phoneIdx || i === emailIdx || i === sourceIdx) continue;
          if (trimmed[i].length > 0) {
            if (name === '' || (trimmed[i].includes(' ') && !name.includes(' '))) {
              name = trimmed[i];
              nameIdx = i;
            }
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
      await ingestFirebaseLeads(adminUser.uid, adminUser.name, parsedLeads);
      flashMessage(`Successfully processed & distributed ${parsedLeads.length} leads directly in Firestore.`);
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
  const totalLeadsCount = leads.length;
  const convertedCount = leads.filter(l => l.status === 'Converted').length;
  const followupCount = leads.filter(l => l.status === 'Warm').length;
  const pendingCount = leads.filter(l => l.status !== 'Converted' && l.status !== 'Not Interested' && l.status !== 'Warm').length;
  const unassignedCount = leads.filter(l => l.assignedTo === null).length;

  const conversionRate = totalLeadsCount > 0 
    ? Math.round((convertedCount / totalLeadsCount) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top Banner */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3.5">
          {/* Sleek brand icon matching login screen */}
          <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800/80 flex items-center justify-center font-black text-white shadow-inner select-none">
            L<span className="text-indigo-500">.</span>
          </div>
          <div>
            <div className="flex items-end gap-0.5">
              <h1 className="text-sm font-black tracking-[0.2em] text-white leading-none">
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
            className="p-2 bg-zinc-900 hover:bg-red-500/10 border border-zinc-800 hover:border-red-500/30 text-zinc-400 hover:text-red-450 rounded-lg transition shadow-sm"
            title="Log Out"
          >
            <LogOut size={16} />
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
            { id: 'interactions', label: 'Call History Timeline', icon: Activity },
            { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 }
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
              const starCaller = (() => {
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
              const recentConversions = interactions
                .filter(item => item.statusAfter === 'Converted')
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 3);

              return (
                <div className="space-y-6">
                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Total Database Leads', count: totalLeadsCount, desc: 'Ingested records', color: 'text-violet-400', bg: 'bg-violet-500/5 border-violet-500/10', icon: FileSpreadsheet },
                      { label: 'Deals Closed (Converted)', count: convertedCount, desc: `${conversionRate}% Conversion Rate`, color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/10', icon: Trophy },
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
                          <div className={`p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 ${stat.color} group-hover:bg-slate-800/60 transition`}>
                            <Icon size={20} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Actionable Alerts Bar */}
                  <div className="space-y-3">
                    <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-500 flex items-center gap-1.5">
                      <Sparkles size={12} className="text-violet-400" />
                      <span>Interactive Smart Insights</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Alert 1: Unassigned leads alert */}
                      {unassignedCount > 0 ? (
                        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 backdrop-blur flex items-start gap-3 shadow-lg relative overflow-hidden group hover:border-amber-500/40 transition-all duration-300">
                          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                            <ShieldAlert size={18} className="animate-bounce" />
                          </div>
                          <div className="space-y-1 flex-1">
                            <p className="text-xs font-bold text-amber-300">Unassigned Leads Queue</p>
                            <p className="text-[10px] text-slate-400 leading-relaxed">
                              There are <strong className="text-amber-200">{unassignedCount} leads</strong> awaiting distribution. Split workload now.
                            </p>
                            <button
                              onClick={() => setShowSplitterModal(true)}
                              className="mt-2 text-[10px] font-bold text-white bg-amber-600 hover:bg-amber-500 px-3 py-1.5 rounded-lg transition shadow-md shadow-amber-900/20 flex items-center gap-1"
                            >
                              <ArrowRightLeft size={10} />
                              <span>Run Splitter Now</span>
                            </button>
                          </div>
                          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
                            <ShieldAlert size={80} className="text-amber-400" />
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 backdrop-blur flex items-start gap-3 shadow-lg relative overflow-hidden group hover:border-emerald-500/40 transition-all duration-300">
                          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                            <CheckCircle2 size={18} />
                          </div>
                          <div className="space-y-1 flex-1">
                            <p className="text-xs font-bold text-emerald-300">Queue Fully Assigned</p>
                            <p className="text-[10px] text-slate-400 leading-relaxed">
                              Great job! All database leads are currently allocated to callers. Workload is balanced.
                            </p>
                          </div>
                          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
                            <CheckCircle2 size={80} className="text-emerald-400" />
                          </div>
                        </div>
                      )}

                      {/* Alert 2: Star Caller alert */}
                      {starCaller ? (
                        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 backdrop-blur flex items-start gap-3 shadow-lg relative overflow-hidden group hover:border-emerald-500/40 transition-all duration-300">
                          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                            <Trophy size={18} className="animate-pulse" />
                          </div>
                          <div className="space-y-1 flex-1">
                            <p className="text-xs font-bold text-emerald-300">Star Caller recognition</p>
                            <p className="text-[10px] text-slate-400 leading-relaxed">
                              <strong className="text-emerald-250 font-bold">{starCaller.name}</strong> is leading with <strong className="text-emerald-300">{starCaller.converted} closed conversions</strong> ({starCaller.rate}% success).
                            </p>
                            <span className="inline-flex items-center gap-1 mt-2.5 text-[9px] uppercase font-bold tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                              🏆 Star Agent
                            </span>
                          </div>
                          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
                            <Trophy size={80} className="text-emerald-400" />
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 backdrop-blur flex items-start gap-3 shadow-lg relative overflow-hidden group hover:border-slate-700/80 transition-all duration-300">
                          <div className="p-2 rounded-xl bg-slate-800 text-slate-450 shrink-0">
                            <Users size={18} />
                          </div>
                          <div className="space-y-1 flex-1">
                            <p className="text-xs font-bold text-slate-300">Agent Activity Steady</p>
                            <p className="text-[10px] text-slate-500 leading-relaxed">
                              No closed conversions registered in this database batch yet. Callers are pitching.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Alert 3: Warm callback alert */}
                      {followupCount > 0 ? (
                        <div className="p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20 backdrop-blur flex items-start gap-3 shadow-lg relative overflow-hidden group hover:border-violet-500/40 transition-all duration-300">
                          <div className="p-2 rounded-xl bg-violet-500/20 text-violet-400 shrink-0">
                            <Flame size={18} className="animate-pulse" />
                          </div>
                          <div className="space-y-1 flex-1">
                            <p className="text-xs font-bold text-violet-300">Active Pipelines Warm</p>
                            <p className="text-[10px] text-slate-400 leading-relaxed">
                              There are <strong className="text-violet-200">{followupCount} leads</strong> marked as warm callbacks. Push for closures.
                            </p>
                            <button
                              onClick={() => setActiveTab('leads')}
                              className="mt-2 text-[10px] font-bold text-white bg-violet-600 hover:bg-violet-500 px-3 py-1.5 rounded-lg transition shadow-md shadow-violet-900/20 flex items-center gap-1"
                            >
                              <span>Manage Directory</span>
                            </button>
                          </div>
                          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
                            <Flame size={80} className="text-violet-400" />
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 backdrop-blur flex items-start gap-3 shadow-lg relative overflow-hidden group hover:border-slate-700/80 transition-all duration-300">
                          <div className="p-2 rounded-xl bg-slate-800 text-slate-450 shrink-0">
                            <Activity size={18} />
                          </div>
                          <div className="space-y-1 flex-1">
                            <p className="text-xs font-bold text-slate-300">System Healthy</p>
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
                              <strong className="text-slate-200 font-bold">{conv.callerName}</strong>
                              <span className="text-slate-400">converted</span>
                              <strong className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent font-black">{conv.notes ? conv.notes.split(' | ')[0] : 'a lead'}</strong>
                              <span className="text-[9px] font-mono text-slate-500">({conv.duration}s call)</span>
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
                          const getStatusMetrics = (status: string) => {
                            const count = leads.filter(l => l.status === status).length;
                            const percentage = totalLeadsCount > 0 ? Math.round((count / totalLeadsCount) * 100) : 0;
                            return { count, percentage };
                          };

                          return [
                            { status: 'New', color: 'bg-violet-500', barBg: 'bg-violet-950/30', border: 'border-violet-900/30', text: 'text-violet-400' },
                            { status: 'Warm', color: 'bg-amber-500', barBg: 'bg-amber-950/30', border: 'border-amber-900/30', text: 'text-amber-400' },
                            { status: 'Converted', color: 'bg-emerald-500', barBg: 'bg-emerald-950/30', border: 'border-emerald-900/30', text: 'text-emerald-400' },
                            { status: 'Not Interested', color: 'bg-red-500', barBg: 'bg-red-950/30', border: 'border-red-900/30', text: 'text-red-400' },
                            { status: 'Busy', color: 'bg-sky-500', barBg: 'bg-sky-950/30', border: 'border-sky-900/30', text: 'text-sky-400' },
                            { status: 'Ringing', color: 'bg-indigo-500', barBg: 'bg-indigo-950/30', border: 'border-indigo-900/30', text: 'text-indigo-400' },
                            { status: 'Cold', color: 'bg-slate-500', barBg: 'bg-slate-900/30', border: 'border-slate-800/30', text: 'text-slate-400' }
                          ].map(({ status, color, barBg, border, text }) => {
                            const { count, percentage } = getStatusMetrics(status);
                            return (
                              <div key={status} className="space-y-1">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-slate-355 font-medium">{status}</span>
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
                              <p className="text-[10px] text-slate-600 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</p>
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
          {activeTab === 'leads' && (
            <>
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-md">Leads Directory</h3>
                  <p className="text-xs text-slate-400 mt-1">Real-time database records list ({leads.length} total)</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-bold tracking-wider bg-slate-900/40">
                      <th className="p-4 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={leads.length > 0 && selectedLeadIds.length === leads.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLeadIds(leads.map(l => l.id));
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
                    {leads.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-500">
                          No leads in database. Use Bulk Upload to insert.
                        </td>
                      </tr>
                    ) : (
                      leads.map((lead) => {
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
                                lead.status === 'Warm' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
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
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl animate-in slide-in-from-bottom duration-300">
                <div className="bg-slate-900/80 border border-slate-800 backdrop-blur-md rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white shadow-lg shadow-violet-900/40">
                      {selectedLeadIds.length}
                    </span>
                    <span className="text-xs font-semibold text-slate-200">
                      leads selected
                    </span>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <select
                      value={bulkAssignTarget}
                      onChange={(e) => setBulkAssignTarget(e.target.value)}
                      disabled={bulkAssignLoading}
                      className="flex-1 sm:flex-none text-xs bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 outline-none focus:border-violet-500 text-slate-200 cursor-pointer disabled:opacity-50"
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
                      disabled={bulkAssignLoading || !bulkAssignTarget}
                      className="py-2 px-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-violet-900/10 flex items-center justify-center whitespace-nowrap"
                    >
                      {bulkAssignLoading ? 'Assigning...' : 'Assign'}
                    </button>

                    <button
                      onClick={() => {
                        setSelectedLeadIds([]);
                        setBulkAssignTarget('');
                      }}
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 border border-slate-700/80 rounded-xl text-xs transition disabled:opacity-50"
                      disabled={bulkAssignLoading}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

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

          {/* TAB 4: INTERACTION HISTORY */}
          {activeTab === 'interactions' && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-800/80">
                <h3 className="font-bold text-md">Call Interaction Logs</h3>
                <p className="text-xs text-slate-400 mt-1">Timeline logs of status updates pushed from callers</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-bold bg-slate-900/40">
                      <th className="p-4">Time</th>
                      <th className="p-4">Telecaller</th>
                      <th className="p-4">Flow Transition</th>
                      <th className="p-4">Notes / Details</th>
                      <th className="p-4">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {interactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500">
                          No call interactions recorded yet. Status updates will register here instantly.
                        </td>
                      </tr>
                    ) : (
                      interactions.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-900/30 transition">
                          <td className="p-4 text-slate-400 font-mono">
                            {new Date(item.timestamp).toLocaleString()}
                          </td>
                          <td className="p-4 font-bold text-violet-400">
                            👤 {item.callerName}
                          </td>
                          <td className="p-4 flex items-center gap-2 mt-1">
                            <span className="px-2 py-0.5 bg-slate-800 rounded-md text-[10px] text-slate-400">{item.statusBefore}</span>
                            <span>→</span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              item.statusAfter === 'Converted' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              item.statusAfter === 'Warm' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                              'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                            }`}>{item.statusAfter}</span>
                          </td>
                          <td className="p-4 text-slate-300 max-w-sm truncate" title={item.notes}>
                            {item.notes || '—'}
                          </td>
                          <td className="p-4 font-mono text-slate-500">
                            {item.duration}s
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: REPORTS & ANALYTICS */}
          {activeTab === 'reports' && (() => {
            // Helper function to check date ranges
            const isDateInRange = (dateStr: string) => {
              if (reportDateRange === 'all') return true;
              if (!dateStr) return false;
              const d = new Date(dateStr);
              if (isNaN(d.getTime())) return false;
              const now = new Date();
              
              const getMidnight = (date: Date) => {
                const temp = new Date(date);
                temp.setHours(0, 0, 0, 0);
                return temp;
              };
              
              const dMidnight = getMidnight(d);
              const nowMidnight = getMidnight(now);
              
              if (reportDateRange === 'today') {
                return dMidnight.getTime() === nowMidnight.getTime();
              }
              if (reportDateRange === 'yesterday') {
                const yesterday = new Date(nowMidnight);
                yesterday.setDate(yesterday.getDate() - 1);
                return dMidnight.getTime() === yesterday.getTime();
              }
              if (reportDateRange === '7days') {
                const boundary = new Date(nowMidnight);
                boundary.setDate(boundary.getDate() - 7);
                return d.getTime() >= boundary.getTime();
              }
              if (reportDateRange === '30days') {
                const boundary = new Date(nowMidnight);
                boundary.setDate(boundary.getDate() - 30);
                return d.getTime() >= boundary.getTime();
              }
              if (reportDateRange === 'custom') {
                const start = reportCustomStartDate ? new Date(reportCustomStartDate + 'T00:00:00') : null;
                const end = reportCustomEndDate ? new Date(reportCustomEndDate + 'T23:59:59') : null;
                if (start && d.getTime() < start.getTime()) return false;
                if (end && d.getTime() > end.getTime()) return false;
                return true;
              }
              return true;
            };

            // Filter leads
            const filteredReportLeads = leads.filter(l => {
              if (reportTelecallerFilter !== 'ALL' && l.assignedTo !== reportTelecallerFilter) return false;
              const lbl = l.label || 'General';
              if (reportLabelFilter !== 'ALL' && lbl !== reportLabelFilter) return false;
              if (reportStatusFilter !== 'ALL' && l.status !== reportStatusFilter) return false;
              return isDateInRange(l.updatedAt || '');
            });

            // Filter interactions
            const filteredReportInteractions = interactions.filter(item => {
              if (reportTelecallerFilter !== 'ALL' && item.callerId !== reportTelecallerFilter) return false;
              const lead = leads.find(l => l.id === item.leadId);
              const lbl = lead?.label || 'General';
              if (reportLabelFilter !== 'ALL' && lbl !== reportLabelFilter) return false;
              if (reportStatusFilter !== 'ALL' && item.statusAfter !== reportStatusFilter) return false;
              return isDateInRange(item.timestamp);
            });

            // Calculate KPIs
            const totalLeadsVolume = filteredReportLeads.length;
            const callsCompleted = filteredReportInteractions.length;
            const convertedDeals = filteredReportLeads.filter(l => l.status === 'Converted').length;
            
            const totalDuration = filteredReportInteractions.reduce((acc, item) => acc + (item.duration || 0), 0);
            const avgCallDuration = callsCompleted > 0 ? Math.round(totalDuration / callsCompleted) : 0;
            const conversionRate = totalLeadsVolume > 0 ? Math.round((convertedDeals / totalLeadsVolume) * 100) : 0;

            // Group interactions by date YYYY-MM-DD
            const activityByDate: { [dateStr: string]: number } = {};
            filteredReportInteractions.forEach(item => {
              if (item.timestamp) {
                const datePart = item.timestamp.substring(0, 10);
                activityByDate[datePart] = (activityByDate[datePart] || 0) + 1;
              }
            });
            const sortedDates = Object.keys(activityByDate).sort((a, b) => b.localeCompare(a)).slice(0, 10);

            // Detailed daily activity performance summary grouping
            const dailyPerformance: {
              [dateStr: string]: {
                calls: number;
                leadsCalled: Set<string>;
                conversions: number;
                callbacks: number;
                callers: Set<string>;
                totalDuration: number;
              }
            } = {};

            filteredReportInteractions.forEach(item => {
              if (item.timestamp) {
                const d = new Date(item.timestamp);
                if (!isNaN(d.getTime())) {
                  const datePart = d.toLocaleDateString('en-CA'); // YYYY-MM-DD local format
                  if (!dailyPerformance[datePart]) {
                    dailyPerformance[datePart] = {
                      calls: 0,
                      leadsCalled: new Set(),
                      conversions: 0,
                      callbacks: 0,
                      callers: new Set(),
                      totalDuration: 0
                    };
                  }
                  const day = dailyPerformance[datePart];
                  day.calls++;
                  if (item.leadId) day.leadsCalled.add(item.leadId);
                  if (item.callerId) day.callers.add(item.callerId);
                  if (item.statusAfter === 'Converted') day.conversions++;
                  if (item.statusAfter === 'Warm') day.callbacks++;
                  day.totalDuration += (item.duration || 0);
                }
              }
            });
            const sortedPerformanceDates = Object.keys(dailyPerformance).sort((a, b) => b.localeCompare(a));

            // Future follow-up pipeline agenda grouping
            const upcomingFollowups: {
              [dateStr: string]: {
                leads: Lead[];
                byCaller: { [callerName: string]: number };
              }
            } = {};

            leads.forEach(lead => {
              if (lead.status === 'Warm' && lead.followUpDate) {
                const datePart = lead.followUpDate; // YYYY-MM-DD
                if (!upcomingFollowups[datePart]) {
                  upcomingFollowups[datePart] = {
                    leads: [],
                    byCaller: {}
                  };
                }
                upcomingFollowups[datePart].leads.push(lead);
                
                let callerName = 'Unassigned';
                if (lead.assignedTo) {
                  const caller = telecallers.find(t => t.uid === lead.assignedTo);
                  if (caller) callerName = caller.name;
                }
                upcomingFollowups[datePart].byCaller[callerName] = (upcomingFollowups[datePart].byCaller[callerName] || 0) + 1;
              }
            });
            const sortedFollowupDates = Object.keys(upcomingFollowups).sort((a, b) => a.localeCompare(b));

            // Group status distribution stats
            const statusStats = [
              { status: 'New', color: 'bg-violet-500', barBg: 'bg-violet-950/30', border: 'border-violet-900/30', text: 'text-violet-400' },
              { status: 'Warm', color: 'bg-amber-500', barBg: 'bg-amber-950/30', border: 'border-amber-900/30', text: 'text-amber-400' },
              { status: 'Converted', color: 'bg-emerald-500', barBg: 'bg-emerald-950/30', border: 'border-emerald-900/30', text: 'text-emerald-400' },
              { status: 'Not Interested', color: 'bg-red-500', barBg: 'bg-red-950/30', border: 'border-red-900/30', text: 'text-red-400' },
              { status: 'Busy', color: 'bg-sky-500', barBg: 'bg-sky-950/30', border: 'border-sky-900/30', text: 'text-sky-400' },
              { status: 'Ringing', color: 'bg-indigo-500', barBg: 'bg-indigo-950/30', border: 'border-indigo-900/30', text: 'text-indigo-400' },
              { status: 'Cold', color: 'bg-slate-500', barBg: 'bg-slate-900/30', border: 'border-slate-800/30', text: 'text-slate-400' }
            ].map(item => {
              const count = filteredReportLeads.filter(l => l.status === item.status).length;
              const pct = totalLeadsVolume > 0 ? Math.round((count / totalLeadsVolume) * 100) : 0;
              return { ...item, count, pct };
            });

            // Get unique labels list for dropdown filter options
            const uniqueLabelsList = Array.from(new Set(leads.map(l => l.label || 'General'))).sort();

            // Telecaller Performance Leaderboard Grid calculation
            const telecallerReportList = telecallers.map(caller => {
              const callerLeads = filteredReportLeads.filter(l => l.assignedTo === caller.uid);
              const callerInteractions = filteredReportInteractions.filter(item => item.callerId === caller.uid);
              const workload = callerLeads.length;
              const callsDone = callerInteractions.length;
              const converted = callerLeads.filter(l => l.status === 'Converted').length;
              const callerConvRate = workload > 0 ? Math.round((converted / workload) * 100) : 0;
              const callerTotalDuration = callerInteractions.reduce((acc, item) => acc + (item.duration || 0), 0);
              const callerAvgDuration = callsDone > 0 ? Math.round(callerTotalDuration / callsDone) : 0;

              return {
                uid: caller.uid,
                name: caller.name,
                active: caller.active,
                workload,
                callsDone,
                converted,
                conversionRate: callerConvRate,
                avgDuration: callerAvgDuration
              };
            }).sort((a, b) => b.converted - a.converted || b.conversionRate - a.conversionRate);

            return (
              <div className="space-y-6">
                {/* Header title */}
                <div>
                  <h2 className="text-xl font-black tracking-wide bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">Reports & Performance Analytics</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Dynamically filter, monitor, and analyze calling activity, conversion rates, and staff metrics.
                  </p>
                </div>

                {/* Dashboard Filters Roster */}
                <div className="p-5 border border-slate-800 bg-slate-900/40 backdrop-blur rounded-2xl space-y-4 shadow-lg shadow-slate-950/20 group hover:border-slate-700/80 transition-all duration-300">
                  <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-500 flex items-center gap-2">
                    <Calendar size={14} className="text-violet-400" />
                    <span>Interactive Filters Control Deck</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                    {/* Date picker drop-down */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Date Range</label>
                      <select
                        value={reportDateRange}
                        onChange={(e) => setReportDateRange(e.target.value as any)}
                        className="w-full text-xs bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-violet-500 rounded-xl px-3 py-2.5 outline-none text-slate-205 cursor-pointer transition-all duration-200"
                      >
                        <option value="all">All-Time Database Records</option>
                        <option value="today">Today (Dailies)</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="7days">Last 7 Days</option>
                        <option value="30days">Last 30 Days</option>
                        <option value="custom">Custom Date Range</option>
                      </select>
                    </div>

                    {/* Filter by Telecaller staff */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Filter by Telecaller</label>
                      <select
                        value={reportTelecallerFilter}
                        onChange={(e) => setReportTelecallerFilter(e.target.value)}
                        className="w-full text-xs bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-violet-500 rounded-xl px-3 py-2.5 outline-none text-slate-205 cursor-pointer transition-all duration-200"
                      >
                        <option value="ALL">All Telecaller Staff</option>
                        {telecallers.map(caller => (
                          <option key={caller.uid} value={caller.uid}>
                            👤 {caller.name} {caller.active ? '' : '(Inactive)'}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Filter by Audience labels */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Filter by Lead Label</label>
                      <select
                        value={reportLabelFilter}
                        onChange={(e) => setReportLabelFilter(e.target.value)}
                        className="w-full text-xs bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-violet-500 rounded-xl px-3 py-2.5 outline-none text-slate-205 cursor-pointer transition-all duration-200"
                      >
                        <option value="ALL">All Audience Labels</option>
                        {uniqueLabelsList.map(lbl => (
                          <option key={lbl} value={lbl}>
                            🏷️ {lbl}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Filter by Call Status */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Filter by Call Status</label>
                      <select
                        value={reportStatusFilter}
                        onChange={(e) => setReportStatusFilter(e.target.value)}
                        className="w-full text-xs bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-violet-500 rounded-xl px-3 py-2.5 outline-none text-slate-205 cursor-pointer transition-all duration-200"
                      >
                        <option value="ALL">All Call Statuses</option>
                        <option value="New">New / Uncalled</option>
                        <option value="Warm">Warm / Follow-up</option>
                        <option value="Converted">Converted Deals</option>
                        <option value="Not Interested">Not Interested</option>
                        <option value="Busy">Busy / Cut Call</option>
                        <option value="Ringing">Ringing / No Answer</option>
                        <option value="Cold">Cold / Wrong Number</option>
                      </select>
                    </div>
                  </div>

                  {/* Custom Dates Inputs */}
                  {reportDateRange === 'custom' && (
                    <div className="grid grid-cols-2 gap-4 max-w-md pt-2 animate-in slide-in-from-top duration-200">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
                        <input
                          type="date"
                          value={reportCustomStartDate}
                          onChange={(e) => setReportCustomStartDate(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-202 outline-none focus:border-violet-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">End Date</label>
                        <input
                          type="date"
                          value={reportCustomEndDate}
                          onChange={(e) => setReportCustomEndDate(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-202 outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* KPI Cards Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  {[
                    { label: 'Leads Volume', count: totalLeadsVolume, desc: 'Targeted database', color: 'text-violet-400', bg: 'bg-violet-500/5 border-violet-500/10', icon: FileSpreadsheet },
                    { label: 'Completed Calls', count: callsCompleted, desc: 'Connected logs', color: 'text-cyan-400', bg: 'bg-cyan-500/5 border-cyan-500/10', icon: PhoneCall },
                    { label: 'Closed Conversions', count: convertedDeals, desc: 'Sales closed successfully', color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/10', icon: Trophy },
                    { label: 'Avg Call Duration', count: `${avgCallDuration}s`, desc: 'Average talktime rate', color: 'text-sky-400', bg: 'bg-sky-500/5 border-sky-500/10', icon: Clock },
                    { label: 'Conversion Rate', count: `${conversionRate}%`, desc: 'Success / Volume ratio', color: 'text-amber-400', bg: 'bg-amber-500/5 border-amber-500/10', icon: TrendingUp }
                  ].map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                      <div key={i} className={`p-5 rounded-2xl border ${stat.bg} shadow-md flex items-center justify-between group hover:scale-[1.02] hover:border-slate-700/80 transition-all duration-300`}>
                        <div className="space-y-1">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{stat.label}</p>
                          <p className={`text-2xl font-black mt-2 ${stat.color}`}>{stat.count}</p>
                          <p className="text-[9px] text-slate-500 mt-1">{stat.desc}</p>
                        </div>
                        <div className={`p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 ${stat.color} group-hover:bg-slate-800/60 transition shrink-0`}>
                          <Icon size={16} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Visual Panels Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Status distribution funnel */}
                  <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4 shadow-md group hover:border-slate-700/80 transition-all duration-300">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2 text-slate-200">
                        <BarChart3 className="text-violet-400" size={16} />
                        <span>Filter-specific Funnel</span>
                      </h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Pipeline status values matching selected filters</p>
                    </div>

                    <div className="space-y-3.5 pt-2 flex-1 flex flex-col justify-center">
                      {statusStats.map(({ status, barBg, border, text, count, pct }) => (
                        <div key={status} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-350 font-medium">{status}</span>
                            <span className="text-slate-500 text-[10px]">{count} leads <span className={`ml-1 font-bold ${text}`}>({pct}%)</span></span>
                          </div>
                          <div className={`h-2 w-full rounded-full ${barBg} border ${border} overflow-hidden`}>
                            <div className={`h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500`} style={{ width: `${pct}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Daily calling activity chart timeline */}
                  <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4 lg:col-span-2 shadow-md group hover:border-slate-700/80 transition-all duration-300">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2 text-slate-200">
                        <Activity className="text-cyan-400" size={16} />
                        <span>Daily Call Activity Timeline</span>
                      </h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Displays call volume density over the latest 10 active dates</p>
                    </div>

                    <div className="pt-2 space-y-3">
                      {sortedDates.length === 0 ? (
                        <div className="h-48 flex flex-col justify-center items-center text-slate-505 border border-dashed border-slate-800 rounded-xl">
                          <p className="text-xs">No calling logs match this selection filter.</p>
                          <p className="text-[10px] text-slate-650 mt-1">Make another filter selection to display timeline.</p>
                        </div>
                      ) : (
                        sortedDates.map(dt => {
                          const count = activityByDate[dt];
                          const scalePct = Math.min(Math.round((count / 30) * 100), 100);
                          return (
                            <div key={dt} className="flex items-center gap-4 text-xs">
                              <span className="w-24 shrink-0 font-mono text-slate-400 font-bold">{new Date(dt).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}</span>
                              <div className="flex-1 h-7 bg-slate-950/60 rounded-xl overflow-hidden border border-slate-850 flex items-center pr-3">
                                <div className="h-full bg-gradient-to-r from-cyan-600 to-violet-650 rounded-l-xl transition-all duration-500 flex items-center pl-3" style={{ width: `${scalePct || 5}%` }}>
                                  {scalePct > 15 && <span className="text-[9px] font-bold text-white whitespace-nowrap">{count} calls</span>}
                                </div>
                                {scalePct <= 15 && <span className="text-[9px] font-bold text-slate-400 ml-2 whitespace-nowrap">{count} calls</span>}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Daily Activity Performance Log & Upcoming Callbacks Agenda */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Daily Activity Performance Log Table */}
                  <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl lg:col-span-2 space-y-4 shadow-md group hover:border-slate-700/80 transition-all duration-300">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2 text-slate-200">
                        <Activity className="text-violet-400" size={16} />
                        <span>Daily Activity Performance Log</span>
                      </h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Granular day-by-day analysis of call volumes, unique leads, agent coverage, and conversions</p>
                    </div>

                    <div className="overflow-x-auto border border-slate-800/80 rounded-xl bg-slate-950/40">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase font-bold tracking-wider bg-slate-950/80">
                            <th className="p-3">Date</th>
                            <th className="p-3 text-center">Calls</th>
                            <th className="p-3 text-center">Unique Leads</th>
                            <th className="p-3 text-center">Conversions</th>
                            <th className="p-3 text-center">Reminders</th>
                            <th className="p-3 text-center">Agents</th>
                            <th className="p-3 text-right">Avg Talktime</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900">
                          {sortedPerformanceDates.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-6 text-center text-slate-500">
                                No activity log records for the selected filters.
                              </td>
                            </tr>
                          ) : (
                            sortedPerformanceDates.slice(0, 10).map(dt => {
                              const day = dailyPerformance[dt];
                              const avgSec = day.calls > 0 ? Math.round(day.totalDuration / day.calls) : 0;
                              return (
                                <tr key={dt} className="hover:bg-slate-900/20 transition text-slate-300">
                                  <td className="p-3 font-mono font-semibold text-slate-200">
                                    {new Date(dt + 'T00:00:00').toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}
                                  </td>
                                  <td className="p-3 text-center font-mono font-bold text-cyan-400">{day.calls}</td>
                                  <td className="p-3 text-center font-mono text-slate-400">{day.leadsCalled.size}</td>
                                  <td className="p-3 text-center font-mono text-emerald-400">+{day.conversions}</td>
                                  <td className="p-3 text-center font-mono text-amber-400">{day.callbacks}</td>
                                  <td className="p-3 text-center font-mono text-violet-400">{day.callers.size}</td>
                                  <td className="p-3 text-right font-mono font-semibold text-slate-400">{avgSec}s</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Upcoming Callbacks Agenda */}
                  <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4 shadow-md group hover:border-slate-700/80 transition-all duration-300 flex flex-col">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2 text-slate-200">
                        <Calendar className="text-amber-400" size={16} />
                        <span>Upcoming Callbacks Agenda</span>
                      </h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Chronological calendar of future Warm follow-up calls</p>
                    </div>

                    <div className="flex-1 overflow-y-auto max-h-[320px] space-y-4 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                      {sortedFollowupDates.length === 0 ? (
                        <div className="h-full min-h-[180px] flex flex-col justify-center items-center text-slate-550 border border-dashed border-slate-800 rounded-xl p-4">
                          <Calendar size={24} className="text-slate-700 mb-2" />
                          <p className="text-xs">No upcoming followups scheduled.</p>
                          <p className="text-[10px] text-slate-600 text-center mt-1">Telecallers will see client-requested callback dates here once they set reminder dates.</p>
                        </div>
                      ) : (
                        sortedFollowupDates.map(dt => {
                          const group = upcomingFollowups[dt];
                          return (
                            <div key={dt} className="space-y-2 border-l-2 border-amber-500/30 pl-3">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-black text-amber-500 uppercase tracking-wider">
                                  {new Date(dt + 'T00:00:00').toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}
                                </span>
                                <span className="text-[9px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20 font-bold">
                                  {group.leads.length} calls
                                </span>
                              </div>
                              <div className="space-y-1.5">
                                {group.leads.map(lead => {
                                  const caller = telecallers.find(t => t.uid === lead.assignedTo);
                                  return (
                                    <div key={lead.id} className="p-2 bg-slate-950/60 rounded-lg border border-slate-850 hover:border-slate-800 transition text-[11px] space-y-1">
                                      <div className="flex justify-between items-start">
                                        <span className="font-bold text-slate-200">{lead.name}</span>
                                        <span className="text-[9px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-400">{lead.label || 'General'}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-[9px] text-slate-500">
                                        <PhoneCall size={10} className="shrink-0" />
                                        <span>{lead.phone}</span>
                                        <span className="text-slate-700">•</span>
                                        <Users size={10} className="shrink-0" />
                                        <span className="truncate">{caller?.name || 'Unassigned'}</span>
                                      </div>
                                      {lead.notes && (
                                        <p className="text-[10px] text-slate-400 italic line-clamp-1 border-t border-slate-900 pt-1 mt-1">
                                          "{lead.notes}"
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Telecaller Performance Leaderboard Table */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden shadow-lg shadow-slate-950/20 group hover:border-slate-700/80 transition-all duration-300">
                  <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-md flex items-center gap-2">
                        <Award className="text-amber-400" size={18} />
                        <span>Staff Roster Performance Leaderboard</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">Compare caller workloads, closed conversions, conversion rates, and call durations.</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 uppercase font-bold tracking-wider bg-slate-950/40">
                          <th className="p-4 w-12 text-center">Rank</th>
                          <th className="p-4">Telecaller</th>
                          <th className="p-4 text-center">Allocated Workload</th>
                          <th className="p-4 text-center">Completed Calls</th>
                          <th className="p-4 text-center">Closed Deals</th>
                          <th className="p-4 text-center">Success Ratio</th>
                          <th className="p-4 text-center">Avg Talktime</th>
                          <th className="p-4 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {telecallerReportList.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-slate-500">
                              No telecaller staff available for analytics.
                            </td>
                          </tr>
                        ) : (
                          telecallerReportList.map((item, idx) => {
                            const medals = ['🥇', '🥈', '🥉', '👤'];
                            const medal = idx < 3 ? medals[idx] : medals[3];
                            return (
                              <tr key={item.uid} className="hover:bg-slate-950/30 transition border-b border-slate-850/50">
                                <td className="p-4 text-center text-sm font-bold font-mono">
                                  {idx + 1}
                                </td>
                                <td className="p-4 font-bold text-slate-200 flex items-center gap-2">
                                  <span className="text-md shrink-0">{medal}</span>
                                  <span>{item.name}</span>
                                </td>
                                <td className="p-4 text-center font-mono font-semibold text-slate-350">{item.workload} leads</td>
                                <td className="p-4 text-center font-mono font-semibold text-cyan-400">{item.callsDone} interactions</td>
                                <td className="p-4 text-center font-mono font-semibold text-emerald-400">+{item.converted} conversions</td>
                                <td className="p-4 text-center font-mono">
                                  <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${
                                    item.conversionRate >= 40 ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20' :
                                    item.conversionRate >= 15 ? 'bg-amber-500/10 text-amber-450 border border-amber-500/20' :
                                    'bg-slate-800 text-slate-400'
                                  }`}>
                                    {item.conversionRate}% Success
                                  </span>
                                </td>
                                <td className="p-4 text-center font-mono text-slate-400 font-semibold">{item.avgDuration}s / call</td>
                                <td className="p-4 text-right">
                                  <span className={`px-2.5 py-1 rounded-full font-extrabold text-[9px] uppercase border flex items-center gap-1.5 w-fit ml-auto ${
                                    item.active 
                                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-450' 
                                      : 'bg-slate-950 border-slate-900 text-slate-650'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${item.active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-650'}`}></span>
                                    <span>{item.active ? 'Active' : 'Off-duty'}</span>
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 🔍 Matched Leads Explorer Collapsible Grid Section */}
                <div className="space-y-4 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-200">Matched Lead Records Explorer</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Explore individual records matching the chosen date range, telecaller and label filters</p>
                    </div>
                    <button
                      onClick={() => setShowReportRecords(!showReportRecords)}
                      className={`py-2 px-4 font-bold rounded-xl text-xs transition duration-200 flex items-center gap-2 border ${
                        showReportRecords
                          ? 'bg-violet-950/40 border-violet-800 text-violet-300 hover:bg-violet-900/40'
                          : 'bg-violet-600 hover:bg-violet-500 border-transparent text-white shadow-lg shadow-violet-950/30'
                      }`}
                    >
                      <span>{showReportRecords ? '🙈 Hide Records' : `🔍 View Matched Records (${filteredReportLeads.length})`}</span>
                    </button>
                  </div>

                  {showReportRecords && (
                    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top duration-300 shadow-xl shadow-slate-950/20">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 uppercase font-bold tracking-wider bg-slate-950/40">
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
                            {filteredReportLeads.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-8 text-center text-slate-500">
                                  No lead records match the selected interactive filters.
                                </td>
                              </tr>
                            ) : (
                              filteredReportLeads.map((lead) => {
                                const assignedCaller = telecallers.find(t => t.uid === lead.assignedTo);
                                
                                // Source Tag Styling logic
                                const getSourceTagStyles = (sourceStr: string) => {
                                  const s = (sourceStr || '').toLowerCase();
                                  if (s === 'fb' || s === 'facebook') {
                                    return 'bg-indigo-950/40 border-indigo-900/30 text-indigo-400';
                                  }
                                  if (s === 'ig' || s === 'instagram') {
                                    return 'bg-pink-950/40 border-pink-900/30 text-pink-400';
                                  }
                                  if (s.includes('google')) {
                                    return 'bg-cyan-950/40 border-cyan-900/30 text-cyan-400';
                                  }
                                  if (s.includes('web')) {
                                    return 'bg-teal-950/40 border-teal-900/30 text-teal-400';
                                  }
                                  return 'bg-slate-850 border-slate-800 text-slate-400';
                                };

                                return (
                                  <tr key={lead.id} className="hover:bg-slate-950/30 transition border-b border-slate-850/50">
                                    <td className="p-4 font-bold text-slate-205">{lead.name}</td>
                                    <td className="p-4 font-mono text-slate-400">{lead.phone}</td>
                                    <td className="p-4">
                                      <span className={`px-2.5 py-1 rounded-lg font-medium border text-[10px] ${getSourceTagStyles(lead.source)}`}>
                                        {lead.source}
                                      </span>
                                    </td>
                                    <td className="p-4">
                                      <span className="px-2.5 py-1 bg-violet-950/45 border border-violet-850/30 rounded-lg text-violet-300 font-bold text-[10px] flex items-center gap-1.5 w-fit">
                                        🏷️ {lead.label || 'General'}
                                      </span>
                                    </td>
                                    <td className="p-4 text-slate-350">
                                      {assignedCaller ? (
                                        <span className="font-semibold text-violet-400">👤 {assignedCaller.name}</span>
                                      ) : (
                                        <span className="text-slate-500 italic">Unassigned</span>
                                      )}
                                    </td>
                                    <td className="p-4">
                                      <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] uppercase border ${
                                        lead.status === 'Converted' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                        lead.status === 'Warm' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
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
                  )}
                </div>
              </div>
            );
          })()}
                      
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
    </div>
  );
}
