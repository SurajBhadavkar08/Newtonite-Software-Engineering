import React, { useState } from 'react';
import { api, generateIdempotencyKey } from '../api/client';
import { X, Plus, ShieldAlert, KeyRound } from 'lucide-react';

export default function CreateWorkItemModal({ isOpen, onClose, onSuccess, teams = [] }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('CUSTOMER_ISSUE');
  const [priority, setPriority] = useState('P2_MEDIUM');
  const [assignedTeam, setAssignedTeam] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [useIdempotency, setUseIdempotency] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateIdempotencyKey('new-item'));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);

    const payload = {
      title,
      description,
      category,
      priority,
      assigned_team: assignedTeam || null,
      requires_approval: requiresApproval,
      tags,
    };

    try {
      const key = useIdempotency ? idempotencyKey : null;
      await api.createWorkItem(payload, key);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.data?.message || err.message || 'Failed to create work item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Plus className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white">Declare New Operational Work Item</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border-b border-rose-500/20 text-xs text-rose-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Title *</label>
            <input
              type="text"
              required
              placeholder="e.g., API Latency Spike, Wire Transfer Verification, GDPR Erasure..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Description *</label>
            <textarea
              required
              rows={3}
              placeholder="Provide background, impact, initial observations, and why this requires action..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="CUSTOMER_ISSUE">Customer Issue</option>
                <option value="ENGINEERING_INCIDENT">Engineering Incident</option>
                <option value="PAYMENT_INVESTIGATION">Payment Investigation (Sensitive)</option>
                <option value="COMPLIANCE_REQUEST">Compliance Request (Sensitive)</option>
                <option value="OPERATIONAL_APPROVAL">Operational Approval</option>
                <option value="SECURITY_ALERT">Security Alert</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="P0_CRITICAL">P0 - Critical (Emergency Escalation)</option>
                <option value="P1_HIGH">P1 - High Priority</option>
                <option value="P2_MEDIUM">P2 - Medium Priority</option>
                <option value="P3_LOW">P3 - Low Priority</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Assign Responsible Team</label>
              <select
                value={assignedTeam}
                onChange={(e) => setAssignedTeam(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Leave Unassigned (Triage)</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.is_sensitive ? '🔒' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Tags (comma separated)</label>
              <input
                type="text"
                placeholder="incident, checkout, p0"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="pt-1 flex items-center space-x-2">
            <input
              type="checkbox"
              id="requires_approval"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
            />
            <label htmlFor="requires_approval" className="text-slate-300 font-medium">
              Requires managerial sign-off before entering active progress
            </label>
          </div>

          {/* Idempotency Protection Box */}
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center space-x-1.5 text-slate-300 font-semibold">
                <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                <span>Duplicate Submission Protection (Idempotency)</span>
              </span>
              <input
                type="checkbox"
                checked={useIdempotency}
                onChange={(e) => setUseIdempotency(e.target.checked)}
                className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-400 bg-slate-900"
              />
            </div>
            {useIdempotency && (
              <div className="font-mono text-[10px] text-slate-500 truncate">
                Key: <span className="text-cyan-400">{idempotencyKey}</span>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center space-x-2 disabled:opacity-50 shadow-lg shadow-indigo-600/25"
            >
              <span>{loading ? 'Submitting...' : 'Create Work Item'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
