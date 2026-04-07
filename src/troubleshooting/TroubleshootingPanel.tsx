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

  // Only render for workload kinds; skip if feature disabled or admin mode
  const kind: string = resource?.kind ?? '';
  const WORKLOAD_KINDS = new Set(['Deployment', 'Pod', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob']);
  if (!WORKLOAD_KINDS.has(kind)) return null;
  if (!settings.enableTroubleshooting) return null;

  const { summary, recommendation, severity } = diagnose(resource);
  const borderColor = severityBorderColor(theme, severity);
  const surfaceColor = severitySurfaceColor(theme, severity);
  const chip = severityChipProps(severity);

  const rawYaml = JSON.stringify(resource?.status ?? {}, null, 2);

  return (
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
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
          What&apos;s happening?
        </Typography>
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

      <ContainerSummary resource={resource} />

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
