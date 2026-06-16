import { useState, useEffect } from 'react';
import { UserProfile, Lead } from '../types';
import { subscribeToLeads, logFirebaseAction } from '../lib/firebaseService';
import { db } from '../lib/firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { 
  ArrowLeft, 
  LogOut, 
  Phone, 
  Sparkles,
  Sun,
  Moon
} from 'lucide-react';

interface TelecallerDashboardProps {
  callerUser: UserProfile;
  onLogout: () => void;
  onBackToAdmin?: () => void; // Optional if admin simulated it
  isAdminSimulation?: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

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
  const [selectedStatus, setSelectedStatus] = useState<'Converted' | 'Warm' | 'Not Interested' | 'Busy' | 'Ringing' | 'Cold'>('Warm');
  const [remarkNotes, setRemarkNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followupSubFilter, setFollowupSubFilter] = useState<'due' | 'future'>('due');
  const [isSaving, setIsSaving] = useState(false);
  const [filterType, setFilterType] = useState<'pending' | 'converted' | 'followup'>('pending');

  // Load leads real-time assigned to this telecaller
  useEffect(() => {
    const unsub = subscribeToLeads((list) => {
      setLeads(list);
    }, callerUser.uid);

    return () => unsub();
  }, [callerUser.uid]);

  // Filter lists
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const filteredLeads = leads.filter(lead => {
    if (filterType === 'pending') {
      return lead.status !== 'Converted' && lead.status !== 'Not Interested' && lead.status !== 'Warm';
    } else if (filterType === 'followup') {
      if (followupSubFilter === 'due') {
        return lead.status === 'Warm' && (!lead.followUpDate || lead.followUpDate <= todayStr);
      } else {
        return lead.status === 'Warm' && !!lead.followUpDate && lead.followUpDate > todayStr;
      }
    } else {
      return lead.status === 'Converted';
    }
  });

  const handleCopyAndCall = (lead: Lead) => {
    // 1. Copy to clipboard
    const cleanNum = lead.phone.replace(/[^\d+]/g, '');
    navigator.clipboard.writeText(cleanNum);
    
    // Simulate Dial alert
    alert(`[Simulating Native Dialer]\nNumber Copied: ${cleanNum}\nWhatsApp trigger links: https://wa.me/${cleanNum.replace('+', '')}\nOpening call results form.`);

    // 2. Open result popup
    setSelectedLead(lead);
    setSelectedStatus(lead.status === 'New' ? 'Warm' : lead.status as any);
    setRemarkNotes('');
    setFollowUpDate(lead.followUpDate || '');
    setShowPopup(true);
  };

  const handleSaveResult = async () => {
    if (!selectedLead) return;
    setIsSaving(true);

    try {
      const leadDocRef = doc(db, 'leads', selectedLead.id);
      
      // Update Lead Status
      const updatePayload: any = {
        status: selectedStatus,
        notes: remarkNotes,
        updatedAt: new Date().toISOString()
      };

      if (selectedStatus === 'Warm') {
        updatePayload.followUpDate = followUpDate || null;
      } else {
        updatePayload.followUpDate = null;
      }

      await updateDoc(leadDocRef, updatePayload);

      // Create interaction document log
      const logId = 'i-' + Math.random().toString(36).substring(2, 8);
      const interactionRef = doc(db, 'interactions', logId);
      await setDoc(interactionRef, {
        id: logId,
        leadId: selectedLead.id,
        callerId: callerUser.uid,
        callerName: callerUser.name,
        statusBefore: selectedLead.status,
        statusAfter: selectedStatus,
        notes: remarkNotes,
        timestamp: new Date().toISOString(),
        duration: 30 // Dummy simulated value
      });

      // Save audit timeline action
      await logFirebaseAction(
        "Call Disposition",
        `Caller ${callerUser.name} updated Lead ${selectedLead.name} status to ${selectedStatus}`,
        callerUser.uid,
        callerUser.name
      );

      setShowPopup(false);
      setSelectedLead(null);
      setRemarkNotes('');
      setFollowUpDate('');
    } catch (err: any) {
      alert("Failed to save call disposition: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Simulation notch indicator */}
      {isAdminSimulation && (
        <div className="absolute top-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[10px] font-bold uppercase tracking-wider py-1 px-4 rounded-full flex items-center gap-1.5 z-50">
          <Sparkles size={10} />
          <span>Simulated Mobile View</span>
        </div>
      )}

      {/* Main smartphone notched container wrapper */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[40px] shadow-2xl overflow-hidden flex flex-col h-[780px] relative">
        
        {/* Notch overlay */}
        <div className="w-full bg-zinc-950 h-7 flex justify-center items-center relative">
          <div className="w-32 h-4 bg-zinc-900 rounded-b-xl absolute top-0"></div>
        </div>

        {/* Top Header */}
        <div className="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/40 flex justify-between items-center">
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
                <span className="text-[10px] text-zinc-100 font-black tracking-[0.15em] select-none">LEADFLOW</span>
                <span className="w-1 h-1 rounded-full bg-indigo-500"></span>
                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider ml-1">Console</span>
              </div>
              <h2 className="text-xs font-bold text-zinc-300 mt-0.5 truncate max-w-[150px]">{callerUser.name}</h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-1.5 bg-zinc-800 border border-zinc-700 hover:border-zinc-650 rounded-lg text-zinc-400 hover:text-white transition flex items-center justify-center"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={12} className="animate-spin-slow" /> : <Moon size={12} />}
            </button>

            <button
              onClick={onLogout}
              className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 rounded-lg px-2.5 py-1.5 transition"
            >
              <LogOut size={12} />
              <span>Exit</span>
            </button>
          </div>
        </div>

        {/* Grid filter buttons */}
        <div className="grid grid-cols-3 gap-1 px-4 py-3 bg-slate-950/40 border-b border-slate-800">
          {[
            { id: 'pending', label: 'Pending', count: leads.filter(l => l.status !== 'Converted' && l.status !== 'Not Interested' && l.status !== 'Warm').length },
            { id: 'followup', label: 'Follow-ups', count: leads.filter(l => l.status === 'Warm').length },
            { id: 'converted', label: 'Deals Done', count: leads.filter(l => l.status === 'Converted').length }
          ].map(btn => (
            <button
              key={btn.id}
              onClick={() => setFilterType(btn.id as any)}
              className={`py-2 px-1 text-[11px] font-bold rounded-lg transition relative ${
                filterType === btn.id 
                  ? 'bg-slate-800 text-white border border-slate-700' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <div>{btn.label}</div>
              <div className="text-[9px] opacity-60 font-mono mt-0.5">{btn.count} records</div>
            </button>
          ))}
        </div>

        {/* Dynamic list Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/20">
          {filterType === 'followup' && (
            <div className="flex gap-1.5 mb-2 bg-zinc-950/40 p-1 border border-zinc-800/80 rounded-xl">
              <button
                onClick={() => setFollowupSubFilter('due')}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition ${
                  followupSubFilter === 'due'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Due Today ({leads.filter(l => l.status === 'Warm' && (!l.followUpDate || l.followUpDate <= todayStr)).length})
              </button>
              <button
                onClick={() => setFollowupSubFilter('future')}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition ${
                  followupSubFilter === 'future'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Upcoming ({leads.filter(l => l.status === 'Warm' && !!l.followUpDate && l.followUpDate > todayStr).length})
              </button>
            </div>
          )}

          {filteredLeads.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-3xl">☕</span>
              <p className="text-xs text-slate-500 font-medium mt-3">Calling list is empty here. Great job!</p>
            </div>
          ) : (
            filteredLeads.map((lead) => {
              // Masking logic
              const maskedPhone = lead.phone.length >= 10 
                ? lead.phone.substring(0, 5) + '****' + lead.phone.slice(-2)
                : lead.phone;
              return (
                <div 
                  key={lead.id} 
                  className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="text-sm font-black text-slate-200">{lead.name}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Source: {lead.source}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-slate-800 border border-slate-700/80 text-slate-400">
                      {lead.status}
                    </span>
                  </div>
                  
                  {lead.notes && (
                    <p className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-850 text-ellipsis line-clamp-2 mb-3">
                      Note: {lead.notes}
                    </p>
                  )}

                  {lead.followUpDate && (
                    <div className="flex items-center gap-1 mb-3 select-none">
                      <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: lead.followUpDate <= todayStr ? '#FF9500' : '#6366F1' }}>
                        📅 Callback: {lead.followUpDate}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopyAndCall(lead)}
                      className="flex-1 py-2 px-3 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-violet-900/10"
                    >
                      <Phone size={12} />
                      <span>Copy & Call {maskedPhone}</span>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedLead(lead);
                        setSelectedStatus(lead.status === 'New' ? 'Warm' : lead.status as any);
                        setRemarkNotes('');
                        setShowPopup(true);
                      }}
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition"
                    >
                      Disposition
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal save outcome dialog */}
        {showPopup && selectedLead && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-end justify-center p-4">
            <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-200">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-200">Call Disposition (Update Status)</h3>
                <span className="text-[10px] text-slate-500">{selectedLead.name}</span>
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  1. Call status:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['Converted', 'Warm', 'Busy', 'Ringing', 'Cold', 'Not Interested'].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setSelectedStatus(opt as any)}
                      className={`py-2 text-[10px] font-bold rounded-lg border transition ${
                        selectedStatus === opt 
                          ? 'bg-violet-600 text-white border-violet-500' 
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  2. Quick Note tags:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {['Customer busy', 'Price issue', 'Call after salary', 'WhatsApp sent'].map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setRemarkNotes(tag)}
                      className="py-1 px-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded-md text-[10px] transition"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {selectedStatus === 'Warm' && (
                <div className="space-y-2">
                  <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    📅 Follow-up Date (रिमाइंडर तारीख):
                  </label>
                  <input
                    type="date"
                    min={new Date().toLocaleDateString('en-CA')}
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className="w-full p-3 bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-xl outline-none text-xs text-slate-300 transition"
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  3. Conversation Notes:
                </label>
                <textarea
                  rows={2}
                  placeholder="Provide extra details of call response..."
                  value={remarkNotes}
                  onChange={(e) => setRemarkNotes(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-xl outline-none text-xs text-slate-300 resize-none transition"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowPopup(false);
                    setSelectedLead(null);
                    setFollowUpDate('');
                  }}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-400 font-bold text-xs rounded-xl border border-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveResult}
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-violet-900/10 flex justify-center items-center"
                >
                  {isSaving ? 'Saving...' : 'Save & Sync Status'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
