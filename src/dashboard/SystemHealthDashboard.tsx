import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import { K8s, ApiProxy } from '@kinvolk/headlamp-plugin/lib';
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
  /** Deployments and StatefulSets (same replica / readyReplicas shape). */
  workloads: any[];
  pvcStatus: SystemStatus | null;
  restartCount: number;
  warningEventCount: number;
  /** Restart-related event counts bucketed into the last 6 hours, oldest→newest. */
  restartSparkline: number[];
  isRestarting: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Deployment or StatefulSet (and similar workloads with spec.replicas / status.readyReplicas). */
function replicaWorkloadStatus(w: any): SystemStatus {
  const spec = w?.spec?.replicas ?? 1;
  const ready = w?.status?.readyReplicas ?? 0;
  if (spec === 0) return 'Unknown';
  if (ready === spec) return 'Running';
  if (ready > 0) return 'Degraded';
  return 'Offline';
}

/** True when a rolling update / restart is actively in progress. */
function isRollingOut(w: any): boolean {
  const desired = w?.spec?.replicas ?? 1;
  if (desired === 0) return false;
  // updatedReplicas < desired means not all pods are on the new template yet
  const updated = w?.status?.updatedReplicas ?? desired;
  if (updated < desired) return true;
  // Deployment-specific: Progressing condition with ReplicaSetUpdated reason
  if (w?.kind === 'Deployment') {
    const progressing = (w?.status?.conditions ?? []).find((c: any) => c.type === 'Progressing');
    if (progressing?.status === 'True' && progressing?.reason === 'ReplicaSetUpdated') return true;
  }
  return false;
}

function healthHiddenNamespaceSet(hidden: string[]): Set<string> {
  return new Set(hidden.map(n => n.trim().toLowerCase()).filter(Boolean));
}

function isNamespaceHiddenFromHealth(ns: string, hidden: Set<string>): boolean {
  return hidden.has((ns ?? '').trim().toLowerCase());
}

function groupWorkloadsByNamespace(deployments: any[] | null, statefulSets: any[] | null): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};
  for (const dep of deployments || []) {
    const ns: string = dep?.metadata?.namespace ?? 'default';
    if (!grouped[ns]) grouped[ns] = [];
    grouped[ns].push(dep);
  }
  for (const sts of statefulSets || []) {
    const ns: string = sts?.metadata?.namespace ?? 'default';
    if (!grouped[ns]) grouped[ns] = [];
    grouped[ns].push(sts);
  }
  return grouped;
}

function worstStatus(statuses: SystemStatus[]): SystemStatus {
  if (statuses.includes('Offline')) return 'Offline';
  if (statuses.includes('Degraded')) return 'Degraded';
  if (statuses.includes('Unknown')) return 'Unknown';
  return 'Running';
}

function pvcPhaseStatus(phase: string): SystemStatus {
  if (phase === 'Bound') return 'Running';
  if (phase === 'Pending') return 'Degraded';
  return 'Offline';
}

function workloadKindCounts(workloads: any[]): { deployment: number; statefulSet: number } {
  let deployment = 0;
  let statefulSet = 0;
  for (const w of workloads) {
    if (w?.kind === 'StatefulSet') statefulSet++;
    else deployment++;
  }
  return { deployment, statefulSet };
}

/** Sailor-facing line, e.g. "2 Deployments, 1 StatefulSet". */
function formatKindSummary(c: { deployment: number; statefulSet: number }): string {
  const parts: string[] = [];
  if (c.deployment > 0) parts.push(`${c.deployment} Deployment${c.deployment !== 1 ? 's' : ''}`);
  if (c.statefulSet > 0) parts.push(`${c.statefulSet} StatefulSet${c.statefulSet !== 1 ? 's' : ''}`);
  return parts.length ? parts.join(', ') : 'No workloads';
}

function workloadNamePreview(workloads: any[], max = 3): string {
  const names = workloads.map(w => w?.metadata?.name).filter(Boolean) as string[];
  if (names.length === 0) return '';
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max} more`;
}

/** Short age from metadata.creationTimestamp (kubectl-style shorthand). */
function formatResourceAge(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 365) return `${d}d`;
  const y = Math.floor(d / 365);
  return `${y}y+`;
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
    return [...header, 'No systems with workloads in this cluster.'].join('\n');
  }
  const lines = systems.map(s => {
    const label = STATUS_LABEL[s.status];
    const nsNote = s.systemName !== s.namespace ? ` [namespace: ${s.namespace}]` : '';
    const kinds = formatKindSummary(workloadKindCounts(s.workloads));
    const preview = workloadNamePreview(s.workloads);
    const namesNote = preview ? ` — ${preview}` : '';
    return `- ${s.systemName}${nsNote}: ${label} (${s.readyCount}/${s.totalCount} ready) — ${kinds}${namesNote}`;
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
  const [statefulSets, stsError] = K8s.ResourceClasses.StatefulSet.useList();
  const [pvcs] = K8s.ResourceClasses.PersistentVolumeClaim.useList();
  const [nodes] = K8s.ResourceClasses.Node.useList();
  const [pods] = K8s.ResourceClasses.Pod.useList();
  const EventClass = (K8s.event as any).default;
  const [events] = EventClass.useList();
  const history = useHistory();
  const location = useLocation();
  const settings = getSettings();
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const loadError = deployError || stsError;
  if (loadError) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
        <Typography color="error" component="span" fontWeight={600}>
          Could not load workloads:
        </Typography>{' '}
        <Typography color="error" component="span" variant="body2">
          {String(loadError)}
        </Typography>
      </Box>
    );
  }

  if (deployments == null || statefulSets == null) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
        <CircularProgress size={22} thickness={5} aria-hidden />
        <Typography color="text.secondary">Loading systems…</Typography>
      </Box>
    );
  }

  const nsMap: Record<string, string> = {};
  for (const m of settings.namespaceMappings) {
    if (m.namespace) nsMap[m.namespace] = m.systemName || m.namespace;
  }

  // ── Per-namespace derived data ───────────────────────────────────────────────

  // PVC worst status per namespace
  const pvcStatusByNs: Record<string, SystemStatus> = {};
  for (const pvc of pvcs ?? []) {
    const ns: string = pvc?.metadata?.namespace ?? 'default';
    const s = pvcPhaseStatus(pvc?.status?.phase ?? 'Unknown');
    pvcStatusByNs[ns] = worstStatus([pvcStatusByNs[ns] ?? 'Running', s]);
  }

  // Total restart count per namespace (sum all container restarts across pods)
  const restartsByNs: Record<string, number> = {};
  for (const pod of pods ?? []) {
    const ns: string = pod?.metadata?.namespace ?? 'default';
    const containerStatuses: any[] = pod?.status?.containerStatuses ?? [];
    const restarts = containerStatuses.reduce((s: number, cs: any) => s + (cs?.restartCount ?? 0), 0);
    restartsByNs[ns] = (restartsByNs[ns] ?? 0) + restarts;
  }

  // Warning event count + restart sparkline per namespace
  const warningsByNs: Record<string, number> = {};
  const RESTART_REASONS = new Set(['BackOff', 'CrashLoopBackOff', 'OOMKilling', 'Killing']);
  const SPARKLINE_HOURS = 6;
  const nowMs = Date.now();
  // sparklineBucketsByNs[ns] = array of 6 counts, index 0 = oldest hour
  const sparklineBucketsByNs: Record<string, number[]> = {};
  for (const ev of events ?? []) {
    if (ev?.type !== 'Warning') continue;
    const ns: string = ev?.involvedObject?.namespace ?? ev?.metadata?.namespace ?? 'default';
    warningsByNs[ns] = (warningsByNs[ns] ?? 0) + 1;
    if (RESTART_REASONS.has(ev?.reason)) {
      const ts = new Date(ev?.lastTimestamp ?? ev?.metadata?.creationTimestamp ?? 0).getTime();
      const hoursAgo = (nowMs - ts) / 3_600_000;
      if (hoursAgo >= 0 && hoursAgo < SPARKLINE_HOURS) {
        const bucket = SPARKLINE_HOURS - 1 - Math.floor(hoursAgo); // 0=oldest, 5=newest
        if (!sparklineBucketsByNs[ns]) sparklineBucketsByNs[ns] = new Array(SPARKLINE_HOURS).fill(0);
        sparklineBucketsByNs[ns][bucket] += ev?.count ?? 1;
      }
    }
  }

  // ── Node health ──────────────────────────────────────────────────────────────
  const nodeList = nodes ?? [];
  const nodeTotal = nodeList.length;

  const grouped = groupWorkloadsByNamespace(deployments, statefulSets);
  const namespacesWithWorkloads = Object.keys(grouped).length;
  const hiddenNs = healthHiddenNamespaceSet(settings.systemHealthHiddenNamespaces);

  const systems: SystemSummary[] = Object.entries(grouped)
    .filter(([ns]) => !isNamespaceHiddenFromHealth(ns, hiddenNs))
    .map(([ns, workloads]) => {
      const statuses = workloads.map(replicaWorkloadStatus);
      const pvcStatus = pvcStatusByNs[ns] ?? null;
      const allStatuses: SystemStatus[] = [...statuses, ...(pvcStatus ? [pvcStatus] : [])];
      const readyCount = workloads.reduce((sum, w) => sum + (w?.status?.readyReplicas ?? 0), 0);
      const totalCount = workloads.reduce((sum, w) => sum + (w?.spec?.replicas ?? 1), 0);
      return {
        systemName: nsMap[ns] || ns,
        namespace: ns,
        status: worstStatus(allStatuses),
        readyCount,
        totalCount,
        workloads,
        pvcStatus,
        restartCount: restartsByNs[ns] ?? 0,
        warningEventCount: warningsByNs[ns] ?? 0,
        restartSparkline: sparklineBucketsByNs[ns] ?? new Array(SPARKLINE_HOURS).fill(0),
        isRestarting: workloads.some(isRollingOut),
      };
    });

  const ORDER: Record<SystemStatus, number> = { Offline: 0, Degraded: 1, Unknown: 2, Running: 3 };
  systems.sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  const { total, allGood, needsAttention } = summarizeSystems(systems);
  const allVisibleHidden =
    namespacesWithWorkloads > 0 && systems.length === 0;
  const clusterWorkloadCount = systems.reduce((sum, s) => sum + s.workloads.length, 0);
  const clusterReady = systems.reduce((sum, s) => sum + s.readyCount, 0);
  const clusterDesired = systems.reduce((sum, s) => sum + s.totalCount, 0);

  async function handleCopySummary() {
    const text = buildHealthSummaryText(systems);
    const ok = await copyTextToClipboard(text);
    setCopyFeedback(ok ? 'Copied — you can paste this into a log or message.' : 'Could not copy. Select and copy manually if needed.');
    window.setTimeout(() => setCopyFeedback(null), 4000);
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          mb: 1,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            System Health
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 600, mb: 1.5 }}>
            One card per namespace that has a Deployment or StatefulSet. Friendly names come from Sailor View
            settings; switch Sailor / Admin from the top bar.
          </Typography>
          {systems.length > 0 && (
            <Stack spacing={1} sx={{ mt: 0.5 }}>
              <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
                <Chip label={`${total} ${total === 1 ? 'system' : 'systems'}`} size="small" variant="outlined" />
                <Chip label={`${allGood} all good`} size="small" color="success" variant="outlined" />
                {needsAttention > 0 && (
                  <Chip
                    label={`${needsAttention} ${needsAttention === 1 ? 'needs' : 'need'} attention`}
                    size="small"
                    color="warning"
                    variant="outlined"
                  />
                )}
                {pvcs != null && pvcs.length > 0 && (() => {
                  const bad = pvcs.filter(p => p?.status?.phase !== 'Bound').length;
                  return bad > 0
                    ? <Chip label={`${bad} storage ${bad === 1 ? 'issue' : 'issues'}`} size="small" color="warning" variant="outlined" />
                    : <Chip label={`${pvcs.length} storage volumes healthy`} size="small" color="success" variant="outlined" />;
                })()}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 640 }}>
                Cluster-wide: {clusterWorkloadCount} workload{clusterWorkloadCount !== 1 ? 's' : ''} ·{' '}
                {clusterReady} / {clusterDesired} components ready (Deployments and StatefulSets in visible
                namespaces).
              </Typography>
            </Stack>
          )}
        </Box>
        <Button variant="outlined" size="medium" onClick={() => handleCopySummary()} sx={{ flexShrink: 0, mt: 0.5 }}>
          Copy summary
        </Button>
      </Box>

      {copyFeedback && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }} role="status">
          {copyFeedback}
        </Typography>
      )}

      {systems.length === 0 && (
        <Paper
          variant="outlined"
          sx={{
            mt: 3,
            p: 2.5,
            maxWidth: 640,
            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.06 : 0.03),
            borderColor: 'divider',
          }}
        >
          <Typography variant="subtitle1" fontWeight={600} color="text.primary" gutterBottom>
            {allVisibleHidden ? 'Workloads are only in hidden namespaces' : 'No systems to show yet'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: allVisibleHidden ? 1.5 : 0 }}>
            {allVisibleHidden ? (
              <>
                Every namespace that has a Deployment or StatefulSet is listed under{' '}
                <strong>System Health — Hidden Namespaces</strong> in Settings → Plugins → Sailor View. Remove one
                from that list to see it here, or deploy workloads in another namespace.
              </>
            ) : (
              <>
                There are no Deployments or StatefulSets in this cluster (or Headlamp cannot list them). Deploy an app
                to see a card here. Use Settings → Plugins → Sailor View to rename namespaces or adjust hidden
                namespaces.
              </>
            )}
          </Typography>
        </Paper>
      )}

      {nodeTotal > 0 && <NodeHealthPanel nodes={nodeList} />}

      {systems.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 3, mb: 1.5 }}>
          <Typography variant="h6" fontWeight={700} color="text.primary">
            Systems
          </Typography>
          <Divider sx={{ flex: 1 }} />
        </Box>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))',
          gap: 2,
          mt: systems.length === 0 ? 2 : 0,
        }}
      >
        {systems.map(sys => {
          const drillUrl = withClusterPrefix(
            `/sailor-view/dashboard/${encodeURIComponent(sys.systemName)}`,
            location.pathname
          );
          const parts = sys.workloads?.length ?? 0;
          const kindSummary = formatKindSummary(workloadKindCounts(sys.workloads));
          const namesPreview = workloadNamePreview(sys.workloads);
          const label = `${sys.systemName}, ${STATUS_LABEL[sys.status]}, ${sys.readyCount} of ${sys.totalCount} components ready, ${kindSummary}, open workload list`;
          return (
            <Box
              key={sys.namespace}
              onClick={() => history.push(drillUrl)}
              role="button"
              tabIndex={0}
              aria-label={label}
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
                transition: theme.transitions.create(['box-shadow', 'transform'], { duration: 150 }),
                '&:hover': { boxShadow: theme.shadows[4], transform: 'translateY(-1px)' },
                '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1.25 }}>
                <Typography variant="h6" component="div" color="text.primary" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                  {sys.systemName}
                </Typography>
                <StatusBadge status={sys.status} />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                {sys.readyCount} / {sys.totalCount} components ready
              </Typography>
              {sys.systemName !== sys.namespace && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  Kubernetes namespace: {sys.namespace}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                {kindSummary}
              </Typography>
              {namesPreview && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                  {namesPreview}
                </Typography>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
                <Typography variant="caption" color="text.secondary">
                  {parts} workload{parts !== 1 ? 's' : ''} · View list
                </Typography>
                {sys.isRestarting && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box
                      sx={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        bgcolor: 'info.main',
                        '@keyframes pulse': {
                          '0%, 100%': { opacity: 1 },
                          '50%': { opacity: 0.25 },
                        },
                        animation: 'pulse 1.2s ease-in-out infinite',
                      }}
                    />
                    <Typography variant="caption" color="info.main" fontWeight={600}>
                      Restarting…
                    </Typography>
                  </Box>
                )}
              </Box>
              {(sys.restartCount > 0 || sys.warningEventCount > 0) && (
                <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap', alignItems: 'center' }} useFlexGap>
                  {sys.restartCount > 0 && (
                    <Chip
                      label={`${sys.restartCount} restart${sys.restartCount !== 1 ? 's' : ''}`}
                      size="small"
                      color="warning"
                      sx={{ fontWeight: 600, fontSize: '0.7rem', height: 20 }}
                    />
                  )}
                  {sys.warningEventCount > 0 && (
                    <Chip
                      label={`${sys.warningEventCount} warning${sys.warningEventCount !== 1 ? 's' : ''}`}
                      size="small"
                      color="error"
                      variant="outlined"
                      sx={{ fontWeight: 600, fontSize: '0.7rem', height: 20 }}
                    />
                  )}
                  {sys.restartSparkline.some(v => v > 0) && (
                    <RestartSparkline
                      buckets={sys.restartSparkline}
                      color={theme.palette.warning.main}
                    />
                  )}
                </Stack>
              )}
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
  const [statefulSets, stsError] = K8s.ResourceClasses.StatefulSet.useList();
  const [pvcs, pvcError] = K8s.ResourceClasses.PersistentVolumeClaim.useList();
  const DrillEventClass = (K8s.event as any).default;
  const [allEvents] = DrillEventClass.useList();
  const history = useHistory();
  const location = useLocation();
  const settings = getSettings();

  const loadError = deployError || stsError;
  if (loadError) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
        <Typography color="error">Error: {String(loadError)}</Typography>
      </Box>
    );
  }
  if (deployments == null || statefulSets == null) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
        <CircularProgress size={22} thickness={5} aria-hidden />
        <Typography color="text.secondary">Loading…</Typography>
      </Box>
    );
  }

  const nsMap: Record<string, string> = {};
  for (const m of settings.namespaceMappings) {
    if (m.namespace) nsMap[m.namespace] = m.systemName || m.namespace;
  }

  const matchesSystem = (ns: string) => (nsMap[ns] || ns) === decodedName;

  const hiddenNs = healthHiddenNamespaceSet(settings.systemHealthHiddenNamespaces);
  const rawSystemWorkloads = [
    ...deployments.filter(dep => matchesSystem(dep?.metadata?.namespace ?? 'default')),
    ...statefulSets.filter(sts => matchesSystem(sts?.metadata?.namespace ?? 'default')),
  ];
  const systemWorkloads = rawSystemWorkloads
    .filter(w => !isNamespaceHiddenFromHealth(w?.metadata?.namespace ?? 'default', hiddenNs))
    .sort((a, b) => (a?.metadata?.name ?? '').localeCompare(b?.metadata?.name ?? ''));
  const workloadsOnlyHidden = rawSystemWorkloads.length > 0 && systemWorkloads.length === 0;
  const uniqueNs = [
    ...new Set(systemWorkloads.map(w => w?.metadata?.namespace).filter(Boolean) as string[]),
  ].sort();
  const aggReady = systemWorkloads.reduce((s, w) => s + (w?.status?.readyReplicas ?? 0), 0);
  const aggDesired = systemWorkloads.reduce((s, w) => s + (w?.spec?.replicas ?? 1), 0);

  const systemPVCs = (pvcs ?? [])
    .filter(pvc => !isNamespaceHiddenFromHealth(pvc?.metadata?.namespace ?? 'default', hiddenNs))
    .filter(pvc => matchesSystem(pvc?.metadata?.namespace ?? 'default'))
    .sort((a, b) => (a?.metadata?.name ?? '').localeCompare(b?.metadata?.name ?? ''));

  const systemWarnings = (allEvents ?? [])
    .filter((ev: any) => ev?.type === 'Warning')
    .filter((ev: any) => matchesSystem(ev?.involvedObject?.namespace ?? ev?.metadata?.namespace ?? ''))
    .sort((a: any, b: any) => {
      const ta = new Date(a?.lastTimestamp ?? a?.metadata?.creationTimestamp ?? 0).getTime();
      const tb = new Date(b?.lastTimestamp ?? b?.metadata?.creationTimestamp ?? 0).getTime();
      return tb - ta;
    })
    .slice(0, 10);

  const backUrl = withClusterPrefix('/sailor-view/dashboard', location.pathname);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Button variant="text" size="small" onClick={() => history.push(backUrl)} sx={{ mb: 2.5, px: 0 }}>
        ← Back to System Health
      </Button>

      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
        {decodedName}
      </Typography>
      {systemWorkloads.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {workloadsOnlyHidden
            ? 'Workloads for this system are in a namespace hidden from System Health.'
            : 'No workloads in this system.'}
        </Typography>
      ) : (
        <Stack spacing={0.75} sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            {uniqueNs.length === 1 && decodedName !== uniqueNs[0]
              ? `Kubernetes namespace: ${uniqueNs[0]}`
              : uniqueNs.length === 1
                ? `Namespace: ${uniqueNs[0]}`
                : `Kubernetes namespaces: ${uniqueNs.join(', ')}`}
            {' · '}
            {aggReady} / {aggDesired} components ready
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {systemWorkloads.length} workload{systemWorkloads.length !== 1 ? 's' : ''}. Click a workload to view logs
            and take action.
          </Typography>
        </Stack>
      )}

      {systemWorkloads.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {workloadsOnlyHidden
            ? 'Remove that namespace from “System Health — Hidden Namespaces” in Sailor View settings if you need it here.'
            : 'Check the namespace mapping or cluster workloads.'}
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {systemWorkloads.map(w => (
          <WorkloadCard
            key={`${w?.kind}-${w?.metadata?.uid ?? w?.metadata?.name}`}
            workload={w}
            onNavigate={url => history.push(url)}
            currentPathname={location.pathname}
          />
        ))}
      </Box>

      {systemPVCs.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
            Storage
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {systemPVCs.map(pvc => {
              const name: string = pvc?.metadata?.name ?? 'unknown';
              const ns: string = pvc?.metadata?.namespace ?? 'default';
              const phase: string = pvc?.status?.phase ?? 'Unknown';
              const capacity: string = pvc?.status?.capacity?.storage ?? pvc?.spec?.resources?.requests?.storage ?? '—';
              const storageClass: string = pvc?.spec?.storageClassName ?? '—';
              const pvcStatus: SystemStatus =
                phase === 'Bound' ? 'Running' : phase === 'Pending' ? 'Degraded' : phase === 'Lost' ? 'Offline' : 'Unknown';
              const detailUrl = withClusterPrefix(`/storage/persistentvolumeclaims/${ns}/${name}`, location.pathname);
              const needsAttention = pvcStatus === 'Degraded' || pvcStatus === 'Offline';
              return (
                <Box
                  key={pvc?.metadata?.uid ?? name}
                  role="button"
                  tabIndex={0}
                  onClick={() => history.push(detailUrl)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') history.push(detailUrl); }}
                  sx={{
                    border: 1,
                    borderColor: statusBorderColor(theme, pvcStatus),
                    borderRadius: 2,
                    p: 2,
                    bgcolor: statusSurfaceColor(theme, pvcStatus),
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 2,
                    cursor: 'pointer',
                    transition: 'box-shadow 0.15s, transform 0.15s',
                    '&:hover': { boxShadow: 3, transform: 'translateY(-1px)' },
                    '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                  }}
                >
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600} color="text.primary">
                      {name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      PersistentVolumeClaim · {capacity} · {storageClass}
                    </Typography>
                    {needsAttention && (
                      <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: 'block', fontWeight: 600 }}>
                        Needs attention — click to investigate
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    <Chip
                      label={phase}
                      size="small"
                      color={pvcStatus === 'Running' ? 'success' : pvcStatus === 'Degraded' ? 'warning' : pvcStatus === 'Offline' ? 'error' : undefined}
                      sx={{ fontWeight: 600 }}
                    />
                    <Typography component="span" sx={{ fontSize: 12, color: 'text.disabled', lineHeight: 1 }}>›</Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {systemWarnings.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
            Recent Warnings
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {systemWarnings.map((ev: any, i: number) => {
              const reason: string = ev?.reason ?? 'Unknown';
              const message: string = ev?.message ?? '';
              const involvedName: string = ev?.involvedObject?.name ?? '';
              const involvedKind: string = ev?.involvedObject?.kind ?? '';
              const involvedNs: string = ev?.involvedObject?.namespace ?? ev?.metadata?.namespace ?? '';
              const count: number = ev?.count ?? 1;
              const lastSeen: string = formatResourceAge(ev?.lastTimestamp ?? ev?.metadata?.creationTimestamp);
              const kindPath = involvedKind === 'Pod' ? 'pods'
                : involvedKind === 'StatefulSet' ? 'statefulsets'
                : involvedKind === 'ReplicaSet' ? 'replicasets'
                : 'deployments';
              const involvedUrl = involvedName && involvedNs
                ? withClusterPrefix(`/${kindPath}/${involvedNs}/${involvedName}`, location.pathname)
                : null;
              const key = ev?.metadata?.uid ?? `${reason}-${i}`;
              return (
                <Box
                  key={key}
                  role={involvedUrl ? 'button' : undefined}
                  tabIndex={involvedUrl ? 0 : undefined}
                  onClick={involvedUrl ? () => history.push(involvedUrl) : undefined}
                  onKeyDown={involvedUrl ? (e => { if (e.key === 'Enter' || e.key === ' ') history.push(involvedUrl); }) : undefined}
                  sx={{
                    border: 1,
                    borderColor: alpha(theme.palette.warning.main, 0.4),
                    borderRadius: 2,
                    p: 1.5,
                    bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.08 : 0.05),
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 2,
                    ...(involvedUrl ? {
                      cursor: 'pointer',
                      transition: 'box-shadow 0.15s, transform 0.15s',
                      '&:hover': { boxShadow: 3, transform: 'translateY(-1px)' },
                      '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                    } : {}),
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.25 }}>
                      <Chip label={reason} size="small" color="warning" sx={{ fontWeight: 600, fontSize: '0.7rem', height: 20 }} />
                      {involvedName && (
                        <Typography variant="caption" fontWeight={600} color="text.primary">
                          {involvedKind}/{involvedName}
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, wordBreak: 'break-word' }}>
                      {message}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, gap: 0.5 }}>
                    <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
                      {lastSeen ? `${lastSeen} ago` : ''}
                    </Typography>
                    {count > 1 && (
                      <Typography variant="caption" color="text.disabled">
                        ×{count}
                      </Typography>
                    )}
                    {involvedUrl && (
                      <Typography component="span" sx={{ fontSize: 12, color: 'text.disabled', lineHeight: 1 }}>›</Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ── NodeHealthPanel ───────────────────────────────────────────────────────────

function nodeConditionTrue(node: any, type: string): boolean {
  return (node?.status?.conditions ?? []).some((c: any) => c.type === type && c.status === 'True');
}

function NodeCard({ node }: { node: any }) {
  const theme = useTheme();
  const [cordonState, setCordonState] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const name: string = node?.metadata?.name ?? 'unknown';
  const isReady = nodeConditionTrue(node, 'Ready');
  const isCordoned: boolean = node?.spec?.unschedulable === true;
  const memPressure = nodeConditionTrue(node, 'MemoryPressure');
  const diskPressure = nodeConditionTrue(node, 'DiskPressure');
  const pidPressure = nodeConditionTrue(node, 'PIDPressure');

  const pressures: string[] = [
    ...(memPressure ? ['Low memory'] : []),
    ...(diskPressure ? ['Low disk space'] : []),
    ...(pidPressure ? ['High process load'] : []),
  ];

  const dotColor = !isReady
    ? theme.palette.error.main
    : pressures.length > 0 || isCordoned
      ? theme.palette.warning.main
      : theme.palette.success.main;

  async function handleCordon() {
    if (cordonState === 'idle' || cordonState === 'done' || cordonState === 'error') {
      setCordonState('confirm');
      setTimeout(() => setCordonState(s => s === 'confirm' ? 'idle' : s), 4000);
      return;
    }
    if (cordonState === 'confirm') {
      setCordonState('loading');
      try {
        await ApiProxy.patch(`/api/v1/nodes/${name}`, { spec: { unschedulable: !isCordoned } });
        setCordonState('done');
        setTimeout(() => setCordonState('idle'), 3000);
      } catch (e: any) {
        setErrorMsg(e?.message ?? 'Failed');
        setCordonState('error');
        setTimeout(() => setCordonState('idle'), 4000);
      }
    }
  }

  const cordonLabel =
    cordonState === 'confirm' ? 'Confirm?' :
    cordonState === 'loading' ? (isCordoned ? 'Resuming…' : 'Pausing…') :
    cordonState === 'done' ? 'Done ✓' :
    cordonState === 'error' ? 'Failed' :
    isCordoned ? 'Resume machine' : 'Pause machine';

  return (
    <Box
      sx={{
        border: 1,
        borderColor: isCordoned
          ? theme.palette.warning.main
          : !isReady
            ? theme.palette.error.main
            : pressures.length > 0
              ? theme.palette.warning.main
              : theme.palette.success.main,
        borderRadius: 2,
        p: 2,
        bgcolor: alpha(dotColor, theme.palette.mode === 'dark' ? 0.08 : 0.05),
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 2,
      }}
    >
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Box sx={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, bgcolor: dotColor }} />
          <Typography variant="subtitle2" fontWeight={700} color="text.primary">
            {name}
          </Typography>
          {isCordoned && (
            <Chip label="Paused" size="small" color="warning" sx={{ fontWeight: 600, fontSize: '0.7rem', height: 20 }} />
          )}
        </Box>
        <Typography variant="caption" color={isReady ? 'text.secondary' : 'error.main'} display="block">
          {isReady ? 'Ready' : 'Not responding'}
        </Typography>
        {pressures.map(p => (
          <Typography key={p} variant="caption" color="warning.main" display="block">{p}</Typography>
        ))}
        {isCordoned && (
          <Typography variant="caption" color="warning.main" display="block">
            Not accepting new workloads
          </Typography>
        )}
        {cordonState === 'error' && (
          <Typography variant="caption" color="error.main" display="block" sx={{ mt: 0.5 }}>{errorMsg}</Typography>
        )}
      </Box>
      <Button
        size="small"
        variant={cordonState === 'confirm' ? 'contained' : 'outlined'}
        color={cordonState === 'confirm' ? 'warning' : cordonState === 'error' ? 'error' : cordonState === 'done' ? 'success' : 'inherit'}
        disabled={cordonState === 'loading'}
        onClick={handleCordon}
        sx={{ minWidth: 130, fontSize: '0.72rem', flexShrink: 0 }}
      >
        {cordonLabel}
      </Button>
    </Box>
  );
}

function NodeHealthPanel({ nodes }: { nodes: any[] }) {
  const theme = useTheme();
  const total = nodes.length;
  const readyCount = nodes.filter(n => nodeConditionTrue(n, 'Ready')).length;
  const allReady = total > 0 && readyCount === total;

  return (
    <Box sx={{ mt: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
        <Typography variant="h6" fontWeight={700} color="text.primary">
          Machines
        </Typography>
        <Divider sx={{ flex: 1 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: allReady ? theme.palette.success.main : theme.palette.warning.main }} />
          <Typography variant="caption" color="text.secondary" fontWeight={500}>
            {allReady
              ? `${total} ${total === 1 ? 'machine' : 'machines'} · All healthy`
              : `${readyCount} / ${total} ready`}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 1.5 }}>
        {nodes.map(n => <NodeCard key={n?.metadata?.uid ?? n?.metadata?.name} node={n} />)}
      </Box>
    </Box>
  );
}

// ── RestartSparkline ──────────────────────────────────────────────────────────

function RestartSparkline({ buckets, color }: { buckets: number[]; color: string }) {
  const W = 48, H = 20, pad = 2;
  const max = Math.max(...buckets, 1);
  const n = buckets.length;
  const points = buckets.map((v, i) => {
    const x = pad + (i / (n - 1)) * (W - pad * 2);
    const y = H - pad - ((v / max) * (H - pad * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <Box component="span" title={`Restart events last 6h: ${buckets.join(', ')}`}>
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {buckets.map((v, i) => v > 0 ? (
          <circle
            key={i}
            cx={pad + (i / (n - 1)) * (W - pad * 2)}
            cy={H - pad - ((v / max) * (H - pad * 2))}
            r="2"
            fill={color}
          />
        ) : null)}
      </svg>
    </Box>
  );
}

// ── WorkloadCard ─────────────────────────────────────────────────────────────

function WorkloadCard({
  workload: w,
  onNavigate,
  currentPathname,
}: {
  workload: any;
  onNavigate: (url: string) => void;
  currentPathname: string;
}) {
  const theme = useTheme();
  const [restartState, setRestartState] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [restartMsg, setRestartMsg] = useState('');

  const name: string = w?.metadata?.name ?? 'unknown';
  const ns: string = w?.metadata?.namespace ?? 'default';
  const kind: string = w?.kind ?? 'Workload';
  const status = replicaWorkloadStatus(w);
  const ready = w?.status?.readyReplicas ?? 0;
  const desired = w?.spec?.replicas ?? 1;
  const age = formatResourceAge(w?.metadata?.creationTimestamp as string | undefined);
  const kindPath = kind === 'StatefulSet' ? 'statefulsets' : 'deployments';
  const detailUrl = withClusterPrefix(`/${kindPath}/${ns}/${name}`, currentPathname);
  const needsAttention = status === 'Degraded' || status === 'Offline';
  const rollingOut = isRollingOut(w);

  async function handleRestart() {
    if (restartState === 'idle' || restartState === 'done' || restartState === 'error') {
      setRestartState('confirm');
      // Auto-cancel confirm after 4s
      setTimeout(() => setRestartState(s => s === 'confirm' ? 'idle' : s), 4000);
      return;
    }
    if (restartState === 'confirm') {
      setRestartState('loading');
      try {
        const apiGroup = 'apps/v1';
        const path = `/apis/apps/v1/namespaces/${ns}/${kindPath}/${name}`;
        await ApiProxy.patch(path, {
          spec: {
            template: {
              metadata: {
                annotations: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() },
              },
            },
          },
        });
        setRestartState('done');
        setRestartMsg('Restart triggered');
        setTimeout(() => setRestartState('idle'), 3000);
      } catch (e: any) {
        setRestartState('error');
        setRestartMsg(e?.message ?? 'Restart failed');
        setTimeout(() => setRestartState('idle'), 4000);
      }
    }
  }

  const restartLabel =
    restartState === 'confirm' ? 'Confirm?' :
    restartState === 'loading' ? 'Restarting…' :
    restartState === 'done' ? 'Restarted ✓' :
    restartState === 'error' ? 'Failed' :
    'Restart';

  const restartColor: 'warning' | 'error' | 'success' | 'inherit' =
    restartState === 'confirm' ? 'warning' :
    restartState === 'error' ? 'error' :
    restartState === 'done' ? 'success' :
    'inherit';

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(detailUrl)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onNavigate(detailUrl); }}
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
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.15s',
        '&:hover': { boxShadow: 3, transform: 'translateY(-1px)' },
        '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
      }}
    >
      <Box>
        <Typography variant="subtitle1" fontWeight={600} color="text.primary">{name}</Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {kind}{age ? ` · age ${age}` : ''}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {ready} / {desired} ready
        </Typography>
        {needsAttention && (
          <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: 'block', fontWeight: 600 }}>
            Needs attention — click to investigate
          </Typography>
        )}
        {rollingOut && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
            <Box sx={{
              width: 7, height: 7, borderRadius: '50%', bgcolor: 'info.main',
              '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.25 } },
              animation: 'pulse 1.2s ease-in-out infinite',
            }} />
            <Typography variant="caption" color="info.main" fontWeight={600}>Restarting…</Typography>
          </Box>
        )}
        {restartState === 'error' && (
          <Typography variant="caption" color="error.main" sx={{ mt: 0.5, display: 'block' }}>{restartMsg}</Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <Button
          size="small"
          variant={restartState === 'confirm' ? 'contained' : 'outlined'}
          color={restartColor}
          disabled={restartState === 'loading'}
          onClick={e => { e.stopPropagation(); handleRestart(); }}
          onKeyDown={e => e.stopPropagation()}
          sx={{ minWidth: 80, fontSize: '0.72rem' }}
        >
          {restartLabel}
        </Button>
        <StatusBadge status={status} />
        <Typography component="span" sx={{ fontSize: 12, color: 'text.disabled', lineHeight: 1 }}>›</Typography>
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
