import { useState, useEffect } from 'react';
import { UserProfile, Lead } from '../types';
import { subscribeToLeads, logFirebaseAction, getPrimaryCategory } from '../lib/firebaseService';
import { db } from '../lib/firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { 
  ArrowLeft, 
  LogOut, 
  Phone, 
  Sparkles,
  Sun,
  Moon,
  Search,
  Calendar
} from 'lucide-react';

interface TelecallerDashboardProps {
  callerUser: UserProfile;
  onLogout: () => void;
  onBackToAdmin?: () => void;
  isAdminSimulation?: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

type TelecallerCategory = 'PENDING' | 'FOLLOWUP' | 'VISIT_SCHEDULED' | 'VISITED' | 'ATTEMPTED' | 'CONVERTED' | 'REJECTED';

export default function TelecallerDashboard({ 
  callerUser, 
  onLogout, 
  onBackToAdmin,
  isAdminSimulation = false,
  theme,
  toggleTheme
}: TelecallerDashboardProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('Follow-up');
  const [remarkNotes, setRemarkNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followupSubFilter, setFollowupSubFilter] = useState<'due' | 'future'>('due');
  const [isSaving, setIsSaving] = useState(false);
  
  // 100% Android App Parity Category State
  const [filterType, setFilterType] = useState<TelecallerCategory>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [callStartTimestamp, setCallStartTimestamp] = useState<number | null>(null);

  // Load leads real-time assigned to this telecaller
  useEffect(() => {
    const unsub = subscribeToLeads((list) => {
      setLeads(list);
    }, callerUser.uid);

    return () => unsub();
  }, [callerUser.uid]);

  // Active leads only (not archived)
  const activeLeads = leads.filter(l => !l.archived);
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

  // Android App Parity Counts Engine (Exact 1:1 match with Mobile Screenshot)
  const categoryCounts: Record<TelecallerCategory, number> = {
    PENDING: 0,
    FOLLOWUP: 0,
    VISIT_SCHEDULED: 0,
    VISITED: 0,
    ATTEMPTED: 0,
    CONVERTED: 0,
    REJECTED: 0
  };

  activeLeads.forEach(lead => {
    const cat = getPrimaryCategory(lead) as TelecallerCategory;
    if (categoryCounts[cat] !== undefined) {
      categoryCounts[cat]++;
    }
  });

  // Filter list by selected Category & Search Query
  const filteredLeads = activeLeads.filter(lead => {
    const cat = getPrimaryCategory(lead);
    if (cat !== filterType) return false;

    if (filterType === 'FOLLOWUP') {
      if (followupSubFilter === 'due') {
        if (!!lead.followUpDate && lead.followUpDate > todayStr) return false;
      } else {
        if (!lead.followUpDate || lead.followUpDate <= todayStr) return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const nameMatch = (lead.name || '').toLowerCase().includes(q);
      const phoneMatch = (lead.phone || '').toLowerCase().includes(q);
      const notesMatch = (lead.notes || '').toLowerCase().includes(q);
      return nameMatch || phoneMatch || notesMatch;
    }

    return true;
  });

  const handleCopyAndCall = (lead: Lead) => {
    const cleanNum = lead.phone.replace(/[^\d+]/g, '');
    navigator.clipboard.writeText(cleanNum);
    
    alert(`[Simulating Native Android Dialer]\nNumber Copied: ${cleanNum}\nWhatsApp trigger: https://wa.me/${cleanNum.replace('+', '')}\nOpening call disposition form.`);

    setCallStartTimestamp(Date.now());
    setSelectedLead(lead);
    setSelectedStatus(lead.status === 'New' ? 'Follow-up' : lead.status || 'Follow-up');
    setRemarkNotes(lead.notes || '');
    setFollowUpDate(lead.followUpDate || '');
    setShowPopup(true);
  };

  const handleSaveResult = async () => {
    if (!selectedLead) return;
    setIsSaving(true);

    try {
      const leadDocRef = doc(db, 'leads', selectedLead.id);
      
      const isAttemptedStatus = ['Follow-up', 'Busy', 'Ringing', 'No Answer', 'Warm Lead'].includes(selectedStatus);
      const currentAttempts = selectedLead.attemptCount || 0;
      const newAttempts = isAttemptedStatus ? currentAttempts + 1 : currentAttempts;
      const willBeAutoRejected = isAttemptedStatus && newAttempts >= 3 && selectedStatus !== 'Follow-up' && selectedStatus !== 'Converted';
      const finalStatus = willBeAutoRejected ? 'Rejected (3+ Attempts)' : selectedStatus;

      const updatePayload: any = {
        status: finalStatus,
        notes: remarkNotes,
        updatedAt: new Date().toISOString(),
        attemptCount: newAttempts
      };

      if (finalStatus === 'Follow-up') {
        updatePayload.followUpDate = followUpDate || todayStr;
      } else {
        updatePayload.followUpDate = null;
      }

      if (finalStatus === 'Visited') {
        updatePayload.visited = true;
      }

      await updateDoc(leadDocRef, updatePayload);

      if (willBeAutoRejected) {
        const cleanNum = selectedLead.phone.replace(/[^\d+]/g, '').replace('+', '');
        const msg = encodeURIComponent(`Hi ${selectedLead.name}, we tried reaching you from Finesse Overseas Education / LeadFlow regarding our services, but couldn't connect. Since we haven't been able to reach you after multiple attempts, we are closing your inquiry for now. Please feel free to message us here whenever you're ready!`);
        window.open(`https://wa.me/${cleanNum}?text=${msg}`, '_blank');
      }

      let durationSeconds = 30;
      if (callStartTimestamp) {
        const diff = Math.floor((Date.now() - callStartTimestamp) / 1000);
        durationSeconds = Math.min(Math.max(diff, 1), 3600);
      }

      const logId = 'i-' + Math.random().toString(36).substring(2, 8);
      const interactionRef = doc(db, 'interactions', logId);
      await setDoc(interactionRef, {
        id: logId,
        leadId: selectedLead.id,
        callerId: callerUser.uid,
        callerName: callerUser.name,
        statusBefore: selectedLead.status || 'New',
        statusAfter: finalStatus,
        notes: remarkNotes,
        timestamp: new Date().toISOString(),
        duration: durationSeconds
      });

      await logFirebaseAction(
        "Call Disposition",
        `Caller ${callerUser.name} updated Lead ${selectedLead.name} status to ${finalStatus} (Duration: ${durationSeconds}s)${willBeAutoRejected ? ' [Auto-Rejected after 3 attempts]' : ''}`,
        callerUser.uid,
        callerUser.name
      );

      setShowPopup(false);
      setSelectedLead(null);
      setRemarkNotes('');
      setFollowUpDate('');
      setCallStartTimestamp(null);
    } catch (err: any) {
      alert("Failed to save call disposition: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Simulation notch indicator */}
      {isAdminSimulation && (
        <div className="absolute top-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[10px] font-bold uppercase tracking-wider py-1 px-4 rounded-full flex items-center gap-1.5 z-50">
          <Sparkles size={10} />
          <span>Simulated Mobile View (100% Android App Parity)</span>
        </div>
      )}

      {/* Smartphone Container wrapper */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[40px] shadow-2xl overflow-hidden flex flex-col h-[820px] relative">
        
        {/* Notch overlay */}
        <div className="w-full bg-zinc-950 h-7 flex justify-center items-center relative shrink-0">
          <div className="w-32 h-4 bg-zinc-900 rounded-b-xl absolute top-0"></div>
        </div>

        {/* Top Header - Finesse Branding Parity */}
        <div className="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/40 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            {isAdminSimulation && onBackToAdmin && (
              <button 
                onClick={onBackToAdmin}
                className="p-1.5 bg-zinc-800 border border-zinc-700 hover:border-zinc-650 rounded-lg text-zinc-300 hover:text-white transition"
                title="Back to Admin"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-zinc-100 font-black tracking-[0.15em] select-none">FINESSE / LEADFLOW</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-[9px] text-zinc-400 font-bold ml-1">Online</span>
              </div>
              <h2 className="text-sm font-black text-zinc-200 mt-0.5 truncate max-w-[160px]">Hi, {callerUser.name}</h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-1.5 bg-zinc-800 border border-zinc-700 hover:border-zinc-650 rounded-lg text-zinc-400 hover:text-white transition flex items-center justify-center"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
            </button>

            <button
              onClick={onLogout}
              className="flex items-center gap-1 text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg px-2.5 py-1.5 transition"
            >
              <LogOut size={12} />
              <span>Exit</span>
            </button>
          </div>
        </div>

        {/* Search Bar - Exact Parity with Screenshot */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search leads, numbers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-200 outline-none placeholder:text-slate-500 transition shadow-inner font-medium"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs font-bold">✕</button>
            )}
          </div>
        </div>

        {/* Explore Lists Title */}
        <div className="px-5 pt-2 pb-1 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Explore Lists (1:1 Android Parity)</span>
        </div>

        {/* 7-Card Grid - Exact Replica of Mithila's Android App Screenshot */}
        <div className="grid grid-cols-2 gap-2.5 px-4 py-2 shrink-0 max-h-[220px] overflow-y-auto">
          {[
            { id: 'PENDING', label: 'Pending', count: categoryCounts.PENDING, dot: 'bg-amber-400', bg: 'bg-amber-500/10 border-amber-500/20 text-amber-300' },
            { id: 'FOLLOWUP', label: 'Follow-ups', count: categoryCounts.FOLLOWUP, dot: 'bg-blue-400', bg: 'bg-blue-500/10 border-blue-500/20 text-blue-300' },
            { id: 'VISIT_SCHEDULED', label: 'Visit Sch.', count: categoryCounts.VISIT_SCHEDULED, dot: 'bg-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' },
            { id: 'VISITED', label: 'Visited', count: categoryCounts.VISITED, dot: 'bg-emerald-400', bg: 'bg-purple-500/10 border-purple-500/20 text-purple-300' },
            { id: 'ATTEMPTED', label: 'Attempted', count: categoryCounts.ATTEMPTED, dot: 'bg-purple-400', bg: 'bg-violet-500/10 border-violet-500/20 text-violet-300' },
            { id: 'CONVERTED', label: 'Converted', count: categoryCounts.CONVERTED, dot: 'bg-emerald-400', bg: 'bg-teal-500/10 border-teal-500/20 text-teal-300' },
            { id: 'REJECTED', label: 'Rejected', count: categoryCounts.REJECTED, dot: 'bg-rose-400', bg: 'bg-rose-500/10 border-rose-500/20 text-rose-300', colSpan: 'col-span-2' }
          ].map(card => {
            const isSelected = filterType === card.id;
            return (
              <button
                key={card.id}
                onClick={() => setFilterType(card.id as TelecallerCategory)}
                className={`p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${card.colSpan || ''} ${
                  isSelected 
                    ? 'bg-slate-800 border-violet-500 shadow-lg scale-[1.02] ring-1 ring-violet-500/50' 
                    : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-300">{card.label}</span>
                  <span className={`w-2 h-2 rounded-full ${card.dot} shadow-sm`}></span>
                </div>
                <div className="text-2xl font-black font-mono text-slate-100">{card.count}</div>
              </button>
            );
          })}
        </div>

        {/* Sub-header for active category view */}
        <div className="px-5 pt-3 pb-1 border-t border-slate-800/80 mt-1 flex justify-between items-center shrink-0 bg-slate-950/40">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-violet-400 flex items-center gap-1.5">
            <span>●</span>
            <span>Showing: {filterType} ({filteredLeads.length})</span>
          </span>

          {filterType === 'FOLLOWUP' && (
            <div className="flex gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              <button
                onClick={() => setFollowupSubFilter('due')}
                className={`px-2 py-0.5 text-[9px] font-bold rounded transition ${followupSubFilter === 'due' ? 'bg-violet-600 text-white' : 'text-slate-400'}`}
              >
                Due Today ({activeLeads.filter(l => getPrimaryCategory(l) === 'FOLLOWUP' && (!l.followUpDate || l.followUpDate <= todayStr)).length})
              </button>
              <button
                onClick={() => setFollowupSubFilter('future')}
                className={`px-2 py-0.5 text-[9px] font-bold rounded transition ${followupSubFilter === 'future' ? 'bg-violet-600 text-white' : 'text-slate-400'}`}
              >
                Upcoming ({activeLeads.filter(l => getPrimaryCategory(l) === 'FOLLOWUP' && !!l.followUpDate && l.followUpDate > todayStr).length})
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Lead List Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-950/40">
          {filteredLeads.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800 m-2">
              <span className="text-3xl">☕</span>
              <p className="text-xs text-slate-400 font-bold mt-3">No leads in "{filterType}" right now!</p>
              <p className="text-[10px] text-slate-600 mt-1">Check other categories above.</p>
            </div>
          ) : (
            filteredLeads.map((lead) => {
              const maskedPhone = lead.phone.length >= 10 
                ? lead.phone.substring(0, 5) + '****' + lead.phone.slice(-2)
                : lead.phone;
                
              return (
                <div 
                  key={lead.id} 
                  className="p-3.5 bg-slate-900/80 border border-slate-800/80 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition space-y-2 shadow-sm"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-200">{lead.name}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] font-medium text-slate-400">Src: {lead.source || 'Direct'}</p>
                        {lead.attemptCount ? (
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${lead.attemptCount >= 3 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                            Attempt {lead.attemptCount}/3
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold uppercase bg-slate-800 border border-slate-700 text-violet-300">
                      {lead.status || 'New'}
                    </span>
                  </div>
                  
                  {lead.notes && (
                    <p className="text-xs text-slate-300 bg-slate-950/70 p-2 rounded-xl border border-slate-800/80 text-ellipsis line-clamp-2">
                      💬 Note: {lead.notes}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between text-[10px] font-mono text-slate-400 gap-2">
                    {lead.updatedAt ? (
                      <span>📞 Called: {new Date(lead.updatedAt).toLocaleDateString([], {month:'short', day:'numeric'})}</span>
                    ) : (
                      <span>🟢 Fresh Inquiry</span>
                    )}
                    {lead.followUpDate && (
                      <span className={`font-bold px-1.5 py-0.2 rounded ${lead.followUpDate <= todayStr ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-blue-500/20 text-blue-300'}`}>
                        📅 Callback: {lead.followUpDate}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-1.5 pt-1">
                    <button
                      onClick={() => handleCopyAndCall(lead)}
                      className="flex-1 py-2 px-2.5 bg-violet-600 hover:bg-violet-500 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1 shadow-md shadow-violet-900/20 active:scale-95"
                    >
                      <Phone size={12} />
                      <span className="truncate">Call {maskedPhone}</span>
                    </button>
                    <button
                      onClick={() => {
                        const cleanNum = lead.phone.replace(/[^\d+]/g, '').replace('+', '');
                        const msg = encodeURIComponent(`Hi ${lead.name}, connecting from Finesse Overseas Education / LeadFlow CRM. Regarding your inquiry, let us know how we can help!`);
                        window.open(`https://wa.me/${cleanNum}?text=${msg}`, '_blank');
                      }}
                      className="py-2 px-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs rounded-xl border border-emerald-500/20 transition flex items-center justify-center gap-1"
                      title="Quick WhatsApp"
                    >
                      💬 WA
                    </button>
                    <button
                      onClick={() => {
                        setSelectedLead(lead);
                        setSelectedStatus(lead.status === 'New' ? 'Follow-up' : lead.status || 'Follow-up');
                        setRemarkNotes(lead.notes || '');
                        setShowPopup(true);
                      }}
                      className="py-2 px-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition"
                    >
                      Status
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal save outcome dialog */}
        {showPopup && selectedLead && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-end justify-center p-3">
            <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-200 max-h-[90%] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-200">Call Disposition (Update Status)</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">{selectedLead.name} ({selectedLead.phone})</p>
                </div>
                <button onClick={() => setShowPopup(false)} className="text-slate-500 hover:text-white font-bold text-sm">✕</button>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  1. Select Outcome Status (100% Android Parity):
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    'Follow-up', 'Visit Scheduled', 'Visited', 
                    'Converted', 'Busy', 'Ringing', 
                    'No Answer', 'Not Interested', 'Invalid'
                  ].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setSelectedStatus(opt)}
                      className={`py-2 text-[10px] font-extrabold rounded-xl border transition ${
                        selectedStatus === opt 
                          ? 'bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-900/30' 
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  2. Quick Remarks Tags:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {['Customer busy', 'Price query', 'Call tomorrow', 'WhatsApp sent', 'Site visit planned', 'Not answering'].map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setRemarkNotes(prev => prev ? `${prev} | ${tag}` : tag)}
                      className="py-1 px-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-lg text-[10px] transition font-medium"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              {selectedStatus === 'Follow-up' && (
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase font-bold text-amber-400 tracking-wider flex items-center gap-1">
                    <Calendar size={12} />
                    <span>📅 Next Follow-up Date (रिमाइंडर तारीख):</span>
                  </label>
                  <input
                    type="date"
                    min={todayStr}
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-xl outline-none text-xs text-slate-200 transition font-mono font-bold"
                    required
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  3. Conversation Notes / Remarks:
                </label>
                <textarea
                  rows={2}
                  placeholder="Enter detailed notes of what the customer said..."
                  value={remarkNotes}
                  onChange={(e) => setRemarkNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-xl outline-none text-xs text-slate-200 resize-none transition font-medium"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => {
                    setShowPopup(false);
                    setSelectedLead(null);
                    setFollowUpDate('');
                    setCallStartTimestamp(null);
                  }}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveResult}
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition shadow-lg shadow-emerald-900/20 flex justify-center items-center gap-1"
                >
                  {isSaving ? 'Saving...' : '✓ Save Outcome & Sync'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
