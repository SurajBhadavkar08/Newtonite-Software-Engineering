import React, { useState, useEffect, useCallback } from 'react';
import { PersonaProvider, usePersona } from './context/PersonaContext';
import { api, generateIdempotencyKey } from './api/client';
import Navbar from './components/Navbar';
import MetricsOverview from './components/MetricsOverview';
import WorkItemFilters from './components/WorkItemFilters';
import WorkItemList from './components/WorkItemList';
import WorkItemDetailModal from './components/WorkItemDetailModal';
import CreateWorkItemModal from './components/CreateWorkItemModal';
import ConcurrencySimulatorModal from './components/ConcurrencySimulatorModal';
import OutboxDrawer from './components/OutboxDrawer';
import { ShieldCheck, Info } from 'lucide-react';

function Dashboard() {
  const { activePersona } = usePersona();

  // Data states
  const [workItems, setWorkItems] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [teams, setTeams] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [outboxCount, setOutboxCount] = useState(0);

  // Filter states
  const [scope, setScope] = useState('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [teamId, setTeamId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals & Drawers
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [outboxOpen, setOutboxOpen] = useState(false);

  // Load initial teams
  useEffect(() => {
    api.getTeams().then(setTeams).catch(console.error);
  }, []);

  // Fetch metrics & items whenever filters or persona changes
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, metricsRes, outboxRes] = await Promise.all([
        api.getWorkItems({
          scope,
          search,
          category,
          priority,
          assigned_team: teamId,
          page: currentPage,
        }),
        api.getMetrics().catch(() => null),
        api.getOutboxEvents().catch(() => []),
      ]);

      setWorkItems(itemsRes.results || []);
      setPagination({
        count: itemsRes.count,
        total_pages: itemsRes.total_pages,
        current_page: itemsRes.current_page,
        next: itemsRes.next,
        previous: itemsRes.previous,
      });

      if (metricsRes) setMetrics(metricsRes);
      if (outboxRes) {
        const pendingCount = outboxRes.filter(e => e.status === 'PENDING').length;
        setOutboxCount(pendingCount);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [scope, search, category, priority, teamId, currentPage, activePersona]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClaim = async (item) => {
    try {
      const key = generateIdempotencyKey('claim');
      await api.claimWorkItem(item.id, key);
      fetchData();
    } catch (err) {
      alert(err.data?.message || err.message);
    }
  };

  const handleResetFilters = () => {
    setScope('all');
    setSearch('');
    setCategory('');
    setPriority('');
    setTeamId('');
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar
        onOpenCreate={() => setCreateModalOpen(true)}
        onOpenSimulator={() => setSimulatorOpen(true)}
        onOpenOutbox={() => setOutboxOpen(true)}
        outboxCount={outboxCount}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Architecture & RBAC Banner */}
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-500/30 flex items-start sm:items-center justify-between text-xs text-slate-300 shadow-lg">
          <div className="flex items-start sm:items-center space-x-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-white text-sm">
                Active Persona: <span className="text-indigo-400 font-bold">{activePersona?.first_name} {activePersona?.last_name}</span>{' '}
                <span className="font-mono text-slate-400">({activePersona?.teams?.[0]?.team_name || 'All Operations'} · {activePersona?.teams?.[0]?.role || 'Observer'})</span>
              </div>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Backend enforces resource-level permissions (sensitive Compliance/Payment items require team membership), optimistic concurrency (OCC version checking), and atomic claim locking. Use the persona switcher above to test role behaviors.
              </p>
            </div>
          </div>
        </div>

        {/* High-level Operational Metrics Cards */}
        <MetricsOverview
          metrics={metrics}
          activeFilter={scope}
          onSelectFilter={(filterId) => {
            setScope(filterId);
            setCurrentPage(1);
          }}
        />

        {/* Filter Toolbar */}
        <WorkItemFilters
          scope={scope}
          onScopeChange={(newScope) => { setScope(newScope); setCurrentPage(1); }}
          search={search}
          onSearchChange={(v) => { setSearch(v); setCurrentPage(1); }}
          category={category}
          onCategoryChange={(v) => { setCategory(v); setCurrentPage(1); }}
          priority={priority}
          onPriorityChange={(v) => { setPriority(v); setCurrentPage(1); }}
          teams={teams}
          teamId={teamId}
          onTeamIdChange={(v) => { setTeamId(v); setCurrentPage(1); }}
          onReset={handleResetFilters}
        />

        {/* Work Item Data Table */}
        <WorkItemList
          workItems={workItems}
          pagination={pagination}
          onPageChange={setCurrentPage}
          onSelectItem={(item) => setSelectedItemId(item.id)}
          onClaimItem={handleClaim}
          loading={loading}
        />
      </main>

      {/* Item Detail & Transition Modal */}
      {selectedItemId && (
        <WorkItemDetailModal
          itemId={selectedItemId}
          onClose={() => setSelectedItemId(null)}
          onRefreshList={fetchData}
        />
      )}

      {/* Create Modal */}
      <CreateWorkItemModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={fetchData}
        teams={teams}
      />

      {/* Concurrency Laboratory Modal */}
      <ConcurrencySimulatorModal
        isOpen={simulatorOpen}
        onClose={() => setSimulatorOpen(false)}
        onRefreshList={fetchData}
      />

      {/* Asynchronous Outbox Drawer */}
      <OutboxDrawer
        isOpen={outboxOpen}
        onClose={() => setOutboxOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <PersonaProvider>
      <Dashboard />
    </PersonaProvider>
  );
}
