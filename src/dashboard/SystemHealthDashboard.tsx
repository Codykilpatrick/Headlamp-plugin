import React from 'react';
import { K8s } from '@kinvolk/headlamp-plugin/lib';
import { useHistory, useParams } from 'react-router-dom';
import { getSettings } from '../settingsStore';

// ── Types ────────────────────────────────────────────────────────────────────

type SystemStatus = 'Running' | 'Degraded' | 'Offline' | 'Unknown';

interface SystemSummary {
  systemName: string;
  namespace: string;
  status: SystemStatus;
  readyCount: number;
  totalCount: number;
  deployments: any[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function deploymentStatus(dep: any): SystemStatus {
  const spec = dep?.spec?.replicas ?? 1;
  const ready = dep?.status?.readyReplicas ?? 0;
  if (spec === 0) return 'Unknown';
  if (ready === spec) return 'Running';
  if (ready > 0) return 'Degraded';
  return 'Offline';
}

function worstStatus(statuses: SystemStatus[]): SystemStatus {
  if (statuses.includes('Offline')) return 'Offline';
  if (statuses.includes('Degraded')) return 'Degraded';
  if (statuses.includes('Unknown')) return 'Unknown';
  return 'Running';
}

const STATUS_COLOR: Record<SystemStatus, string> = {
  Running: '#2e7d32',
  Degraded: '#e65100',
  Offline: '#c62828',
  Unknown: '#757575',
};

const STATUS_BG: Record<SystemStatus, string> = {
  Running: '#e8f5e9',
  Degraded: '#fff3e0',
  Offline: '#ffebee',
  Unknown: '#f5f5f5',
};

// ── System Health Dashboard (landing page) ───────────────────────────────────

export function SystemHealthDashboard() {
  const [deployments, deployError] = K8s.ResourceClasses.Deployment.useList();
  const history = useHistory();
  const settings = getSettings();

  if (deployError) {
    return (
      <div style={{ padding: '24px', color: '#c62828' }}>
        <strong>Could not load deployments:</strong> {String(deployError)}
      </div>
    );
  }

  if (!deployments) {
    return <div style={{ padding: '24px', color: '#666' }}>Loading systems…</div>;
  }

  // Build namespace → system name map from settings
  const nsMap: Record<string, string> = {};
  for (const m of settings.namespaceMappings) {
    if (m.namespace) nsMap[m.namespace] = m.systemName || m.namespace;
  }

  // Group deployments by namespace
  const grouped: Record<string, any[]> = {};
  for (const dep of deployments) {
    const ns: string = dep?.metadata?.namespace ?? 'default';
    if (!grouped[ns]) grouped[ns] = [];
    grouped[ns].push(dep);
  }

  // Build per-system summaries
  const systems: SystemSummary[] = Object.entries(grouped).map(([ns, deps]) => {
    const statuses = deps.map(deploymentStatus);
    const readyCount = deps.reduce((sum, d) => sum + (d?.status?.readyReplicas ?? 0), 0);
    const totalCount = deps.reduce((sum, d) => sum + (d?.spec?.replicas ?? 1), 0);
    return {
      systemName: nsMap[ns] || ns,
      namespace: ns,
      status: worstStatus(statuses),
      readyCount,
      totalCount,
      deployments: deps,
    };
  });

  // Sort: Offline first, then Degraded, then Running
  const ORDER: Record<SystemStatus, number> = { Offline: 0, Degraded: 1, Unknown: 2, Running: 3 };
  systems.sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: '8px' }}>System Health</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Live status of all onboard systems. Click a card to see details.
      </p>

      {systems.length === 0 && (
        <div style={{ color: '#888' }}>No deployments found. Configure namespace mappings in plugin settings.</div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '16px',
        }}
      >
        {systems.map(sys => (
          <div
            key={sys.namespace}
            onClick={() => history.push(`/sailor-view/dashboard/${encodeURIComponent(sys.systemName)}`)}
            style={{
              border: `2px solid ${STATUS_COLOR[sys.status]}`,
              borderRadius: '10px',
              padding: '20px',
              cursor: 'pointer',
              backgroundColor: STATUS_BG[sys.status],
              transition: 'box-shadow 0.15s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.18)')}
            onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: 700, fontSize: '18px' }}>{sys.systemName}</span>
              <StatusBadge status={sys.status} />
            </div>
            <div style={{ fontSize: '13px', color: '#555' }}>
              {sys.readyCount} / {sys.totalCount} components ready
            </div>
            <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
              {sys.deployments.length} deployment{sys.deployments.length !== 1 ? 's' : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── System Drill-Down ────────────────────────────────────────────────────────

export function SystemDrillDown() {
  const { systemName } = useParams<{ systemName: string }>();
  const decodedName = decodeURIComponent(systemName);
  const [deployments, deployError] = K8s.ResourceClasses.Deployment.useList();
  const history = useHistory();
  const settings = getSettings();

  if (deployError) {
    return <div style={{ padding: '24px', color: '#c62828' }}>Error: {String(deployError)}</div>;
  }
  if (!deployments) {
    return <div style={{ padding: '24px', color: '#666' }}>Loading…</div>;
  }

  const nsMap: Record<string, string> = {};
  for (const m of settings.namespaceMappings) {
    if (m.namespace) nsMap[m.namespace] = m.systemName || m.namespace;
  }

  // Find deployments for this system name
  const systemDeps = deployments.filter(dep => {
    const ns: string = dep?.metadata?.namespace ?? 'default';
    const mapped = nsMap[ns] || ns;
    return mapped === decodedName;
  });

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <button
        onClick={() => history.push('/sailor-view/dashboard')}
        style={{ marginBottom: '20px', background: 'none', border: 'none', cursor: 'pointer', color: '#1565c0', fontSize: '14px' }}
      >
        ← Back to System Health
      </button>

      <h1 style={{ marginBottom: '4px' }}>{decodedName}</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        {systemDeps.length} deployment{systemDeps.length !== 1 ? 's' : ''}
      </p>

      {systemDeps.length === 0 && (
        <div style={{ color: '#888' }}>No deployments found for this system.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {systemDeps.map(dep => {
          const name: string = dep?.metadata?.name ?? 'unknown';
          const ns: string = dep?.metadata?.namespace ?? 'default';
          const status = deploymentStatus(dep);
          const ready = dep?.status?.readyReplicas ?? 0;
          const desired = dep?.spec?.replicas ?? 1;
          return (
            <div
              key={name}
              style={{
                border: `1px solid ${STATUS_COLOR[status]}`,
                borderRadius: '8px',
                padding: '16px',
                backgroundColor: STATUS_BG[status],
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{name}</div>
                <div style={{ fontSize: '12px', color: '#777', marginTop: '2px' }}>{ns}</div>
                <div style={{ fontSize: '13px', color: '#555', marginTop: '6px' }}>
                  {ready} / {desired} replicas ready
                </div>
              </div>
              <StatusBadge status={status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SystemStatus }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 12px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 700,
        color: '#fff',
        backgroundColor: STATUS_COLOR[status],
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
      }}
    >
      {status}
    </span>
  );
}
