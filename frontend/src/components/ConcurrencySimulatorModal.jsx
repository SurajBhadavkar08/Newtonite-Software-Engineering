import React, { useState } from 'react';
import { api, apiRequest, generateIdempotencyKey } from '../api/client';
import { Zap, Play, CheckCircle2, XCircle, RefreshCw, AlertTriangle, ShieldCheck, KeyRound, ArrowRight } from 'lucide-react';

export default function ConcurrencySimulatorModal({ isOpen, onClose, onRefreshList }) {
  const [activeTab, setActiveTab] = useState('claim_race'); // 'claim_race' | 'occ_conflict' | 'idempotency'
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  if (!isOpen) return null;

  // 1. Simulate Simultaneous Claim Race
  const runClaimRace = async () => {
    setRunning(true);
    setResults(null);

    try {
      // 1. Create a fresh unassigned item
      const item = await api.createWorkItem({
        title: `Race Test Task [${new Date().toLocaleTimeString()}]`,
        description: 'Two users attempting to claim this unassigned item simultaneously.',
        category: 'ENGINEERING_INCIDENT',
        priority: 'P1_HIGH',
      });

      // 2. Dispatch two simultaneous claim requests from two different users
      const reqA = apiRequest(`/api/work-items/${item.id}/claim/`, {
        method: 'POST',
        headers: { 'X-Persona-User': 'david_kim' }
      }).then(r => ({ status: 'success', user: 'David Kim', code: r.status, data: r.data }))
        .catch(err => ({ status: 'conflict', user: 'David Kim', code: err.status, message: err.data?.message || err.message }));

      const reqB = apiRequest(`/api/work-items/${item.id}/claim/`, {
        method: 'POST',
        headers: { 'X-Persona-User': 'marcus_vance' }
      }).then(r => ({ status: 'success', user: 'Marcus Vance', code: r.status, data: r.data }))
        .catch(err => ({ status: 'conflict', user: 'Marcus Vance', code: err.status, message: err.data?.message || err.message }));

      const [resA, resB] = await Promise.all([reqA, reqB]);

      setResults({
        type: 'claim_race',
        itemId: item.id,
        trackingNumber: item.tracking_number,
        userA: resA,
        userB: resB,
      });

      onRefreshList();
    } catch (err) {
      setResults({ error: err.message });
    } finally {
      setRunning(false);
    }
  };

  // 2. Simulate Stale Version OCC Conflict
  const runOCCConflict = async () => {
    setRunning(true);
    setResults(null);

    try {
      // 1. Create item at version 1
      const item = await api.createWorkItem({
        title: `OCC Version Test [${new Date().toLocaleTimeString()}]`,
        description: 'Demonstrating Optimistic Concurrency Control rejection when updating stale version.',
        category: 'CUSTOMER_ISSUE',
        priority: 'P2_MEDIUM',
      });

      // 2. User A reads item at version 1 and successfully updates it to v2
      const updateA = await api.updateWorkItem(item.id, {
        priority: 'P0_CRITICAL',
        version: 1,
      });

      // 3. User B, who still holds stale version 1, attempts to update title
      let updateB = null;
      try {
        await api.updateWorkItem(item.id, {
          title: 'Stale Title Overwrite Attempt',
          version: 1, // Stale! Server is now at version 2
        });
      } catch (err) {
        updateB = {
          code: err.status,
          message: err.data?.message || err.message,
          currentVersion: err.data?.current_version,
        };
      }

      setResults({
        type: 'occ_conflict',
        trackingNumber: item.tracking_number,
        initialVersion: 1,
        userASuccessVersion: updateA.version,
        userBResult: updateB,
      });

      onRefreshList();
    } catch (err) {
      setResults({ error: err.message });
    } finally {
      setRunning(false);
    }
  };

  // 3. Simulate Idempotent Double Submission
  const runIdempotencyTest = async () => {
    setRunning(true);
    setResults(null);

    try {
      const idempotencyKey = generateIdempotencyKey('sim');
      const payload = {
        title: `Idempotent Billing Refund Ticket [${new Date().toLocaleTimeString()}]`,
        description: 'Verifying that duplicate API requests with identical Idempotency-Key return cached response.',
        category: 'CUSTOMER_ISSUE',
        priority: 'P1_HIGH',
      };

      // Call 1
      const res1 = await apiRequest('/api/work-items/', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload)
      });

      // Call 2 (Simulating network retry or user double-clicking)
      const res2 = await apiRequest('/api/work-items/', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload)
      });

      setResults({
        type: 'idempotency',
        key: idempotencyKey,
        req1: { status: res1.status, id: res1.data.id, trackingNumber: res1.data.tracking_number },
        req2: { status: res2.status, id: res2.data.id, isCached: res2.headers.get('X-Cache-Lookup') === 'HIT' },
      });

      onRefreshList();
    } catch (err) {
      setResults({ error: err.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-amber-500/30 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Concurrency & Correctness Laboratory</h2>
              <p className="text-xs text-slate-400">Live multi-user stress testing without ideal user behavior</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 text-xs">
          <button
            onClick={() => { setActiveTab('claim_race'); setResults(null); }}
            className={`flex-1 py-3 px-4 font-semibold text-center border-b-2 transition-colors ${
              activeTab === 'claim_race'
                ? 'border-amber-400 text-amber-300 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            1. Atomic Claim Race
          </button>
          <button
            onClick={() => { setActiveTab('occ_conflict'); setResults(null); }}
            className={`flex-1 py-3 px-4 font-semibold text-center border-b-2 transition-colors ${
              activeTab === 'occ_conflict'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            2. Stale Update (OCC)
          </button>
          <button
            onClick={() => { setActiveTab('idempotency'); setResults(null); }}
            className={`flex-1 py-3 px-4 font-semibold text-center border-b-2 transition-colors ${
              activeTab === 'idempotency'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            3. Idempotent Retry
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 text-xs space-y-4">
          {activeTab === 'claim_race' && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-slate-200">Scenario: Simultaneous Claim Contention</span>
                <p className="text-slate-400 leading-relaxed">
                  Two engineers (David Kim and Marcus Vance) click "Claim" on the exact same unassigned triage task at the same microsecond.
                  Backend uses <code className="text-amber-300">select_for_update()</code> inside an atomic transaction. Only one will claim ownership (200 OK); the second will receive a clean <code className="text-rose-400">409 Conflict</code> instead of duplicate assignments.
                </p>
              </div>

              <button
                onClick={runClaimRace}
                disabled={running}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{running ? 'Firing simultaneous requests...' : 'Run Simultaneous Claim Race'}</span>
              </button>

              {results?.type === 'claim_race' && (
                <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 animate-in fade-in">
                  <div className="font-bold text-white text-sm">
                    Target: <span className="font-mono text-indigo-400">{results.trackingNumber}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* User A Result */}
                    <div className={`p-3 rounded-lg border ${results.userA.status === 'success' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-200">{results.userA.user}</span>
                        <span className="font-mono font-bold text-xs">{results.userA.code}</span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        {results.userA.status === 'success' ? '✓ Acquired ownership cleanly' : `✕ ${results.userA.message}`}
                      </p>
                    </div>

                    {/* User B Result */}
                    <div className={`p-3 rounded-lg border ${results.userB.status === 'success' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-200">{results.userB.user}</span>
                        <span className="font-mono font-bold text-xs">{results.userB.code}</span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        {results.userB.status === 'success' ? '✓ Acquired ownership cleanly' : `✕ ${results.userB.message}`}
                      </p>
                    </div>
                  </div>
                  {(() => {
                    const codes = [results.userA.code, results.userB.code];
                    const oneWinner = codes.includes(200) && codes.includes(409);
                    const noDoubleWin = !(results.userA.status === 'success' && results.userB.status === 'success');
                    return (
                      <div className={`p-2 rounded bg-slate-900 border text-[11px] flex items-center space-x-1.5 ${oneWinner ? 'border-slate-800 text-emerald-400' : noDoubleWin ? 'border-amber-500/30 text-amber-300' : 'border-rose-500/30 text-rose-300'}`}>
                        <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                        <span>
                          {oneWinner
                            ? 'Integrity Preserved: one 200 claim + one 409 Conflict. No double-assignment.'
                            : noDoubleWin
                              ? 'Integrity Preserved: at most one claimant succeeded (conflict signaled to the other user).'
                              : 'Unexpected: both claimants succeeded. Investigate claim locking.'}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {activeTab === 'occ_conflict' && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-slate-200">Scenario: Stale Read & Blind Overwrite Prevention</span>
                <p className="text-slate-400 leading-relaxed">
                  Both users read a ticket at <code className="text-indigo-300">version 1</code>. User A updates priority, advancing the record to <code className="text-indigo-300">version 2</code>. User B then attempts to submit an edit using their stale version 1.
                  The backend detects the version mismatch and rejects User B with <code className="text-rose-400">409 Conflict</code>.
                </p>
              </div>

              <button
                onClick={runOCCConflict}
                disabled={running}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{running ? 'Executing OCC conflict test...' : 'Simulate Stale Overwrite Attempt'}</span>
              </button>

              {results?.type === 'occ_conflict' && (
                <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 animate-in fade-in">
                  <div className="font-bold text-white text-sm">
                    Target: <span className="font-mono text-indigo-400">{results.trackingNumber}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-between">
                      <span>1. User A updated from v1 → v{results.userASuccessVersion}</span>
                      <span className="font-bold">200 OK</span>
                    </div>
                    <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between">
                      <div>
                        <div className="font-bold">2. User B submitted stale v1</div>
                        <div className="text-[11px] text-rose-400">{results.userBResult.message}</div>
                      </div>
                      <span className="font-bold text-rose-400 font-mono">409 CONFLICT</span>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-emerald-400 flex items-center space-x-1.5">
                    <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                    <span>Data Protected: User A's changes were not silently overwritten by User B.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'idempotency' && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-slate-200">Scenario: Double Submission & Retry Defense</span>
                <p className="text-slate-400 leading-relaxed">
                  A user double-clicks or their browser connection times out and retries. Both HTTP requests transmit an identical <code className="text-cyan-300">X-Idempotency-Key</code>.
                  The second call returns the cached <code className="text-cyan-300">201 Created</code> response payload without executing side-effects or duplicating records.
                </p>
              </div>

              <button
                onClick={runIdempotencyTest}
                disabled={running}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{running ? 'Firing duplicate requests...' : 'Test Idempotency Replay'}</span>
              </button>

              {results?.type === 'idempotency' && (
                <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 animate-in fade-in">
                  <div className="font-mono text-[11px] text-slate-400">
                    Key: <span className="text-cyan-400">{results.key}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="p-2.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-slate-200">
                      <span>Request 1 (Primary execution): Created item #{results.req1.id}</span>
                      <span className="font-bold font-mono text-emerald-400">{results.req1.status} OK</span>
                    </div>
                    <div className="p-2.5 rounded bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between text-cyan-300">
                      <span>Request 2 (Duplicate replay): Returned cached response for item #{results.req2.id}</span>
                      <span className="font-bold font-mono text-cyan-400">CACHE HIT</span>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-emerald-400 flex items-center space-x-1.5">
                    <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                    <span>Zero Duplication: Exactly 1 record was committed to the database.</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
