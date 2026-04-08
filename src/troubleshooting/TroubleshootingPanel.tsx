/**
 * Feature 3 — Guided Troubleshooting Panel
 *
 * registerDetailsViewSection injects a "What's happening?" accordion at the
 * top of any workload detail page (Deployment, Pod, StatefulSet, etc.).
 *
 * It reads status.conditions, restart counts, and derives a plain-language
 * summary + recommended action. Raw YAML is hidden behind an expand toggle.
 */

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import { getSettings } from '../settingsStore';

// ── Types mirroring common K8s status shapes ─────────────────────────────────

interface Condition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

interface ContainerStatus {
  name: string;
  restartCount?: number;
  state?: {
    waiting?: { reason?: string; message?: string };
    terminated?: { reason?: string; exitCode?: number };
    running?: { startedAt?: string };
  };
  ready?: boolean;
}

// ── Analysis helpers ─────────────────────────────────────────────────────────

interface Diagnosis {
  summary: string;
  recommendation: string;
  severity: 'ok' | 'warn' | 'error';
}

function diagnose(resource: any): Diagnosis {
  const kind: string = resource?.kind ?? '';
  const conditions: Condition[] = resource?.status?.conditions ?? [];
  const containerStatuses: ContainerStatus[] = resource?.status?.containerStatuses ?? [];
  const initContainerStatuses: ContainerStatus[] = resource?.status?.initContainerStatuses ?? [];
  const allContainers = [...containerStatuses, ...initContainerStatuses];

  // ── Check for crash loops ──
  const crashLooping = allContainers.filter(
    cs => cs.state?.waiting?.reason === 'CrashLoopBackOff'
  );
  if (crashLooping.length > 0) {
    const names = crashLooping.map(cs => cs.name).join(', ');
    return {
      severity: 'error',
      summary: `Process "${names}" is in a restart loop.`,
      recommendation: 'Check the logs for this process — it is likely failing on startup. A misconfigured setting or missing dependency is the most common cause.',
    };
  }

  // ── Check for image pull errors ──
  const imagePullError = allContainers.find(cs =>
    ['ImagePullBackOff', 'ErrImagePull', 'InvalidImageName'].includes(cs.state?.waiting?.reason ?? '')
  );
  if (imagePullError) {
    return {
      severity: 'error',
      summary: `Cannot load the software image for "${imagePullError.name}".`,
      recommendation: 'The system image cannot be downloaded. Verify network connectivity and that the image name is correct in the deployment configuration.',
    };
  }

  // ── High restart count ──
  const highRestarts = allContainers.find(cs => (cs.restartCount ?? 0) >= 5);
  if (highRestarts) {
    return {
      severity: 'warn',
      summary: `"${highRestarts.name}" has restarted ${highRestarts.restartCount} times.`,
      recommendation: 'This process has been unstable. Review its logs for recurring errors and check that its configuration is correct.',
    };
  }

  // ── OOMKilled ──
  const oomKilled = allContainers.find(cs => cs.state?.terminated?.reason === 'OOMKilled');
  if (oomKilled) {
    return {
      severity: 'error',
      summary: `"${oomKilled.name}" ran out of memory and was stopped.`,
      recommendation: 'This process exceeded its memory limit. Contact your system administrator to increase the memory allocation.',
    };
  }

  // ── Stopped (scaled to 0) ──
  if ((kind === 'Deployment' || kind === 'StatefulSet') && (resource?.spec?.replicas ?? -1) === 0) {
    const prev = resource?.metadata?.annotations?.['sailor-view/previous-replicas'];
    return {
      severity: 'warn',
      summary: `This system has been stopped${prev ? ` (was running ${prev} component${parseInt(prev, 10) !== 1 ? 's' : ''})` : ''}.`,
      recommendation: 'Use the Start button to bring it back online.',
    };
  }

  // ── Deployment-specific conditions ──
  if (kind === 'Deployment') {
    const available = conditions.find(c => c.type === 'Available');
    const progressing = conditions.find(c => c.type === 'Progressing');

    if (available?.status === 'False') {
      return {
        severity: 'error',
        summary: 'This system is not available.',
        recommendation: available.message
          ? `Reason: ${available.message}. Try restarting the deployment or contact your administrator.`
          : 'Try restarting the deployment. If the problem persists, contact your administrator.',
      };
    }

    if (progressing?.status === 'False') {
      return {
        severity: 'error',
        summary: 'This system has stalled during an update.',
        recommendation: progressing.message
          ? `Reason: ${progressing.message}. Check resource limits and node availability.`
          : 'Check that the cluster has enough resources and retry the deployment.',
      };
    }

    if (available?.status === 'True' && progressing?.status === 'True') {
      const readyReplicas = resource?.status?.readyReplicas ?? 0;
      const desiredReplicas = resource?.spec?.replicas ?? 1;
      if (readyReplicas < desiredReplicas) {
        return {
          severity: 'warn',
          summary: `${readyReplicas} of ${desiredReplicas} components are ready.`,
          recommendation: 'The system is partially available. Monitor for a few minutes — if it does not fully recover, check node capacity.',
        };
      }
    }
  }

  // ── Pod-specific ──
  if (kind === 'Pod') {
    const phase: string = resource?.status?.phase ?? '';
    if (phase === 'Pending') {
      return {
        severity: 'warn',
        summary: 'This process is waiting to start.',
        recommendation: 'The system is queued. This is normal during startup. If it stays pending for more than a few minutes, check that nodes have enough resources.',
      };
    }
    if (phase === 'Failed') {
      return {
        severity: 'error',
        summary: 'This process has failed and stopped.',
        recommendation: 'Check the logs for error details. The process exited with a failure code.',
      };
    }
  }

  // ── Node-specific conditions ──
  if (kind === 'Node') {
    const ready = conditions.find(c => c.type === 'Ready');
    const memPressure = conditions.find(c => c.type === 'MemoryPressure')?.status === 'True';
    const diskPressure = conditions.find(c => c.type === 'DiskPressure')?.status === 'True';
    const pidPressure = conditions.find(c => c.type === 'PIDPressure')?.status === 'True';
    const isCordoned = resource?.spec?.unschedulable === true;

    if (ready?.status !== 'True') {
      return {
        severity: 'error',
        summary: 'This machine is not responding.',
        recommendation: 'The machine has lost contact with the cluster. Check network connectivity and whether the machine is powered on.',
      };
    }
    if (memPressure) {
      return {
        severity: 'error',
        summary: 'This machine is running low on memory.',
        recommendation: 'Workloads may be evicted soon. Consider moving some workloads to other machines or adding more memory.',
      };
    }
    if (diskPressure) {
      return {
        severity: 'error',
        summary: 'This machine is running low on disk space.',
        recommendation: 'Clear unused images and logs, or expand the disk. Workloads may be evicted if disk pressure continues.',
      };
    }
    if (pidPressure) {
      return {
        severity: 'warn',
        summary: 'This machine has too many running processes.',
        recommendation: 'Too many processes are running on this machine. Some workloads may fail to start.',
      };
    }
    if (isCordoned) {
      return {
        severity: 'warn',
        summary: 'This machine is paused and not accepting new workloads.',
        recommendation: 'The machine has been manually paused for maintenance. Use "Resume machine" in the dashboard to allow new workloads again.',
      };
    }
    return {
      severity: 'ok',
      summary: 'This machine is healthy and accepting workloads.',
      recommendation: 'All systems on this machine are operating normally.',
    };
  }

  // ── All clear ──
  return {
    severity: 'ok',
    summary: 'Everything looks good.',
    recommendation: 'All components are running normally. No action required.',
  };
}

// ── Theme-aligned severity (matches System Health / Headlamp MUI) ───────────

function severityBorderColor(theme: Theme, severity: Diagnosis['severity']): string {
  switch (severity) {
    case 'ok':
      return theme.palette.success.main;
    case 'warn':
      return theme.palette.warning.main;
    default:
      return theme.palette.error.main;
  }
}

function severitySurfaceColor(theme: Theme, severity: Diagnosis['severity']): string {
  const a = theme.palette.mode === 'dark' ? 0.18 : 0.12;
  switch (severity) {
    case 'ok':
      return alpha(theme.palette.success.main, a);
    case 'warn':
      return alpha(theme.palette.warning.main, a);
    default:
      return alpha(theme.palette.error.main, a);
  }
}

function severityChipProps(severity: Diagnosis['severity']): { label: string; color: 'success' | 'warning' | 'error' } {
  switch (severity) {
    case 'ok':
      return { label: 'All good', color: 'success' };
    case 'warn':
      return { label: 'Needs attention', color: 'warning' };
    default:
      return { label: 'Problem', color: 'error' };
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function TroubleshootingSection({ resource }: { resource: any }) {
  const theme = useTheme();
  const settings = getSettings();
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  // Only render for workload kinds; skip if feature disabled or admin mode
  const kind: string = resource?.kind ?? '';
  const WORKLOAD_KINDS = new Set(['Deployment', 'Pod', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob', 'Node']);
  if (!WORKLOAD_KINDS.has(kind)) return null;
  if (!settings.enableTroubleshooting) return null;

  const { summary, recommendation, severity } = diagnose(resource);
  const borderColor = severityBorderColor(theme, severity);
  const surfaceColor = severitySurfaceColor(theme, severity);
  const chip = severityChipProps(severity);

  const rawYaml = JSON.stringify(resource?.status ?? {}, null, 2);

  function buildCopyText(): string {
    const name = resource?.metadata?.name ?? 'unknown';
    const ns = resource?.metadata?.namespace ?? '';
    const lines = [
      `What's happening? — ${kind}: ${ns ? `${ns}/` : ''}${name}`,
      `Status: ${chip.label}`,
      '',
      `Summary: ${summary}`,
      `Recommended action: ${recommendation}`,
    ];
    if (kind === 'Node') {
      const info = resource?.status?.nodeInfo ?? {};
      const addresses = resource?.status?.addresses ?? [];
      const hostname = addresses.find((a: any) => a.type === 'Hostname')?.address;
      if (hostname) lines.push('', `Hostname: ${hostname}`);
      if (info.osImage) lines.push(`OS: ${info.osImage}`);
      if (info.kernelVersion) lines.push(`Kernel: ${info.kernelVersion}`);
      if (info.containerRuntimeVersion) lines.push(`Runtime: ${info.containerRuntimeVersion}`);
      if (info.kubeletVersion) lines.push(`Kubelet: ${info.kubeletVersion}`);
    } else {
      const containers: ContainerStatus[] = resource?.status?.containerStatuses ?? [];
      if (containers.length > 0) {
        lines.push('', 'Containers:');
        for (const cs of containers) {
          const state = cs.state?.running
            ? 'Running'
            : cs.state?.waiting?.reason ?? cs.state?.terminated?.reason ?? 'Unknown';
          const restarts = cs.restartCount ?? 0;
          lines.push(`  ${cs.name}: ${state}${restarts > 0 ? ` (${restarts} restart${restarts !== 1 ? 's' : ''})` : ''}`);
        }
      }
    }
    return lines.join('\n');
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildCopyText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>
      System Status
    </Typography>
    <Box
      sx={{
        border: 2,
        borderColor: borderColor,
        borderRadius: 2,
        p: 2.5,
        mb: 3,
        bgcolor: surfaceColor,
        boxShadow: theme.shadows[1],
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.25, flexWrap: 'wrap' }}>
        <Chip label={chip.label} size="small" color={chip.color} sx={{ fontWeight: 600 }} />
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700, color: 'text.primary', flex: 1 }}>
          What&apos;s happening?
        </Typography>
        <Button
          size="small"
          variant="text"
          onClick={handleCopy}
          sx={{ minWidth: 0, px: 1, color: copied ? 'success.main' : 'text.secondary', fontWeight: 500, fontSize: '0.75rem' }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </Box>

      <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.primary', mb: 1 }}>
        {summary}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
          Recommended action:{' '}
        </Box>
        {recommendation}
      </Typography>

      {kind === 'Node' ? <NodeInfoSummary resource={resource} /> : <ContainerSummary resource={resource} />}

      <Button
        variant="outlined"
        size="small"
        onClick={() => setShowRaw(v => !v)}
        sx={{
          mt: 1,
          borderColor,
          color: borderColor,
          '&:hover': { borderColor, bgcolor: alpha(borderColor, theme.palette.mode === 'dark' ? 0.12 : 0.08) },
        }}
      >
        {showRaw ? 'Hide raw status' : 'Show raw status'}
      </Button>

      {showRaw && (
        <Box
          component="pre"
          sx={{
            mt: 1.5,
            p: 1.5,
            borderRadius: 1,
            fontSize: '0.75rem',
            overflowX: 'auto',
            maxHeight: 300,
            m: 0,
            bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.04),
            color: 'text.primary',
            border: 1,
            borderColor: 'divider',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}
        >
          {rawYaml}
        </Box>
      )}
    </Box>
    </>
  );
}

// ── Node info summary sub-component ─────────────────────────────────────────

function formatNodeCPU(raw: string): string {
  if (!raw) return '';
  if (raw.endsWith('m')) return `${(parseInt(raw, 10) / 1000).toFixed(1)} cores`;
  return `${raw} cores`;
}

function formatNodeMemory(raw: string): string {
  if (!raw) return '';
  if (raw.endsWith('Ki')) {
    const ki = parseInt(raw, 10);
    const gib = ki / (1024 * 1024);
    return gib >= 1 ? `${gib.toFixed(1)} GiB` : `${(ki / 1024).toFixed(0)} MiB`;
  }
  return raw;
}

function NodeInfoSummary({ resource }: { resource: any }) {
  const info = resource?.status?.nodeInfo ?? {};
  const addresses: { type: string; address: string }[] = resource?.status?.addresses ?? [];
  const allocatable = resource?.status?.allocatable ?? {};
  const labels: Record<string, string> = resource?.metadata?.labels ?? {};

  const roles: string[] = [];
  if ('node-role.kubernetes.io/control-plane' in labels || 'node-role.kubernetes.io/master' in labels) {
    roles.push('Control plane');
  }
  if ('node-role.kubernetes.io/worker' in labels || roles.length === 0) {
    roles.push('Worker');
  }

  const hostname = addresses.find(a => a.type === 'Hostname')?.address ?? '';
  const internalIP = addresses.find(a => a.type === 'InternalIP')?.address ?? '';
  const cpu = formatNodeCPU(allocatable.cpu ?? '');
  const mem = formatNodeMemory(allocatable.memory ?? '');

  const rows: [string, string][] = [
    ...(hostname ? [['Hostname', hostname] as [string, string]] : []),
    ...(internalIP ? [['IP address', internalIP] as [string, string]] : []),
    ...(roles.length ? [['Role', roles.join(', ')] as [string, string]] : []),
    ...(info.osImage ? [['Operating system', info.osImage] as [string, string]] : []),
    ...(info.kernelVersion ? [['Kernel', info.kernelVersion] as [string, string]] : []),
    ...(info.containerRuntimeVersion ? [['Container runtime', info.containerRuntimeVersion] as [string, string]] : []),
    ...(info.kubeletVersion ? [['Kubelet version', info.kubeletVersion] as [string, string]] : []),
    ...(cpu ? [['CPU available', cpu] as [string, string]] : []),
    ...(mem ? [['Memory available', mem] as [string, string]] : []),
  ];

  if (rows.length === 0) return null;

  return (
    <Box sx={{ mb: 1.5, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 3, rowGap: 0.4 }}>
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>{label}</Typography>
          <Typography variant="body2" color="text.secondary">{value}</Typography>
        </React.Fragment>
      ))}
    </Box>
  );
}

// ── Container status summary sub-component ───────────────────────────────────

function ContainerSummary({ resource }: { resource: any }) {
  const containers: ContainerStatus[] = resource?.status?.containerStatuses ?? [];
  if (containers.length === 0) return null;

  return (
    <Box sx={{ mb: 1 }}>
      {containers.map(cs => {
        const state = cs.state?.running
          ? 'Running'
          : cs.state?.waiting?.reason ?? cs.state?.terminated?.reason ?? 'Unknown';
        const restarts = cs.restartCount ?? 0;
        return (
          <Typography key={cs.name} variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
            <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {cs.name}
            </Box>
            : {state}
            {restarts > 0 && (
              <Box component="span" sx={{ color: 'error.main', ml: 1 }}>
                {restarts} restart{restarts !== 1 ? 's' : ''}
              </Box>
            )}
          </Typography>
        );
      })}
    </Box>
  );
}
