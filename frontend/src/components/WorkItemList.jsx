import React from 'react';
import {
  Flame,
  AlertCircle,
  Clock,
  CheckCircle2,
  Lock,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  HandMetal,
  Shield,
  Layers
} from 'lucide-react';

export function PriorityBadge({ priority }) {
  switch (priority) {
    case 'P0_CRITICAL':
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
          <Flame className="w-3 h-3" />
          <span>P0 CRITICAL</span>
        </span>
      );
    case 'P1_HIGH':
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
          <AlertCircle className="w-3 h-3" />
          <span>P1 HIGH</span>
        </span>
      );
    case 'P2_MEDIUM':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
          P2 MEDIUM
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
          P3 LOW
        </span>
      );
  }
}

export function StatusPill({ status }) {
  const styles = {
    TRIAGE: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    IN_INVESTIGATION: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    PENDING_APPROVAL: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    IN_PROGRESS: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    BLOCKED: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    RESOLVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    CLOSED: 'bg-slate-500/10 text-slate-400 border-slate-700',
  };

  const labels = {
    TRIAGE: 'Triage',
    IN_INVESTIGATION: 'Investigating',
    PENDING_APPROVAL: 'Pending Approval',
    IN_PROGRESS: 'In Progress',
    BLOCKED: 'Blocked',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[status] || styles.TRIAGE}`}>
      {labels[status] || status}
    </span>
  );
}

export default function WorkItemList({
  workItems = [],
  pagination = {},
  onPageChange,
  onSelectItem,
  onClaimItem,
  loading = false,
}) {
  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-slate-400">Loading operational work items...</p>
      </div>
    );
  }

  if (workItems.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
        <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-300">No work items found</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          No operations match the selected filters or team permissions. Adjust filters or create a new work item.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase font-semibold tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Item & Priority</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Assigned Team</th>
              <th className="py-3 px-4">Assignee</th>
              <th className="py-3 px-4 text-center">Version (OCC)</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {workItems.map((item) => {
              const isUnassigned = !item.assigned_to;
              const isSensitive = ['PAYMENT_INVESTIGATION', 'COMPLIANCE_REQUEST'].includes(item.category);

              return (
                <tr
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className="hover:bg-slate-800/60 transition-colors cursor-pointer group"
                >
                  {/* Item ID & Title */}
                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-mono font-bold text-indigo-400 tracking-wider">
                        {item.tracking_number}
                      </span>
                      <PriorityBadge priority={item.priority} />
                      {item.has_pending_approval && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          APPROVAL NEEDED
                        </span>
                      )}
                    </div>
                    <div className="font-medium text-slate-200 text-sm group-hover:text-white transition-colors truncate max-w-md">
                      {item.title}
                    </div>
                  </td>

                  {/* Category */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center space-x-1.5 text-slate-300">
                      {isSensitive && <Lock className="w-3.5 h-3.5 text-amber-400" />}
                      <span>{item.category.replace(/_/g, ' ')}</span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <StatusPill status={item.status} />
                  </td>

                  {/* Team */}
                  <td className="py-3 px-4 whitespace-nowrap text-slate-300">
                    <div className="flex items-center space-x-1.5">
                      <Shield className="w-3.5 h-3.5 text-slate-500" />
                      <span>{item.assigned_team_name || 'Unassigned'}</span>
                    </div>
                  </td>

                  {/* Assignee */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    {isUnassigned ? (
                      <span className="text-amber-400/90 font-medium italic text-[11px] bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        Unclaimed
                      </span>
                    ) : (
                      <div className="flex items-center space-x-1.5 text-slate-200">
                        <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white">
                          {item.assigned_to_name?.[0]?.toUpperCase()}
                        </div>
                        <span className="font-medium">{item.assigned_to_name}</span>
                      </div>
                    )}
                  </td>

                  {/* OCC Version */}
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700" title="Optimistic Concurrency Control Version">
                      v{item.version}
                    </span>
                  </td>

                  {/* Action buttons */}
                  <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {isUnassigned ? (
                      <button
                        onClick={() => onClaimItem(item)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm"
                        title="Claim ownership (Atomic lock prevented race)"
                      >
                        <HandMetal className="w-3 h-3" />
                        <span>Claim</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onSelectItem(item)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold px-2 py-1 rounded hover:bg-slate-800 transition-colors"
                      >
                        Details →
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pagination && (pagination.total_pages > 1 || pagination.count > 0) && (
        <div className="bg-slate-950/80 px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing page <span className="text-white font-semibold">{pagination.current_page || 1}</span> of{' '}
            <span className="text-white font-semibold">{pagination.total_pages || 1}</span> ({pagination.count || 0} total items)
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onPageChange((pagination.current_page || 1) - 1)}
              disabled={!pagination.previous}
              className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onPageChange((pagination.current_page || 1) + 1)}
              disabled={!pagination.next}
              className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
