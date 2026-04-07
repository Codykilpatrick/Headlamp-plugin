import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import { K8s } from '@kinvolk/headlamp-plugin/lib';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { withClusterPrefix } from '../lib/clusterPaths';
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

/** Short, demo-friendly status labels (chips + clipboard). */
const STATUS_LABEL: Record<SystemStatus, string> = {
  Running: 'All good',
  Degraded: 'Not fully ready',
  Offline: 'Needs attention',
  Unknown: 'Unclear',
};

function summarizeSystems(systems: SystemSummary[]) {
  const total = systems.length;
  const allGood = systems.filter(s => s.status === 'Running').length;
  const needsAttention = total - allGood;
  return { total, allGood, needsAttention };
}

function statusBorderColor(theme: Theme, status: SystemStatus): string {
  switch (status) {
    case 'Running':
      return theme.palette.success.main;
    case 'Degraded':
      return theme.palette.warning.main;
    case 'Offline':
      return theme.palette.error.main;
    default:
      return theme.palette.divider;
  }
}

function statusSurfaceColor(theme: Theme, status: SystemStatus): string {
  const a = theme.palette.mode === 'dark' ? 0.18 : 0.12;
  switch (status) {
    case 'Running':
      return alpha(theme.palette.success.main, a);
    case 'Degraded':
      return alpha(theme.palette.warning.main, a);
    case 'Offline':
      return alpha(theme.palette.error.main, a);
    default:
      return alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.06);
  }
}

function buildHealthSummaryText(systems: SystemSummary[]): string {
  const when = new Date().toISOString();
  const header = ['Sailor View — System Health summary', `Generated: ${when} (UTC)`, ''];
  if (systems.length === 0) {
    return [...header, 'No deployments / systems listed in this cluster.'].join('\n');
  }
  const lines = systems.map(s => {
    const label = STATUS_LABEL[s.status];
    return `- ${s.systemName}: ${label} (${s.readyCount}/${s.totalCount} components ready)`;
  });
  return [...header, ...lines].join('\n');
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// ── System Health Dashboard (landing page) ───────────────────────────────────

export function SystemHealthDashboard() {
  const theme = useTheme();
  const [deployments, deployError] = K8s.ResourceClasses.Deployment.useList();
  const history = useHistory();
  const location = useLocation();
  const settings = getSettings();
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  if (deployError) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error" component="span" fontWeight={600}>
          Could not load deployments:
        </Typography>{' '}
        <Typography color="error" component="span" variant="body2">
          {String(deployError)}
        </Typography>
      </Box>
    );
  }

  if (!deployments) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">Loading systems…</Typography>
      </Box>
    );
  }

  const nsMap: Record<string, string> = {};
  for (const m of settings.namespaceMappings) {
    if (m.namespace) nsMap[m.namespace] = m.systemName || m.namespace;
  }

  const grouped: Record<string, any[]> = {};
  for (const dep of deployments) {
    const ns: string = dep?.metadata?.namespace ?? 'default';
    if (!grouped[ns]) grouped[ns] = [];
    grouped[ns].push(dep);
  }

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

  const ORDER: Record<SystemStatus, number> = { Offline: 0, Degraded: 1, Unknown: 2, Running: 3 };
  systems.sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  const { total, allGood, needsAttention } = summarizeSystems(systems);

  async function handleCopySummary() {
    const text = buildHealthSummaryText(systems);
    const ok = await copyTextToClipboard(text);
    setCopyFeedback(ok ? 'Copied — you can paste this into a log or message.' : 'Could not copy. Select and copy manually if needed.');
    window.setTimeout(() => setCopyFeedback(null), 4000);
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            System Health
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 560, mb: 1.5 }}>
            Each card is a system (namespace names are replaced by the labels you set in Sailor View settings).
          </Typography>
          {systems.length > 0 && (
            <Typography variant="subtitle1" fontWeight={600} color="text.primary">
              {total} {total === 1 ? 'system' : 'systems'}
              {' · '}
              {allGood} all good
              {needsAttention > 0 && (
                <>
                  {' · '}
                  <Box component="span" sx={{ color: 'warning.main' }}>
                    {needsAttention} {needsAttention === 1 ? 'needs' : 'need'} attention
                  </Box>
                </>
              )}
            </Typography>
          )}
        </Box>
        <Button variant="outlined" size="medium" onClick={() => handleCopySummary()} sx={{ flexShrink: 0 }}>
          Copy summary
        </Button>
      </Box>

      {copyFeedback && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }} role="status">
          {copyFeedback}
        </Typography>
      )}

      {systems.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
          Nothing to show yet — add namespace → system name mappings under Settings → Plugins → Sailor View.
        </Typography>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 2,
          mt: 3,
        }}
      >
        {systems.map(sys => {
          const drillUrl = withClusterPrefix(
            `/sailor-view/dashboard/${encodeURIComponent(sys.systemName)}`,
            location.pathname
          );
          return (
            <Box
              key={sys.namespace}
              onClick={() => history.push(drillUrl)}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  history.push(drillUrl);
                }
              }}
              sx={{
                border: 2,
                borderColor: statusBorderColor(theme, sys.status),
                borderRadius: 2,
                p: 2.5,
                cursor: 'pointer',
                bgcolor: statusSurfaceColor(theme, sys.status),
                boxShadow: theme.shadows[1],
                transition: theme.transitions.create('box-shadow', { duration: 150 }),
                '&:hover': { boxShadow: theme.shadows[4] },
                '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                <Typography variant="h5" component="div" color="text.primary" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
                  {sys.systemName}
                </Typography>
                <StatusBadge status={sys.status} />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {sys.readyCount} / {sys.totalCount} ready
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// ── System Drill-Down ────────────────────────────────────────────────────────

export function SystemDrillDown() {
  const theme = useTheme();
  const { systemName } = useParams<{ systemName: string }>();
  const decodedName = decodeURIComponent(systemName);
  const [deployments, deployError] = K8s.ResourceClasses.Deployment.useList();
  const history = useHistory();
  const location = useLocation();
  const settings = getSettings();

  if (deployError) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">Error: {String(deployError)}</Typography>
      </Box>
    );
  }
  if (!deployments) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">Loading…</Typography>
      </Box>
    );
  }

  const nsMap: Record<string, string> = {};
  for (const m of settings.namespaceMappings) {
    if (m.namespace) nsMap[m.namespace] = m.systemName || m.namespace;
  }

  const systemDeps = deployments.filter(dep => {
    const ns: string = dep?.metadata?.namespace ?? 'default';
    const mapped = nsMap[ns] || ns;
    return mapped === decodedName;
  });

  const backUrl = withClusterPrefix('/sailor-view/dashboard', location.pathname);

  return (
    <Box sx={{ p: 3 }}>
      <Button variant="text" size="small" onClick={() => history.push(backUrl)} sx={{ mb: 2.5, px: 0 }}>
        ← Back to System Health
      </Button>

      <Typography variant="h4" component="h1" gutterBottom>
        {decodedName}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {systemDeps.length === 0
          ? 'No workloads in this system.'
          : `${systemDeps.length} part${systemDeps.length !== 1 ? 's' : ''} — open Headlamp from here for logs and actions.`}
      </Typography>

      {systemDeps.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Check the namespace mapping or cluster workloads.
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {systemDeps.map(dep => {
          const name: string = dep?.metadata?.name ?? 'unknown';
          const ns: string = dep?.metadata?.namespace ?? 'default';
          const status = deploymentStatus(dep);
          const ready = dep?.status?.readyReplicas ?? 0;
          const desired = dep?.spec?.replicas ?? 1;
          return (
            <Box
              key={name}
              sx={{
                border: 1,
                borderColor: statusBorderColor(theme, status),
                borderRadius: 2,
                p: 2,
                bgcolor: statusSurfaceColor(theme, status),
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <Box>
                <Typography variant="subtitle1" fontWeight={600} color="text.primary">
                  {name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {ready} / {desired} ready
                </Typography>
              </Box>
              <StatusBadge status={status} />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// ── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SystemStatus }) {
  const theme = useTheme();
  const label = STATUS_LABEL[status];

  if (status === 'Unknown') {
    return (
      <Chip
        label={label}
        size="small"
        sx={{
          fontWeight: 600,
          maxWidth: 220,
          bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08),
          color: 'text.secondary',
          borderColor: theme.palette.divider,
          border: 1,
          '& .MuiChip-label': { whiteSpace: 'normal', textAlign: 'right', lineHeight: 1.25 },
        }}
      />
    );
  }

  const color = status === 'Running' ? 'success' : status === 'Degraded' ? 'warning' : 'error';

  return (
    <Chip
      label={label}
      size="small"
      color={color}
      sx={{
        fontWeight: 600,
        maxWidth: 220,
        '& .MuiChip-label': { whiteSpace: 'normal', textAlign: 'right', lineHeight: 1.25 },
      }}
    />
  );
}
