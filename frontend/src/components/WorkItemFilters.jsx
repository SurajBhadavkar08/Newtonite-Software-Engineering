import React from 'react';
import { Search, Filter, X } from 'lucide-react';

export default function WorkItemFilters({
  scope,
  onScopeChange,
  search,
  onSearchChange,
  category,
  onCategoryChange,
  priority,
  onPriorityChange,
  teams = [],
  teamId,
  onTeamIdChange,
  onReset
}) {
  const tabs = [
    { id: 'all', label: 'All Operations' },
    { id: 'my_items', label: 'Assigned to Me' },
    { id: 'my_teams', label: 'My Teams' },
    { id: 'needs_attention', label: 'Needs Attention' },
    { id: 'critical_incidents', label: 'P0/P1 Incidents' },
    { id: 'pending_approval', label: 'Pending Approval' },
  ];

  const hasActiveFilters = search || category || priority || teamId || (scope !== 'all');

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 mb-5 space-y-3">
      {/* Scope Tabs */}
      <div className="flex items-center space-x-1 overflow-x-auto pb-1 scrollbar-none border-b border-slate-800">
        {tabs.map((tab) => {
          const isActive = scope === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onScopeChange(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Filter Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-1">
        {/* Search */}
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by ID, title, or keywords..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-slate-950/70 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Category */}
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="bg-slate-950/70 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Categories</option>
          <option value="CUSTOMER_ISSUE">Customer Issue</option>
          <option value="ENGINEERING_INCIDENT">Engineering Incident</option>
          <option value="PAYMENT_INVESTIGATION">Payment Investigation (Sensitive)</option>
          <option value="COMPLIANCE_REQUEST">Compliance Request (Sensitive)</option>
          <option value="OPERATIONAL_APPROVAL">Operational Task / Approval</option>
          <option value="SECURITY_ALERT">Security Alert</option>
        </select>

        {/* Priority */}
        <select
          value={priority}
          onChange={(e) => onPriorityChange(e.target.value)}
          className="bg-slate-950/70 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Priorities</option>
          <option value="P0_CRITICAL">P0 - Critical</option>
          <option value="P1_HIGH">P1 - High</option>
          <option value="P2_MEDIUM">P2 - Medium</option>
          <option value="P3_LOW">P3 - Low</option>
        </select>

        {/* Team */}
        <div className="flex items-center space-x-1.5">
          <select
            value={teamId}
            onChange={(e) => onTeamIdChange(e.target.value)}
            className="w-full bg-slate-950/70 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.is_sensitive ? '🔒' : ''}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={onReset}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Reset filters"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
