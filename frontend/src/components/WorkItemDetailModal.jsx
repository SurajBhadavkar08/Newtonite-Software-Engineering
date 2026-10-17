import React, { useState, useEffect } from 'react';
import { usePersona } from '../context/PersonaContext';
import { api, generateIdempotencyKey } from '../api/client';
import { PriorityBadge, StatusPill } from './WorkItemList';
import {
  X,
  Clock,
  Shield,
  User,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  ArrowRight,
  HandMetal,
  History,
  Send,
  Lock,
  Pause,
  RotateCcw
} from 'lucide-react';

export default function WorkItemDetailModal({ itemId, onClose, onRefreshList }) {
  const { activePersona } = usePersona();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [conflictError, setConflictError] = useState(null);

  // Action states
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  // Guards prompt state
  const [promptAction, setPromptAction] = useState(null); // { type: 'RESOLVE' | 'BLOCK' | 'REJECT', targetStatus }
  const [promptNotes, setPromptNotes] = useState('');

  // Approval decision state
  const [approvalNotes, setApprovalNotes] = useState('');

  useEffect(() => {
    loadItem();
  }, [itemId]);

  const loadItem = async () => {
    setLoading(true);
    setError(null);
    setConflictError(null);
    try {
      const data = await api.getWorkItem(itemId);
      setItem(data);
    } catch (err) {
      setError(err.data?.message || err.message || 'Failed to load work item');
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    try {
      const key = generateIdempotencyKey('claim');
      const updated = await api.claimWorkItem(item.id, key);
      setItem(updated);
      onRefreshList();
    } catch (err) {
      if (err.status === 409) {
        setConflictError(err.data?.message || 'Race condition: This work item has already been claimed by another worker.');
      } else {
        setError(err.data?.message || err.message);
      }
    }
  };

  const handleTransition = async (targetStatus) => {
    // Check guards
    if (targetStatus === 'RESOLVED' && !item.resolution_notes) {
      setPromptAction({ type: 'RESOLVE', targetStatus });
      setPromptNotes('');
      return;
    }
    if (targetStatus === 'BLOCKED' && !item.blocked_reason) {
      setPromptAction({ type: 'BLOCK', targetStatus });
      setPromptNotes('');
      return;
    }

    executeTransition(targetStatus);
  };

  const executeTransition = async (targetStatus, extra = {}) => {
    setTransitioning(true);
    setConflictError(null);
    try {
      const key = generateIdempotencyKey('trans');
      const payload = {
        target_status: targetStatus,
        version: item.version,
        notes: extra.notes || `Transitioned to ${targetStatus}`,
        blocked_reason: extra.blocked_reason,
        resolution_notes: extra.resolution_notes,
      };

      const updated = await api.transitionWorkItem(item.id, payload, key);
      setItem(updated);
      setPromptAction(null);
      onRefreshList();
    } catch (err) {
      if (err.status === 409) {
        setConflictError(
          err.data?.message || `Conflict: This work item has been modified on the server (v${err.data?.current_version || 'new'}). Reloading is required.`
        );
      } else {
        setError(err.data?.message || err.message);
      }
    } finally {
      setTransitioning(false);
    }
  };

  const handleRequestApproval = async () => {
    setTransitioning(true);
    try {
      const key = generateIdempotencyKey('req-app');
      const updated = await api.requestApproval(item.id, { notes: 'Requested sign-off for operational review' }, key);
      setItem(updated);
      onRefreshList();
    } catch (err) {
      setError(err.data?.message || err.message);
    } finally {
      setTransitioning(false);
    }
  };

  const handleDecideApproval = async (approved) => {
    setTransitioning(true);
    try {
      const key = generateIdempotencyKey('decide-app');
      const updated = await api.decideApproval(item.id, { approved, notes: approvalNotes }, key);
      setItem(updated);
      setApprovalNotes('');
      onRefreshList();
    } catch (err) {
      if (err.status === 403) {
        setError("Authorization Denied: Only Team Leads or Admins of this team have permission to sign off.");
      } else {
        setError(err.data?.message || err.message);
      }
    } finally {
      setTransitioning(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setSubmittingComment(true);
    try {
      const key = generateIdempotencyKey('comment');
      await api.addComment(item.id, commentText.trim(), key);
      setCommentText('');
      loadItem();
      onRefreshList();
    } catch (err) {
      setError(err.data?.message || err.message);
    } finally {
      setSubmittingComment(false);
    }
  };

  if (!itemId) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="font-mono text-base font-bold text-indigo-400">
              {item?.tracking_number || 'Loading...'}
            </span>
            {item && <PriorityBadge priority={item.priority} />}
            {item && <StatusPill status={item.status} />}
            {item && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700" title="Optimistic Concurrency Control Version">
                v{item.version}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stale Concurrency Conflict Banner */}
        {conflictError && (
          <div className="p-4 bg-rose-500/10 border-b border-rose-500/30 flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{conflictError}</span>
            </div>
            <button
              onClick={loadItem}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs ml-3"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Refresh Latest State</span>
            </button>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="p-3 bg-rose-500/10 border-b border-rose-500/20 text-xs text-rose-400 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-white font-bold ml-2">✕</button>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading work item details...
          </div>
        ) : !item ? (
          <div className="p-12 text-center text-slate-400 text-xs">Work item not found or inaccessible.</div>
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
            {/* Left 2 Cols: Main Details, Workflow Controls, History & Comments */}
            <div className="lg:col-span-2 p-5 space-y-6">
              {/* Title & Description */}
              <div>
                <h2 className="text-lg font-bold text-white mb-2 leading-snug">{item.title}</h2>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {item.description}
                </div>
              </div>

              {/* Blocked or Resolution Alert Banner */}
              {item.status === 'BLOCKED' && item.blocked_reason && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                  <span className="font-bold flex items-center space-x-1 mb-1 text-rose-400">
                    <Pause className="w-3.5 h-3.5" />
                    <span>BLOCKED REASON:</span>
                  </span>
                  <p>{item.blocked_reason}</p>
                </div>
              )}

              {item.status === 'RESOLVED' && item.resolution_notes && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                  <span className="font-bold flex items-center space-x-1 mb-1 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>RESOLUTION NOTES:</span>
                  </span>
                  <p>{item.resolution_notes}</p>
                </div>
              )}

              {/* Dynamic State Machine Transitions */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Workflow Actions
                  </span>
                  <span className="text-[11px] text-slate-500">
                    State Machine: <span className="text-indigo-400 font-semibold">{item.status}</span>
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {/* Claim Button */}
                  {!item.assigned_to && (
                    <button
                      onClick={handleClaim}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                    >
                      <HandMetal className="w-3.5 h-3.5" />
                      <span>Claim Responsibility (Atomic Lock)</span>
                    </button>
                  )}

                  {/* Transition actions based on status */}
                  {item.status === 'TRIAGE' && (
                    <button
                      onClick={() => handleTransition('IN_INVESTIGATION')}
                      disabled={transitioning}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                    >
                      Start Investigation →
                    </button>
                  )}

                  {item.status === 'IN_INVESTIGATION' && (
                    <>
                      {item.requires_approval ? (
                        <button
                          onClick={handleRequestApproval}
                          disabled={transitioning}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-sm"
                        >
                          Submit for Approval →
                        </button>
                      ) : (
                        <button
                          onClick={() => handleTransition('IN_PROGRESS')}
                          disabled={transitioning}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                          Move to In Progress →
                        </button>
                      )}
                    </>
                  )}

                  {item.status === 'IN_PROGRESS' && (
                    <button
                      onClick={() => handleTransition('RESOLVED')}
                      disabled={transitioning}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      Resolve Work Item ✓
                    </button>
                  )}

                  {item.status !== 'BLOCKED' && item.status !== 'RESOLVED' && item.status !== 'CLOSED' && (
                    <button
                      onClick={() => handleTransition('BLOCKED')}
                      disabled={transitioning}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    >
                      Mark Blocked
                    </button>
                  )}

                  {item.status === 'BLOCKED' && (
                    <button
                      onClick={() => handleTransition('IN_INVESTIGATION')}
                      disabled={transitioning}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white"
                    >
                      Unblock & Resume Investigation
                    </button>
                  )}

                  {item.status === 'RESOLVED' && (
                    <>
                      <button
                        onClick={() => handleTransition('CLOSED')}
                        disabled={transitioning}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                      >
                        Close Item
                      </button>
                      <button
                        onClick={() => handleTransition('IN_INVESTIGATION')}
                        disabled={transitioning}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-400 hover:bg-amber-500/10 border border-amber-500/30"
                      >
                        Reopen Item
                      </button>
                    </>
                  )}
                </div>

                {/* Guard Prompt Modal / Dialog if Resolving or Blocking */}
                {promptAction && (
                  <div className="mt-4 p-3.5 bg-slate-900 border border-indigo-500/40 rounded-xl space-y-2">
                    <span className="text-xs font-semibold text-white">
                      {promptAction.type === 'RESOLVE' ? 'Mandatory Resolution Notes:' : 'Mandatory Blocker Reason:'}
                    </span>
                    <textarea
                      value={promptNotes}
                      onChange={(e) => setPromptNotes(e.target.value)}
                      placeholder={promptAction.type === 'RESOLVE' ? 'Explain how the issue was fixed and verified...' : 'Specify dependency or reason for obstruction...'}
                      rows={2}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => setPromptAction(null)}
                        className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (promptAction.type === 'RESOLVE') {
                            executeTransition('RESOLVED', { resolution_notes: promptNotes });
                          } else {
                            executeTransition('BLOCKED', { blocked_reason: promptNotes });
                          }
                        }}
                        disabled={!promptNotes.trim()}
                        className="px-3 py-1 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
                      >
                        Confirm Transition
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Approval Request Card (If item is PENDING_APPROVAL) */}
              {item.status === 'PENDING_APPROVAL' && (
                <div className="bg-purple-950/30 border border-purple-500/40 rounded-xl p-4 space-y-3">
                  <div className="flex items-center space-x-2 text-purple-300">
                    <AlertTriangle className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold uppercase tracking-wider">Awaiting Managerial Sign-Off</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    This work item requires authorization from a <span className="font-semibold text-white">Team Lead or Admin</span> of{' '}
                    <span className="text-indigo-300 font-semibold">{item.assigned_team?.name || 'the assigned team'}</span> before it can enter active progress.
                  </p>

                  <textarea
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    placeholder="Decision rationale / review comments..."
                    rows={2}
                    className="w-full bg-slate-950 border border-purple-500/30 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-400"
                  />

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleDecideApproval(true)}
                      disabled={transitioning}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve Request</span>
                    </button>
                    <button
                      onClick={() => handleDecideApproval(false)}
                      disabled={transitioning}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/80 hover:bg-rose-600 text-white"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject Request</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Audit Timeline / Activity History */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <History className="w-4 h-4 text-slate-400" />
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Immutable Audit Timeline ({item.activities?.length || 0})
                  </h3>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 max-h-60 overflow-y-auto space-y-2.5">
                  {item.activities?.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-2">No activity recorded yet.</p>
                  ) : (
                    item.activities?.map((act) => (
                      <div key={act.id} className="flex items-start space-x-2.5 text-xs text-slate-300 border-l-2 border-slate-700 pl-3 py-1">
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
                            <span className="font-semibold text-slate-200">{act.actor?.username || 'System'}</span>
                            <span className="font-mono text-slate-500">{new Date(act.created_at).toLocaleTimeString()}</span>
                          </div>
                          <div className="text-slate-300 font-medium">
                            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono mr-1 text-indigo-300">
                              {act.action}
                            </span>
                            {act.notes || `${act.field_name}: ${act.old_value} → ${act.new_value}`}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Comments Collaboration */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Collaboration & Comments ({item.comments?.length || 0})
                  </h3>
                </div>

                <div className="space-y-2 mb-3 max-h-52 overflow-y-auto">
                  {item.comments?.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No comments yet. Start the conversation below.</p>
                  ) : (
                    item.comments?.map((c) => (
                      <div key={c.id} className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg text-xs space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="font-semibold text-indigo-300">{c.author?.username}</span>
                          <span className="font-mono text-slate-500">{new Date(c.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-200">{c.content}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleAddComment} className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="Add an update or investigation note..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={submittingComment || !commentText.trim()}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1 disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column: Metadata Sidebar */}
            <div className="p-5 space-y-5 bg-slate-950/40 text-xs">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 block mb-1">
                  Responsible Team
                </span>
                <div className="flex items-center space-x-2 font-medium text-slate-200">
                  <Shield className="w-4 h-4 text-indigo-400" />
                  <span>{item.assigned_team?.name || 'Unassigned Team'}</span>
                  {item.assigned_team?.is_sensitive && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      SENSITIVE
                    </span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 block mb-1">
                  Current Assignee
                </span>
                {item.assigned_to ? (
                  <div className="flex items-center space-x-2 font-medium text-slate-200">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-[10px]">
                      {item.assigned_to.first_name?.[0] || item.assigned_to.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div>{item.assigned_to.first_name} {item.assigned_to.last_name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">@{item.assigned_to.username}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-amber-400 italic">Unassigned (Available for claim)</div>
                )}
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 block mb-1">
                  Reported By
                </span>
                <div className="text-slate-300">
                  {item.created_by?.username} on {new Date(item.created_at).toLocaleDateString()}
                </div>
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 block mb-1">
                  Concurrency Version
                </span>
                <div className="font-mono text-slate-300">
                  Server version: <span className="font-bold text-indigo-400">v{item.version}</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Protects against accidental blind overwrites during concurrent edits.
                </p>
              </div>

              {item.tags?.length > 0 && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 block mb-1.5">
                    Tags & Classification
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((t, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono border border-slate-700">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
