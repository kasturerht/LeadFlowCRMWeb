import { useState, useEffect, useMemo } from 'react';
import { Lead, UserProfile, Interaction } from '../types';
import { fetchInteractionsByDateRange, getPrimaryCategory } from '../lib/firebaseService';
import { 
  Calendar, Clock, PhoneCall, Award, Download, Filter, Activity, 
  ChevronLeft, ChevronRight, MessageSquare, Search, Trophy, TrendingUp, 
  Users, ShieldAlert, CheckCircle2, ArrowUpDown, FileText,
  AlertTriangle, Layers
} from 'lucide-react';

interface ReportsTabProps {
  leads: Lead[];
  telecallers: UserProfile[];
}

type SubTabType = 'overview' | 'leaderboard' | 'audittrail';

export default function ReportsTab({ leads, telecallers }: ReportsTabProps) {
  // Navigation & Filtering States
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>('overview');
  const [reportDateRange, setReportDateRange] = useState<'today' | 'yesterday' | '7days' | '30days' | 'thismonth' | 'custom'>('today');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedTelecaller, setSelectedTelecaller] = useState<string>('ALL');
  
  // Data States
  const [rawInteractions, setRawInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(false);

  // Audit Trail Search & Pagination States
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(25);

  // Leaderboard Sorting States
  const [sortField, setSortField] = useState<'conversions' | 'calls' | 'talkTime' | 'connectionRate' | 'shortCallRatio'>('conversions');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 1. Fetch Interactions from Firestore based on Date Range
  useEffect(() => {
    let startDate = new Date();
    let endDate = new Date();
    
    if (reportDateRange === 'today') {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (reportDateRange === 'yesterday') {
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
    } else if (reportDateRange === '7days') {
      startDate.setDate(startDate.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (reportDateRange === '30days') {
      startDate.setDate(startDate.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (reportDateRange === 'thismonth') {
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (reportDateRange === 'custom') {
      if (!customStartDate || !customEndDate) return;
      const [sYear, sMonth, sDay] = customStartDate.split('-').map(Number);
      const [eYear, eMonth, eDay] = customEndDate.split('-').map(Number);
      startDate = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0);
      endDate = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999);
    }

    const startStr = startDate.toISOString();
    const endStr = endDate.toISOString();

    setLoading(true);
    fetchInteractionsByDateRange(startStr, endStr)
      .then(res => setRawInteractions(res))
      .catch(err => console.error("Error fetching analytics interactions:", err))
      .finally(() => setLoading(false));
      
  }, [reportDateRange, customStartDate, customEndDate]);

  // Reset pagination on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [reportDateRange, selectedTelecaller, searchTerm, rowsPerPage, activeSubTab]);

  // 2. Core Zero-Latency Memoized Metrics Engine
  const metrics = useMemo(() => {
    // --- SECTION A: OVERALL DATABASE HEALTH (All Active Leads or Filtered by Caller) ---
    const activeLeads = leads.filter(l => !l.archived && (selectedTelecaller === 'ALL' || l.assignedTo === selectedTelecaller));
    const totalActiveLeadsCount = activeLeads.length;

    const overallPipelineCounts: Record<string, number> = {
      PENDING: 0,
      ATTEMPTED: 0,
      FOLLOWUP: 0,
      VISIT_SCHEDULED: 0,
      VISITED: 0,
      CONVERTED: 0,
      REJECTED: 0
    };

    activeLeads.forEach(l => {
      const cat = getPrimaryCategory(l);
      if (overallPipelineCounts[cat] !== undefined) {
        overallPipelineCounts[cat]++;
      }
    });

    // --- SECTION B: PERIOD ENGAGEMENT METRICS (Filtered by Date Range & Caller) ---
    const periodInteractions = rawInteractions.filter(i => 
      selectedTelecaller === 'ALL' || i.callerId === selectedTelecaller
    );

    const totalCalls = periodInteractions.length;
    const totalDuration = periodInteractions.reduce((acc, curr) => acc + (Number(curr.duration) || 0), 0);
    const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
    
    // Effective Contact: Duration > 0s
    const connectedCalls = periodInteractions.filter(i => (Number(i.duration) || 0) > 0).length;
    const connectionRate = totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100) : 0;

    // Quality Assurance: Short calls (< 10s) that might indicate hasty dialing / instant hang-up
    const shortCallsCount = periodInteractions.filter(i => !i.isManualDuration && (Number(i.duration) || 0) > 0 && (Number(i.duration) || 0) < 10).length;
    const shortCallRatio = totalCalls > 0 ? Math.round((shortCallsCount / totalCalls) * 100) : 0;

    // Unique Leads Touched in this period
    const uniqueLeadsTouchedSet = new Set(periodInteractions.map(i => i.leadId));
    const uniqueLeadsTouched = uniqueLeadsTouchedSet.size;

    // Deduplicated Event Tracking across Android App Parity Stages
    const convertedSet = new Set<string>();
    const visitedSet = new Set<string>();
    const visitsScheduledSet = new Set<string>();
    const followupSet = new Set<string>();
    const attemptedSet = new Set<string>();
    const rejectedSet = new Set<string>();
    
    periodInteractions.forEach(i => {
      const status = (i.statusAfter || '').trim();
      if (status === 'Converted') {
        convertedSet.add(i.leadId);
      } else if (status === 'Visited' || i.isVisitLog) {
        visitedSet.add(i.leadId);
      } else if (status === 'Visit Scheduled') {
        visitsScheduledSet.add(i.leadId);
      } else if (status === 'Follow-up' || status.toLowerCase().includes('follow')) {
        followupSet.add(i.leadId);
      } else if (status === 'Not Interested' || status === 'Invalid' || status === 'Rejected' || status === 'Cold' || status.includes('(3+ Attempts)')) {
        rejectedSet.add(i.leadId);
      } else {
        // Busy / Ringing / No Answer / Callback / Warm Lead / Attempted
        attemptedSet.add(i.leadId);
      }
    });

    const now = new Date();
    let periodStart = new Date(0);
    if (reportDateRange === 'today') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (reportDateRange === 'yesterday') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
    } else if (reportDateRange === '7days') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
    } else if (reportDateRange === '30days') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
    } else if (reportDateRange === 'thismonth') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    } else if (reportDateRange === 'custom' && customStartDate) {
      const [sYear, sMonth, sDay] = customStartDate.split('-').map(Number);
      periodStart = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0);
    }

    const periodNewLeadIdsSet = new Set(
      activeLeads.filter(l => {
        const dateStr = l.uploadedAt || l.updatedAt;
        if (!dateStr) return false;
        const time = new Date(dateStr).getTime();
        return time >= periodStart.getTime();
      }).map(l => l.id)
    );

    const periodNewLeadsCount = periodNewLeadIdsSet.size;

    const newLeadsTouchedCount = activeLeads.filter(l => {
      return periodNewLeadIdsSet.has(l.id) && uniqueLeadsTouchedSet.has(l.id);
    }).length;

    const backlogLeadsTouchedCount = Math.max(0, uniqueLeadsTouched - newLeadsTouchedCount);

    const freshLeadsDialsCount = periodInteractions.filter(i => periodNewLeadIdsSet.has(i.leadId)).length;
    const backlogLeadsDialsCount = Math.max(0, totalCalls - freshLeadsDialsCount);
    const repeatDialsCount = Math.max(0, totalCalls - uniqueLeadsTouched);

    const periodConversionRate = uniqueLeadsTouched > 0 
      ? Math.round((convertedSet.size / uniqueLeadsTouched) * 100) 
      : 0;

    // --- SECTION C: TELECALLER LEADERBOARD & PRODUCTIVITY MATRIX ---
    const activeStaff = telecallers.filter(t => t.role === 'telecaller');
    const leaderboard = activeStaff.map(caller => {
      const callerLogs = rawInteractions.filter(i => i.callerId === caller.uid);
      const calls = callerLogs.length;
      const connected = callerLogs.filter(i => (Number(i.duration) || 0) > 0).length;
      const connRate = calls > 0 ? Math.round((connected / calls) * 100) : 0;
      const talk = callerLogs.reduce((acc, curr) => acc + (Number(curr.duration) || 0), 0);
      const avgTalk = calls > 0 ? Math.round(talk / calls) : 0;
      
      const short = callerLogs.filter(i => !i.isManualDuration && (Number(i.duration) || 0) > 0 && (Number(i.duration) || 0) < 10).length;
      const shortRatio = calls > 0 ? Math.round((short / calls) * 100) : 0;

      const callerConvertedSet = new Set<string>();
      const callerVisitsSet = new Set<string>();
      callerLogs.forEach(i => {
        if (i.statusAfter === 'Converted') callerConvertedSet.add(i.leadId);
        if (i.statusAfter === 'Visit Scheduled' || i.statusAfter === 'Visited' || i.isVisitLog) {
          callerVisitsSet.add(i.leadId);
        }
      });

      const conversions = callerConvertedSet.size;
      const visits = callerVisitsSet.size;
      const winRate = connected > 0 ? Math.round((conversions / connected) * 100) : 0;

      return {
        uid: caller.uid,
        name: caller.name,
        email: caller.email,
        active: caller.active,
        calls,
        connected,
        connectionRate: connRate,
        talkTime: talk,
        avgTalkTime: avgTalk,
        shortCalls: short,
        shortCallRatio: shortRatio,
        conversions,
        visits,
        winRate
      };
    }).sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });

    // --- SECTION D: FILTERED & SEARCHABLE AUDIT TRAIL ---
    let auditLogs = [...periodInteractions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase().trim();
      auditLogs = auditLogs.filter(i => {
        const lead = leads.find(l => l.id === i.leadId);
        const leadName = (lead?.name || '').toLowerCase();
        const leadPhone = (lead?.phone || '').toLowerCase();
        const callerName = (i.callerName || '').toLowerCase();
        const notes = (i.notes || '').toLowerCase();
        const statusBefore = (i.statusBefore || '').toLowerCase();
        const statusAfter = (i.statusAfter || '').toLowerCase();
        
        return leadName.includes(query) || 
               leadPhone.includes(query) || 
               callerName.includes(query) || 
               notes.includes(query) ||
               statusBefore.includes(query) ||
               statusAfter.includes(query);
      });
    }

    return {
      overallPipelineCounts,
      totalActiveLeadsCount,
      totalCalls,
      totalDuration,
      avgDuration,
      connectedCalls,
      connectionRate,
      shortCallsCount,
      shortCallRatio,
      uniqueLeadsTouched,
      dedupedConverted: convertedSet.size,
      dedupedVisited: visitedSet.size,
      dedupedVisits: visitsScheduledSet.size,
      dedupedFollowups: followupSet.size,
      dedupedAttempted: attemptedSet.size,
      dedupedRejected: rejectedSet.size,
      periodNewLeadsCount,
      newLeadsTouchedCount,
      backlogLeadsTouchedCount,
      freshLeadsDialsCount,
      backlogLeadsDialsCount,
      repeatDialsCount,
      periodConversionRate,
      leaderboard,
      auditLogs
    };
  }, [rawInteractions, leads, telecallers, selectedTelecaller, sortField, sortOrder, searchTerm, reportDateRange, customStartDate]);

  // 3. Pagination Engine for Audit Trail
  const totalPages = Math.max(1, Math.ceil(metrics.auditLogs.length / rowsPerPage));
  const paginatedAuditLogs = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return metrics.auditLogs.slice(start, start + rowsPerPage);
  }, [metrics.auditLogs, currentPage, rowsPerPage]);

  // 4. Export Functions (UTF-8 BOM compatible for Excel)
  const handleExportAuditTrailCSV = () => {
    const headers = ['Date & Time', 'Telecaller Name', 'Lead Name', 'Lead Phone', 'Lead ID', 'Status Before', 'Status After', 'Duration (Seconds)', 'Tracking Mode', 'Quality Flag', 'Notes / Remarks'];
    
    const rows = metrics.auditLogs.map(i => {
      const lead = leads.find(l => l.id === i.leadId);
      const escapeCSV = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;
      const isShort = !i.isManualDuration && (Number(i.duration) || 0) > 0 && (Number(i.duration) || 0) < 10;
      
      return [
        escapeCSV(new Date(i.timestamp).toLocaleString()),
        escapeCSV(i.callerName),
        escapeCSV(lead?.name || 'Unknown Lead'),
        escapeCSV(lead?.phone || 'Unknown Phone'),
        escapeCSV(i.leadId),
        escapeCSV(i.statusBefore),
        escapeCSV(i.statusAfter),
        i.duration.toString(),
        i.isManualDuration ? 'Manual Entry' : 'Auto-Tracked',
        isShort ? 'Short Call Flag (<10s)' : 'Normal Call',
        escapeCSV(i.notes)
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSVFile(csvContent, `AuditTrail_${reportDateRange}_${selectedTelecaller}.csv`);
  };

  const handleExportLeaderboardCSV = () => {
    const headers = ['Staff Name', 'Email', 'Account Status', 'Total Calls Made', 'Connected Calls', 'Connection Rate (%)', 'Total Talk Time (Seconds)', 'Avg Talk Time (Seconds)', 'Short Calls (<10s)', 'Short Call Ratio (%)', 'Deals Converted', 'Visits Scheduled', 'Win Rate (%)'];
    
    const rows = metrics.leaderboard.map(c => {
      const escapeCSV = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;
      return [
        escapeCSV(c.name),
        escapeCSV(c.email),
        c.active ? 'Active' : 'Inactive',
        c.calls.toString(),
        c.connected.toString(),
        c.connectionRate.toString(),
        c.talkTime.toString(),
        c.avgTalkTime.toString(),
        c.shortCalls.toString(),
        c.shortCallRatio.toString(),
        c.conversions.toString(),
        c.visits.toString(),
        c.winRate.toString()
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSVFile(csvContent, `StaffProductivity_Leaderboard_${reportDateRange}.csv`);
  };

  const downloadCSVFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Utility Formatting Helpers
  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  };

  const formatSmartTimestamp = (timestampStr: string) => {
    if (!timestampStr) return { time: 'N/A', date: '' };
    const dateObj = new Date(timestampStr);
    if (isNaN(dateObj.getTime())) return { time: timestampStr, date: '' };
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const targetDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    
    if (targetDate.getTime() === today.getTime()) {
      return { time: timeStr, date: 'Today' };
    } else if (targetDate.getTime() === yesterday.getTime()) {
      return { time: timeStr, date: 'Yesterday' };
    } else {
      return { time: timeStr, date: dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) };
    }
  };

  const toggleSort = (field: 'conversions' | 'calls' | 'talkTime' | 'connectionRate' | 'shortCallRatio') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-sans">
      {/* 1. Silicon Valley Executive Filter & Command Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-900 p-5 rounded-3xl border border-slate-800 shadow-xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Left: Sub-Navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-2xl border border-slate-800/80 self-start lg:self-auto overflow-x-auto max-w-full">
          {[
            { id: 'overview', label: 'Executive Funnel', icon: Activity },
            { id: 'leaderboard', label: 'Staff Leaderboard', icon: Trophy },
            { id: 'audittrail', label: 'Interaction Logs', icon: FileText }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as SubTabType)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  isActive 
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/30' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Icon size={15} className={isActive ? 'text-white' : 'text-violet-400'} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Global Period & Caller Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Range Selector */}
          <div className="flex items-center gap-2 bg-slate-950/90 px-3.5 py-2 rounded-xl border border-slate-800 text-xs font-semibold text-slate-300 shadow-inner">
            <Calendar size={15} className="text-violet-400 shrink-0" />
            <select 
              className="bg-transparent text-slate-100 outline-none cursor-pointer font-bold pr-1"
              value={reportDateRange}
              onChange={(e) => setReportDateRange(e.target.value as any)}
            >
              <option value="today" className="bg-slate-900 text-slate-200">Today's Performance</option>
              <option value="yesterday" className="bg-slate-900 text-slate-200">Yesterday's Summary</option>
              <option value="7days" className="bg-slate-900 text-slate-200">Last 7 Days (Week)</option>
              <option value="30days" className="bg-slate-900 text-slate-200">Last 30 Days (Month)</option>
              <option value="thismonth" className="bg-slate-900 text-slate-200">Current Calendar Month</option>
              <option value="custom" className="bg-slate-900 text-slate-200">Custom Date Range...</option>
            </select>
          </div>

          {/* Custom Date Inputs */}
          {reportDateRange === 'custom' && (
            <div className="flex items-center gap-2 bg-slate-950/90 p-1 rounded-xl border border-slate-800 animate-in fade-in zoom-in-95 duration-200">
              <input 
                type="date"
                className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-violet-500 font-mono"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
              />
              <span className="text-slate-500 text-xs font-bold">→</span>
              <input 
                type="date"
                className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-violet-500 font-mono"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
              />
            </div>
          )}

          {/* Telecaller Filter Dropdown */}
          <div className="flex items-center gap-2 bg-slate-950/90 px-3.5 py-2 rounded-xl border border-slate-800 text-xs font-semibold text-slate-300 shadow-inner">
            <Filter size={15} className="text-violet-400 shrink-0" />
            <select 
              className="bg-transparent text-slate-100 outline-none cursor-pointer font-bold max-w-[160px] truncate"
              value={selectedTelecaller}
              onChange={(e) => setSelectedTelecaller(e.target.value)}
            >
              <option value="ALL" className="bg-slate-900 text-slate-200">All Telecaller Staff</option>
              {telecallers.filter(t => t.role === 'telecaller').map(t => (
                <option key={t.uid} value={t.uid} className="bg-slate-900 text-slate-200">
                  {t.name} {t.active ? '' : '(Inactive)'}
                </option>
              ))}
            </select>
          </div>

          {/* Export Action Button */}
          {activeSubTab === 'leaderboard' ? (
            <button 
              onClick={handleExportLeaderboardCSV}
              disabled={metrics.leaderboard.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-emerald-900/20 active:scale-95 whitespace-nowrap"
              title="Export complete staff productivity rankings to CSV"
            >
              <Download size={15} />
              <span>Export Staff CSV</span>
            </button>
          ) : (
            <button 
              onClick={handleExportAuditTrailCSV}
              disabled={metrics.auditLogs.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-emerald-900/20 active:scale-95 whitespace-nowrap"
              title="Export filtered call audit logs to Excel/CSV"
            >
              <Download size={15} />
              <span>Export Logs CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Loading Overlay */}
      {loading ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-16 flex flex-col items-center justify-center text-slate-400 space-y-4">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin shadow-lg"></div>
          <p className="text-xs font-bold tracking-widest uppercase text-slate-500">Aggregating Real-Time Telemetry & Funnel Metrics...</p>
        </div>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* SUB-TAB 1: EXECUTIVE FUNNEL & OVERALL DATABASE HEALTH                     */}
          {/* ========================================================================= */}
          {activeSubTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Top KPI Cards Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard 
                  title="Effective Connection Rate" 
                  value={`${metrics.connectionRate}%`} 
                  subtitle={`${metrics.connectedCalls} connected of ${metrics.totalCalls} calls`}
                  icon={<PhoneCall className="text-sky-400" size={20} />}
                  color="border-sky-500/20 bg-sky-950/10 hover:border-sky-500/40"
                  accent="text-sky-400"
                  badge={metrics.shortCallRatio > 15 ? `⚠️ ${metrics.shortCallRatio}% Short Calls` : '⚡ Optimal Quality'}
                  badgeColor={metrics.shortCallRatio > 15 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}
                />
                <MetricCard 
                  title="Total Staff Talk Time" 
                  value={formatDuration(metrics.totalDuration)} 
                  subtitle={`Avg ${formatDuration(metrics.avgDuration)} per engagement`}
                  icon={<Clock className="text-amber-400" size={20} />}
                  color="border-amber-500/20 bg-amber-950/10 hover:border-amber-500/40"
                  accent="text-amber-400"
                  badge={`${metrics.uniqueLeadsTouched} Unique Leads`}
                  badgeColor="bg-slate-800 text-slate-300 border-slate-700"
                />
                <MetricCard 
                  title="Site Visits & Meetings" 
                  value={metrics.dedupedVisits} 
                  subtitle="Unique prospects visited/scheduled"
                  icon={<Calendar className="text-pink-400" size={20} />}
                  color="border-pink-500/20 bg-pink-950/10 hover:border-pink-500/40"
                  accent="text-pink-400"
                  badge="High-Value Funnel Step"
                  badgeColor="bg-pink-500/10 text-pink-300 border-pink-500/20"
                />
                <MetricCard 
                  title="Deals Closed (Period Win)" 
                  value={metrics.dedupedConverted} 
                  subtitle={`${metrics.periodConversionRate}% Conversion of touched leads`}
                  icon={<Award className="text-emerald-400" size={20} />}
                  color="border-emerald-500/20 bg-emerald-950/10 hover:border-emerald-500/40"
                  accent="text-emerald-400"
                  badge="🎉 Revenue Achieved"
                  badgeColor="bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                />
              </div>

              {/* SECTION 1: REAL-TIME OVERALL DATABASE HEALTH (All Active Leads) */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800/80 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-md font-extrabold text-slate-100 flex items-center gap-2">
                        <Layers className="text-violet-400" size={18} />
                        <span>{selectedTelecaller === 'ALL' ? 'Live Pipeline Inventory (Current Snapshot)' : `Live Pipeline Inventory — ${telecallers.find(c => c.uid === selectedTelecaller)?.name || 'Selected Caller'}`}</span>
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-[10px] font-bold uppercase tracking-wider">
                        Live Current Snapshot
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Exact real-time status distribution across all <span className="text-slate-200 font-bold">{metrics.totalActiveLeadsCount}</span> active leads {selectedTelecaller === 'ALL' ? 'in the entire database.' : `assigned to ${telecallers.find(c => c.uid === selectedTelecaller)?.name || 'this telecaller'}.`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">{selectedTelecaller === 'ALL' ? 'Total Active Inventory' : 'Staff Assigned Leads'}</span>
                    <p className="text-2xl font-black text-slate-200">{metrics.totalActiveLeadsCount}</p>
                  </div>
                </div>

                {/* Grid of 7 Universal Pipeline Categories */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                  {[
                    { key: 'PENDING', label: 'Pending Queue', color: 'bg-violet-500', border: 'border-violet-500/30', text: 'text-violet-400', bgCard: 'bg-violet-950/10' },
                    { key: 'ATTEMPTED', label: 'Attempted (Busy/Ring)', color: 'bg-sky-500', border: 'border-sky-500/30', text: 'text-sky-400', bgCard: 'bg-sky-950/10' },
                    { key: 'FOLLOWUP', label: 'Follow-ups Due', color: 'bg-amber-500', border: 'border-amber-500/30', text: 'text-amber-400', bgCard: 'bg-amber-950/10' },
                    { key: 'VISIT_SCHEDULED', label: 'Visit Scheduled', color: 'bg-pink-500', border: 'border-pink-500/30', text: 'text-pink-400', bgCard: 'bg-pink-950/10' },
                    { key: 'VISITED', label: 'Site Visited', color: 'bg-purple-500', border: 'border-purple-500/30', text: 'text-purple-400', bgCard: 'bg-purple-950/10' },
                    { key: 'CONVERTED', label: 'Deals Closed', color: 'bg-emerald-500', border: 'border-emerald-500/30', text: 'text-emerald-400', bgCard: 'bg-emerald-950/10' },
                    { key: 'REJECTED', label: 'Rejected / 3+ Try', color: 'bg-rose-500', border: 'border-rose-500/30', text: 'text-rose-400', bgCard: 'bg-rose-950/10' }
                  ].map(({ key, label, color, border, text, bgCard }) => {
                    const count = metrics.overallPipelineCounts[key] || 0;
                    const pct = metrics.totalActiveLeadsCount > 0 ? Math.round((count / metrics.totalActiveLeadsCount) * 100) : 0;
                    return (
                      <div key={key} className={`p-4 rounded-2xl border ${border} ${bgCard} flex flex-col justify-between transition hover:scale-[1.02]`}>
                        <div>
                          <div className={`w-2.5 h-2.5 rounded-full ${color} mb-2 shadow-sm`} />
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-snug">{label}</p>
                        </div>
                        <div className="mt-4 flex items-baseline justify-between">
                          <span className={`text-2xl font-black ${text}`}>{count}</span>
                          <span className="text-[11px] font-mono font-bold text-slate-500">({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Progress Bar Gauge */}
                <div className="pt-2">
                  <div className="flex justify-between items-center text-[11px] text-slate-400 font-bold mb-1.5 uppercase tracking-wider">
                    <span>Visual Roster Breakdown</span>
                    <span>100% Active Roster</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-950 border border-slate-800 flex overflow-hidden p-0.5 gap-0.5">
                    {[
                      { key: 'CONVERTED', color: 'bg-emerald-500' },
                      { key: 'VISITED', color: 'bg-purple-500' },
                      { key: 'VISIT_SCHEDULED', color: 'bg-pink-500' },
                      { key: 'FOLLOWUP', color: 'bg-amber-500' },
                      { key: 'ATTEMPTED', color: 'bg-sky-500' },
                      { key: 'PENDING', color: 'bg-violet-500' },
                      { key: 'REJECTED', color: 'bg-rose-500' }
                    ].map(({ key, color }) => {
                      const count = metrics.overallPipelineCounts[key] || 0;
                      const pct = metrics.totalActiveLeadsCount > 0 ? (count / metrics.totalActiveLeadsCount) * 100 : 0;
                      if (pct <= 0) return null;
                      return (
                        <div 
                          key={key} 
                          className={`h-full rounded-sm ${color} transition-all duration-500`} 
                          style={{ width: `${pct}%` }}
                          title={`${key}: ${count} leads (${Math.round(pct)}%)`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* SECTION 1.5: PERIOD ACTIVITY & STAGE TRANSITIONS FUNNEL (Date-Filtered Engine) */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800/80 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-md font-extrabold text-slate-100 flex items-center gap-2">
                        <TrendingUp className="text-sky-400" size={18} />
                        <span>{selectedTelecaller === 'ALL' ? 'Company Activity & Stage Transitions Funnel' : `Staff Period Funnel — ${telecallers.find(c => c.uid === selectedTelecaller)?.name || 'Selected Caller'}`}</span>
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300 text-[10px] font-bold uppercase tracking-wider">
                        Date-Filtered ({reportDateRange === '7days' ? 'Last 7 Days' : reportDateRange === 'today' ? 'Today' : reportDateRange === 'yesterday' ? 'Yesterday' : reportDateRange === '30days' ? 'Last 30 Days' : reportDateRange === 'thismonth' ? 'This Month' : 'Custom Period'})
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Complete input workload and output stage transitions recorded during the selected date range across <span className="text-slate-200 font-bold">{metrics.uniqueLeadsTouched}</span> touched prospects.
                    </p>
                  </div>
                </div>

                {/* Tier 1: Period Workload & Dialing Input Effort */}
                <div>
                  <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                    Tier 1: Input Workload & Dialing Effort (Whom Did We Dial?)
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'New Leads Assigned', count: metrics.periodNewLeadsCount, color: 'text-violet-400', border: 'border-violet-500/30', bg: 'bg-violet-950/20', sub: 'Fresh prospects received in period' },
                      { label: 'Fresh Prospects Called', count: metrics.newLeadsTouchedCount, color: 'text-sky-400', border: 'border-sky-500/30', bg: 'bg-sky-950/20', sub: `${metrics.freshLeadsDialsCount} Dials placed • ${metrics.periodNewLeadsCount > 0 ? Math.round((metrics.newLeadsTouchedCount / metrics.periodNewLeadsCount) * 100) : 0}% called` },
                      { label: 'Backlog Prospects Called', count: metrics.backlogLeadsTouchedCount, color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-950/20', sub: `${metrics.backlogLeadsDialsCount} Dials placed • Due & busy` },
                      { label: 'Total Call Dials Placed', count: metrics.totalCalls, color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-950/20', sub: `${metrics.uniqueLeadsTouched} Unique Prospects • ${metrics.repeatDialsCount} Repeat Dial${metrics.repeatDialsCount !== 1 ? 's' : ''}` }
                    ].map(({ label, count, color, border, bg, sub }) => (
                      <div key={label} className={`p-4 rounded-2xl border ${border} ${bg} flex flex-col justify-between`}>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                        <div className="mt-2">
                          <p className={`text-2xl font-black ${color}`}>{count}</p>
                          <p className="text-[10px] font-mono text-slate-500 mt-0.5">{sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tier 2: Period Stage Outcomes & Funnel Transitions (6 Active Stages) */}
                <div>
                  <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Tier 2: Output Stage Outcomes (Where Did Those Dials Land?)
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    {[
                      { label: 'Attempted (Busy/Ring)', count: metrics.dedupedAttempted, color: 'bg-sky-500', border: 'border-sky-500/30', text: 'text-sky-400', bgCard: 'bg-sky-950/10', sub: 'No answer / Cut / Ringing' },
                      { label: 'Added to Follow-ups', count: metrics.dedupedFollowups, color: 'bg-amber-500', border: 'border-amber-500/30', text: 'text-amber-400', bgCard: 'bg-amber-950/10', sub: 'Scheduled in period' },
                      { label: 'Visits Scheduled', count: metrics.dedupedVisits, color: 'bg-pink-500', border: 'border-pink-500/30', text: 'text-pink-400', bgCard: 'bg-pink-950/10', sub: 'Site visits planned' },
                      { label: 'Site Visited', count: metrics.dedupedVisited, color: 'bg-purple-500', border: 'border-purple-500/30', text: 'text-purple-400', bgCard: 'bg-purple-950/10', sub: 'Completed site visit' },
                      { label: 'Deals Converted', count: metrics.dedupedConverted, color: 'bg-emerald-500', border: 'border-emerald-500/30', text: 'text-emerald-400', bgCard: 'bg-emerald-950/10', sub: `${metrics.periodConversionRate}% win rate` },
                      { label: 'Rejected / Dropped', count: metrics.dedupedRejected, color: 'bg-rose-500', border: 'border-rose-500/30', text: 'text-rose-400', bgCard: 'bg-rose-950/10', sub: 'Closed / Not interested' }
                    ].map(({ label, count, color, border, text, bgCard, sub }) => (
                      <div key={label} className={`p-4 rounded-2xl border ${border} ${bgCard} flex flex-col justify-between transition hover:scale-[1.02]`}>
                        <div>
                          <div className={`w-2.5 h-2.5 rounded-full ${color} mb-2 shadow-sm`} />
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-snug">{label}</p>
                        </div>
                        <div className="mt-4">
                          <p className={`text-2xl font-black ${text}`}>{count}</p>
                          <p className="text-[10px] font-mono text-slate-500 mt-0.5">{sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION 2: QUALITY ASSURANCE & ENGAGEMENT INSIGHTS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Calling Quality Assurance */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                        <ShieldAlert className="text-amber-400" size={18} />
                        <span>Telecalling Quality & Short Call Alert Engine</span>
                      </h3>
                      <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                        10-Year QA Standard
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Monitors calls under <span className="text-amber-400 font-bold">10 seconds</span>. In high-volume environments (10,000+ leads), excessive short calls indicate premature disconnects or wrong numbers that require roster hygiene.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Short Call Warnings</span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-2xl font-black text-amber-400">{metrics.shortCallsCount}</span>
                        <span className="text-xs text-slate-500 font-medium">({metrics.shortCallRatio}% of calls)</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">Calls &lt; 10s without manual override</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Genuine Conversation</span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-2xl font-black text-emerald-400">{metrics.totalCalls - metrics.shortCallsCount}</span>
                        <span className="text-xs text-slate-500 font-medium">({100 - metrics.shortCallRatio}%)</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">Engaged talk time &gt; 10 seconds</p>
                    </div>
                  </div>

                  {metrics.shortCallRatio > 25 ? (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2.5">
                      <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                      <span><strong>Attention Required:</strong> Short call ratio exceeds 25%. We recommend checking telecaller dial logs or filtering out invalid numbers.</span>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2.5">
                      <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                      <span><strong>Optimal Calling Discipline:</strong> Short call ratio is within healthy Silicon Valley industry benchmarks (&lt;20%).</span>
                    </div>
                  )}
                </div>

                {/* Period Summary Highlights */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-2">
                      <TrendingUp className="text-indigo-400" size={18} />
                      <span>Period Engagement Efficiency</span>
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Summary of telecaller interactions recorded from Android mobile devices during the selected timeframe.
                    </p>
                  </div>

                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400"><Users size={16} /></div>
                        <div>
                          <p className="text-xs font-bold text-slate-200">Unique Leads Interacted With</p>
                          <p className="text-[10px] text-slate-500">Distinct prospects dialed in this period</p>
                        </div>
                      </div>
                      <span className="text-lg font-black text-indigo-400 font-mono">{metrics.uniqueLeadsTouched}</span>
                    </div>

                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400"><Calendar size={16} /></div>
                        <div>
                          <p className="text-xs font-bold text-slate-200">Meetings & Visits Scheduled</p>
                          <p className="text-[10px] text-slate-500">Mid-funnel positive transition rate</p>
                        </div>
                      </div>
                      <span className="text-lg font-black text-pink-400 font-mono">{metrics.dedupedVisits}</span>
                    </div>

                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400"><Award size={16} /></div>
                        <div>
                          <p className="text-xs font-bold text-slate-200">Final Deal Conversions</p>
                          <p className="text-[10px] text-slate-500">Net closed deals during selected period</p>
                        </div>
                      </div>
                      <span className="text-lg font-black text-emerald-400 font-mono">{metrics.dedupedConverted}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUB-TAB 2: STAFF LEADERBOARD & PRODUCTIVITY MATRIX                        */}
          {/* ========================================================================= */}
          {activeSubTab === 'leaderboard' && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden shadow-xl animate-in fade-in duration-300">
              <div className="px-6 py-5 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-extrabold text-md text-slate-100 flex items-center gap-2">
                    <Trophy className="text-amber-400" size={18} />
                    <span>Telecaller Staff Productivity Matrix & Leaderboard</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Side-by-side comparative ranking of all human agents. Click any column header to sort in real-time.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-bold bg-slate-800 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-700">
                    👥 {metrics.leaderboard.length} Active Staff Members
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase bg-slate-950/60 select-none">
                      <th className="p-4 w-12 text-center">Rank</th>
                      <th className="p-4">Staff Member</th>
                      <th className="p-4 text-center cursor-pointer hover:text-white transition" onClick={() => toggleSort('calls')}>
                        <div className="flex items-center justify-center gap-1">
                          <span>Calls Made</span>
                          <ArrowUpDown size={12} className={sortField === 'calls' ? 'text-violet-400' : 'text-slate-600'} />
                        </div>
                      </th>
                      <th className="p-4 text-center cursor-pointer hover:text-white transition" onClick={() => toggleSort('connectionRate')}>
                        <div className="flex items-center justify-center gap-1">
                          <span>Conn. Rate</span>
                          <ArrowUpDown size={12} className={sortField === 'connectionRate' ? 'text-violet-400' : 'text-slate-600'} />
                        </div>
                      </th>
                      <th className="p-4 text-center cursor-pointer hover:text-white transition" onClick={() => toggleSort('talkTime')}>
                        <div className="flex items-center justify-center gap-1">
                          <span>Total Talk Time</span>
                          <ArrowUpDown size={12} className={sortField === 'talkTime' ? 'text-violet-400' : 'text-slate-600'} />
                        </div>
                      </th>
                      <th className="p-4 text-center">Avg Duration</th>
                      <th className="p-4 text-center cursor-pointer hover:text-white transition" onClick={() => toggleSort('shortCallRatio')}>
                        <div className="flex items-center justify-center gap-1" title="Calls under 10 seconds">
                          <span>Short Call Flag</span>
                          <ArrowUpDown size={12} className={sortField === 'shortCallRatio' ? 'text-amber-400' : 'text-slate-600'} />
                        </div>
                      </th>
                      <th className="p-4 text-center cursor-pointer hover:text-white transition" onClick={() => toggleSort('conversions')}>
                        <div className="flex items-center justify-center gap-1">
                          <span>Deals Converted</span>
                          <ArrowUpDown size={12} className={sortField === 'conversions' ? 'text-emerald-400' : 'text-slate-600'} />
                        </div>
                      </th>
                      <th className="p-4 text-center">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {metrics.leaderboard.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-12 text-center text-slate-500">
                          No telecaller staff members found in the workspace pool.
                        </td>
                      </tr>
                    ) : (
                      metrics.leaderboard.map((caller, index) => {
                        const isTop = index === 0 && caller.conversions > 0;
                        return (
                          <tr key={caller.uid} className="hover:bg-slate-900/40 transition group">
                            <td className="p-4 text-center font-mono font-bold">
                              {index === 0 ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">1</span>
                              ) : index === 1 ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-400/20 text-slate-300 border border-slate-400/30">2</span>
                              ) : index === 2 ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-500 border border-amber-700/30">3</span>
                              ) : (
                                <span className="text-slate-500">#{index + 1}</span>
                              )}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center font-bold text-violet-300 text-xs shrink-0">
                                  {caller.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-200 flex items-center gap-1.5">
                                    <span>{caller.name}</span>
                                    {isTop && <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-mono">🌟 MVP</span>}
                                    {!caller.active && <span className="text-[9px] bg-rose-500/20 text-rose-400 px-1.5 py-0.2 rounded">Inactive</span>}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">{caller.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="p-4 text-center font-mono font-bold text-slate-200">
                              {caller.calls}
                            </td>
                            <td className="p-4 text-center font-mono font-bold text-sky-400">
                              {caller.connectionRate}%
                            </td>
                            <td className="p-4 text-center font-mono font-bold text-amber-400">
                              {formatDuration(caller.talkTime)}
                            </td>
                            <td className="p-4 text-center font-mono text-slate-400">
                              {formatDuration(caller.avgTalkTime)}
                            </td>
                            <td className="p-4 text-center">
                              {caller.shortCallRatio > 20 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20" title={`${caller.shortCalls} short calls`}>
                                  ⚠️ {caller.shortCallRatio}%
                                </span>
                              ) : (
                                <span className="font-mono text-slate-400 text-[11px]">{caller.shortCallRatio}%</span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg font-mono font-black text-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {caller.conversions}
                              </span>
                            </td>
                            <td className="p-4 text-center font-mono font-bold text-slate-300">
                              {caller.winRate}%
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

          {/* ========================================================================= */}
          {/* SUB-TAB 3: INTERACTION AUDIT TRAIL & QUALITY ASSURANCE LOGS               */}
          {/* ========================================================================= */}
          {activeSubTab === 'audittrail' && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden shadow-xl flex flex-col animate-in fade-in duration-300">
              {/* Table Header & Search Filter Bar */}
              <div className="px-6 py-5 border-b border-slate-800/80 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-slate-950/40">
                <div>
                  <h3 className="font-extrabold text-md text-slate-100 flex items-center gap-2">
                    <Activity className="text-violet-400" size={18} />
                    <span>Real-Time Calling Audit Trail & Log Directory</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Showing <span className="text-slate-200 font-bold">{metrics.auditLogs.length}</span> matching interactions. Built with strict DOM pagination to ensure 0% browser lag for 10,000+ records.
                  </p>
                </div>

                {/* Right: Search Bar & Row Count Selector */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Search Input */}
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                    <input 
                      type="text"
                      placeholder="Search lead name, phone, notes..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-violet-500 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 transition shadow-inner"
                    />
                    {searchTerm && (
                      <button 
                        onClick={() => setSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Rows Per Page Selector */}
                  <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-400">
                    <span>Rows:</span>
                    <select 
                      value={rowsPerPage}
                      onChange={(e) => setRowsPerPage(Number(e.target.value))}
                      className="bg-transparent text-slate-200 font-bold outline-none cursor-pointer"
                    >
                      <option value={10} className="bg-slate-900 text-slate-200">10</option>
                      <option value={25} className="bg-slate-900 text-slate-200">25</option>
                      <option value={50} className="bg-slate-900 text-slate-200">50</option>
                      <option value={100} className="bg-slate-900 text-slate-200">100</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Table Data */}
              <div className="overflow-x-auto min-h-[380px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-bold bg-slate-950/60 select-none">
                      <th className="p-4 whitespace-nowrap w-36">Time & Date</th>
                      <th className="p-4 w-44">Telecaller Staff</th>
                      <th className="p-4 w-52">Prospect Lead</th>
                      <th className="p-4 text-center w-48">Status Transition</th>
                      <th className="p-4 whitespace-nowrap w-36">Talk Duration</th>
                      <th className="p-4">Remarks & Call Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {paginatedAuditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-16 text-center text-slate-500">
                          {searchTerm ? (
                            <div className="space-y-2">
                              <p className="text-sm font-bold text-slate-400">No interaction logs matched your search "{searchTerm}".</p>
                              <button onClick={() => setSearchTerm('')} className="text-xs text-violet-400 hover:underline">Clear search filter</button>
                            </div>
                          ) : (
                            <p className="text-sm font-bold text-slate-500">No call interaction logs recorded during this period.</p>
                          )}
                        </td>
                      </tr>
                    ) : (
                      paginatedAuditLogs.map(i => {
                        const lead = leads.find(l => l.id === i.leadId);
                        const st = formatSmartTimestamp(i.timestamp);
                        const isShort = !i.isManualDuration && (Number(i.duration) || 0) > 0 && (Number(i.duration) || 0) < 10;
                        
                        return (
                          <tr key={i.id} className="hover:bg-slate-900/40 transition group">
                            <td className="p-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                              <span className="font-extrabold text-slate-200">{st.time}</span><br/>
                              <span className={st.date === 'Today' ? 'text-emerald-400 font-bold' : st.date === 'Yesterday' ? 'text-amber-400 font-bold' : 'text-slate-500'}>
                                {st.date}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="font-bold text-slate-200">{i.callerName}</div>
                              <div className="text-[10px] text-slate-500 font-mono">ID: {i.callerId.slice(0, 6)}...</div>
                            </td>
                            <td className="p-4">
                              <div className="font-bold text-slate-200 truncate max-w-[160px]" title={lead?.name || 'Unknown Lead'}>
                                {lead?.name || 'Unknown Lead'}
                              </div>
                              <div className="font-mono text-slate-400 text-[11px] mt-0.5">{lead?.phone || 'No Phone'}</div>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-1.5 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/80">
                                <span className="text-[10px] font-bold text-slate-400 truncate max-w-[70px]" title={i.statusBefore}>
                                  {i.statusBefore || 'New'}
                                </span>
                                <span className="text-slate-600 font-bold">→</span>
                                <StatusBadge status={i.statusAfter} />
                              </div>
                            </td>
                            <td className="p-4 font-mono font-bold text-slate-300 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span>{formatDuration(Number(i.duration) || 0)}</span>
                                {i.isManualDuration && (
                                  <span className="text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1 py-0.2 rounded font-sans uppercase">Manual</span>
                                )}
                              </div>
                              {isShort && (
                                <div className="mt-1 inline-flex items-center gap-1 text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.2 rounded font-sans uppercase tracking-tight" title="Call lasted under 10 seconds">
                                  ⚡ Short Call Flag
                                </div>
                              )}
                            </td>
                            <td className="p-4">
                              {i.notes ? (
                                <div className="flex items-start gap-2 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80 text-slate-300 text-xs">
                                  <MessageSquare size={13} className="text-violet-400 shrink-0 mt-0.5" />
                                  <span className="line-clamp-2 leading-relaxed" title={i.notes}>{i.notes}</span>
                                </div>
                              ) : (
                                <span className="text-slate-600 italic text-[11px]">No remarks provided</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Pagination Bar */}
              <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-bold text-slate-400">
                <div>
                  Showing <span className="text-slate-200">{(currentPage - 1) * rowsPerPage + (paginatedAuditLogs.length > 0 ? 1 : 0)}</span> to <span className="text-slate-200">{(currentPage - 1) * rowsPerPage + paginatedAuditLogs.length}</span> of <span className="text-slate-200">{metrics.auditLogs.length}</span> records
                </div>

                <div className="flex items-center gap-3">
                  <span>Page <strong className="text-slate-200">{currentPage}</strong> of <strong className="text-slate-200">{totalPages}</strong></span>
                  <div className="flex gap-1.5">
                    <button 
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 text-slate-200 border border-slate-800 transition flex items-center gap-1"
                    >
                      <ChevronLeft size={14} />
                      <span>Prev</span>
                    </button>
                    <button 
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 text-slate-200 border border-slate-800 transition flex items-center gap-1"
                    >
                      <span>Next</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Reusable Helper Components
function StatusBadge({ status }: { status: string }) {
  const getColors = (s: string) => {
    if (s === 'Converted') return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-black';
    if (s === 'Visit Scheduled' || s === 'Visited') return 'bg-pink-500/10 border-pink-500/30 text-pink-400 font-bold';
    if (s === 'Follow-up') return 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-bold';
    if (s === 'Not Interested' || s === 'Rejected' || s === 'Invalid' || (s && s.includes('(3+ Attempts)'))) return 'bg-rose-500/10 border-rose-500/30 text-rose-400 font-bold';
    if (s === 'New') return 'bg-violet-500/10 border-violet-500/30 text-violet-400 font-bold';
    return 'bg-sky-500/10 border-sky-500/30 text-sky-400 font-bold';
  };

  return (
    <span className={`px-2 py-0.5 rounded-lg text-[10px] uppercase border truncate max-w-[100px] text-center inline-block shadow-sm ${getColors(status)}`} title={status}>
      {status}
    </span>
  );
}

function MetricCard({ title, value, subtitle, icon, color, accent, badge, badgeColor }: any) {
  return (
    <div className={`p-5 rounded-3xl border ${color} flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] shadow-lg`}>
      <div>
        <div className="flex justify-between items-start mb-3">
          <h4 className="text-slate-400 text-xs font-extrabold uppercase tracking-wider">{title}</h4>
          <div className="p-2.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 shadow-sm shrink-0">
            {icon}
          </div>
        </div>
        <div className={`text-3xl lg:text-4xl font-black ${accent} tracking-tight font-mono`}>{value}</div>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-800/60 flex flex-col gap-1.5">
        <div className="text-xs text-slate-400 font-semibold">{subtitle}</div>
        {badge && (
          <div className="self-start mt-0.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border uppercase tracking-wide inline-block ${badgeColor}`}>
              {badge}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
