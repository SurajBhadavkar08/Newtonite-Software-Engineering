import React from 'react';
import { AlertTriangle, Clock, Flame, ShieldCheck, PauseCircle, Layers } from 'lucide-react';

export default function MetricsOverview({ metrics, activeFilter, onSelectFilter }) {
  if (!metrics) return null;

  const cards = [
    {
      id: 'all',
      title: 'Active Operations',
      count: metrics.total_active ?? 0,
      icon: Layers,
      color: 'indigo',
      border: 'border-indigo-500/30',
      bg: 'bg-indigo-500/10',
      text: 'text-indigo-400',
      desc: 'Total active work items',
    },
    {
      id: 'critical_incidents',
      title: 'P0/P1 Incidents',
      count: metrics.p0_p1_incidents ?? 0,
      icon: Flame,
      color: 'rose',
      border: 'border-rose-500/30',
      bg: 'bg-rose-500/10',
      text: 'text-rose-400',
      desc: 'High severity escalations',
      alert: (metrics.p0_p1_incidents ?? 0) > 0,
    },
    {
      id: 'pending_approval',
      title: 'Awaiting Sign-off',
      count: metrics.pending_approvals ?? 0,
      icon: Clock,
      color: 'amber',
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      desc: 'Manager approval required',
    },
    {
      id: 'needs_attention',
      title: 'Unassigned Triage',
      count: metrics.unassigned_triage ?? 0,
      icon: AlertTriangle,
      color: 'amber',
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      desc: 'Unclaimed in triage queue',
      alert: (metrics.unassigned_triage ?? 0) > 0,
    },
    {
      id: 'blocked',
      title: 'Blocked Tasks',
      count: metrics.blocked_items ?? 0,
      icon: PauseCircle,
      color: 'purple',
      border: 'border-purple-500/30',
      bg: 'bg-purple-500/10',
      text: 'text-purple-400',
      desc: 'Waiting on dependencies',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {cards.map((c) => {
        const Icon = c.icon;
        const isSelected = activeFilter === c.id;

        return (
          <button
            key={c.id}
            onClick={() => onSelectFilter(c.id)}
            className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all text-left group ${
              isSelected
                ? `${c.border} ${c.bg} ring-2 ring-indigo-500/40 shadow-lg shadow-indigo-500/10`
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="text-xs font-medium text-slate-400">{c.title}</span>
              <div className={`p-1.5 rounded-lg ${c.bg} ${c.text}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight text-white">{c.count}</span>
              {c.alert && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 animate-pulse">
                  ATTENTION
                </span>
              )}
            </div>

            <span className="text-[11px] text-slate-500 mt-1 truncate">{c.desc}</span>
          </button>
        );
      })}
    </div>
  );
}
