import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { X, RefreshCw, Play, CheckCircle2, AlertTriangle, Clock, Activity, Skull } from 'lucide-react';

export default function OutboxDrawer({ isOpen, onClose }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadEvents();
    }
  }, [isOpen]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await api.getOutboxEvents();
      setEvents(data);
    } catch (err) {
      console.error('Failed to load outbox events:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessBatch = async () => {
    setProcessing(true);
    setProcessResult(null);
    try {
      const result = await api.processOutboxBatch(20);
      setProcessResult(result);
      await loadEvents();
    } catch (err) {
      console.error('Failed to process outbox batch:', err);
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-sm">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col text-xs">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              <div>
                <h2 className="text-sm font-bold text-white">Transactional Outbox Queue</h2>
                <p className="text-[11px] text-slate-400">Resilient asynchronous event dispatcher</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action Bar */}
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <button
              onClick={loadEvents}
              disabled={loading}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleProcessBatch}
              disabled={processing}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold shadow-sm disabled:opacity-50"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>{processing ? 'Processing...' : 'Run Worker Batch'}</span>
            </button>
          </div>

          {/* Batch Result Notification */}
          {processResult && (
            <div className="p-2.5 bg-cyan-500/10 border-b border-cyan-500/20 text-cyan-300 text-[11px] flex items-center justify-between">
              <span>
                Processed {processResult.processed} / {processResult.total_batch} events ({processResult.failed} failed)
              </span>
              <button onClick={() => setProcessResult(null)} className="font-bold">✕</button>
            </div>
          )}

          {/* Event Stream List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {loading && events.length === 0 ? (
              <div className="text-center py-8 text-slate-500">Loading outbox events...</div>
            ) : events.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No events currently in the outbox.</div>
            ) : (
              events.map((evt) => {
                const isPending = evt.status === 'PENDING';
                const isProcessed = evt.status === 'PROCESSED';
                const isFailed = evt.status === 'FAILED';
                const isDead = evt.status === 'DEAD_LETTER';

                return (
                  <div
                    key={evt.id}
                    className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-indigo-400">{evt.aggregate_id}</span>
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          isProcessed
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : isPending
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : isDead
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                        }`}
                      >
                        {isProcessed && <CheckCircle2 className="w-3 h-3" />}
                        {isPending && <Clock className="w-3 h-3" />}
                        {isDead && <Skull className="w-3 h-3" />}
                        <span>{evt.status}</span>
                      </span>
                    </div>

                    <div className="font-semibold text-slate-200 text-xs">
                      {evt.event_type}
                    </div>

                    {evt.retry_count > 0 && (
                      <div className="text-[10px] text-amber-400">
                        Retries: {evt.retry_count} / {evt.max_retries}
                      </div>
                    )}

                    {evt.last_error && (
                      <div className="text-[10px] text-rose-400 font-mono bg-rose-500/10 p-1.5 rounded">
                        {evt.last_error}
                      </div>
                    )}

                    <div className="text-[10px] font-mono text-slate-500 flex justify-between">
                      <span>Created: {new Date(evt.created_at).toLocaleTimeString()}</span>
                      {evt.processed_at && (
                        <span>Done: {new Date(evt.processed_at).toLocaleTimeString()}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
