import React, { useState } from 'react';
import { usePersona } from '../context/PersonaContext';
import {
  ShieldAlert,
  Users,
  Plus,
  RefreshCw,
  Zap,
  Activity,
  CheckCircle2,
  ChevronDown
} from 'lucide-react';

export default function Navbar({ onOpenCreate, onOpenSimulator, onOpenOutbox, outboxCount = 0 }) {
  const { personas, activePersona, switchPersona } = usePersona();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Branding */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <ShieldAlert className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white">NEWTONITE</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                OPS COMMAND
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Reliable Coordination Under Pressure</p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-3">
          {/* Concurrency Simulator Button */}
          <button
            onClick={onOpenSimulator}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition-colors shadow-sm"
            title="Demonstrate concurrent claim races, OCC conflicts, and idempotency"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Concurrency Lab</span>
          </button>

          {/* Outbox Activity Drawer */}
          <button
            onClick={onOpenOutbox}
            className="relative flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-750 transition-colors"
            title="Inspect Asynchronous Outbox Events"
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Outbox</span>
            {outboxCount > 0 && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
            )}
          </button>

          {/* Persona Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition-all text-left"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-sm">
                {activePersona?.first_name?.[0] || 'U'}
              </div>
              <div className="hidden sm:block">
                <div className="text-xs font-semibold text-slate-200 flex items-center space-x-1">
                  <span>{activePersona?.first_name} {activePersona?.last_name}</span>
                  {activePersona?.is_superuser && (
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1 rounded font-mono">ADMIN</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                  {activePersona?.teams?.[0]?.team_name || 'All Teams'} ({activePersona?.teams?.[0]?.role || 'Member'})
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-3 py-2 border-b border-slate-800 mb-1">
                    <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Switch Persona (RBAC)</p>
                    <p className="text-[11px] text-slate-500">Test resource authorization and multi-user actions</p>
                  </div>
                  <div className="space-y-1">
                    {personas.map((p) => {
                      const isSelected = p.username === activePersona?.username;
                      const primaryTeam = p.teams?.[0];
                      return (
                        <button
                          key={p.username}
                          onClick={() => {
                            switchPersona(p);
                            setDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-all ${
                            isSelected
                              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                              : 'hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center font-bold text-[10px] text-white">
                              {p.first_name[0]}
                            </div>
                            <div>
                              <div className="font-semibold text-white">
                                {p.first_name} {p.last_name}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {primaryTeam ? `${primaryTeam.team_name} · ${primaryTeam.role}` : 'All Operations'}
                              </div>
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Create Work Item CTA */}
          <button
            onClick={onOpenCreate}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Work Item</span>
          </button>
        </div>
      </div>
    </header>
  );
}
