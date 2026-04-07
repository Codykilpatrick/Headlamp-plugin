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

// ── Severity styles ──────────────────────────────────────────────────────────

const SEVERITY_STYLES = {
  ok: { border: '#2e7d32', bg: '#e8f5e9', icon: '✅' },
  warn: { border: '#e65100', bg: '#fff8e1', icon: '⚠️' },
  error: { border: '#c62828', bg: '#ffebee', icon: '🔴' },
};

// ── Component ────────────────────────────────────────────────────────────────

export function TroubleshootingSection({ resource }: { resource: any }) {
  const settings = getSettings();
  const [showRaw, setShowRaw] = useState(false);

  // Only render for workload kinds; skip if feature disabled or admin mode
  const kind: string = resource?.kind ?? '';
  const WORKLOAD_KINDS = new Set(['Deployment', 'Pod', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob']);
  if (!WORKLOAD_KINDS.has(kind)) return null;
  if (!settings.enableTroubleshooting) return null;

  const { summary, recommendation, severity } = diagnose(resource);
  const style = SEVERITY_STYLES[severity];

  const rawYaml = JSON.stringify(resource?.status ?? {}, null, 2);

  return (
    <div
      style={{
        border: `2px solid ${style.border}`,
        borderRadius: '10px',
        padding: '20px',
        backgroundColor: style.bg,
        marginBottom: '24px',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <span style={{ fontSize: '20px' }}>{style.icon}</span>
        <span style={{ fontWeight: 700, fontSize: '16px' }}>What's happening?</span>
      </div>

      <p style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 500 }}>{summary}</p>
      <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#444' }}>
        <strong>Recommended action:</strong> {recommendation}
      </p>

      {/* Container status summary */}
      <ContainerSummary resource={resource} />

      {/* Raw status toggle */}
      <button
        onClick={() => setShowRaw(v => !v)}
        style={{
          background: 'none',
          border: `1px solid ${style.border}`,
          borderRadius: '4px',
          padding: '4px 12px',
          cursor: 'pointer',
          fontSize: '12px',
          color: style.border,
          marginTop: '8px',
        }}
      >
        {showRaw ? 'Hide raw status' : 'Show raw status'}
      </button>

      {showRaw && (
        <pre
          style={{
            marginTop: '12px',
            padding: '12px',
            backgroundColor: 'rgba(0,0,0,0.04)',
            borderRadius: '6px',
            fontSize: '11px',
            overflowX: 'auto',
            maxHeight: '300px',
          }}
        >
          {rawYaml}
        </pre>
      )}
    </div>
  );
}

// ── Container status summary sub-component ───────────────────────────────────

function ContainerSummary({ resource }: { resource: any }) {
  const containers: ContainerStatus[] = resource?.status?.containerStatuses ?? [];
  if (containers.length === 0) return null;

  return (
    <div style={{ marginBottom: '8px' }}>
      {containers.map(cs => {
        const state = cs.state?.running
          ? 'Running'
          : cs.state?.waiting?.reason ?? cs.state?.terminated?.reason ?? 'Unknown';
        const restarts = cs.restartCount ?? 0;
        return (
          <div key={cs.name} style={{ fontSize: '13px', color: '#555', marginBottom: '2px' }}>
            <strong>{cs.name}</strong>: {state}
            {restarts > 0 && <span style={{ color: '#c62828', marginLeft: '8px' }}>{restarts} restart{restarts !== 1 ? 's' : ''}</span>}
          </div>
        );
      })}
    </div>
  );
}
