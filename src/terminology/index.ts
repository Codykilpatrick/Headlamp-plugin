/**
 * Feature 2 — Plain Language Terminology
 *
 * registerSidebarEntryFilter: renames/hides sidebar items for sailors.
 * registerResourceTableColumnsProcessor: renames column headers and
 *   translates raw K8s status values into plain English.
 */

import { getSettings } from '../settingsStore';

// ── Sidebar label overrides ──────────────────────────────────────────────────

const SIDEBAR_LABEL_MAP: Record<string, string> = {
  workloads: 'Systems',
  Workloads: 'Systems',
  pods: 'Processes',
  Pods: 'Processes',
  deployments: 'Deployments',
  Deployments: 'Deployments',
  services: 'Connections',
  Services: 'Connections',
  configmaps: 'Configuration',
  ConfigMaps: 'Configuration',
  secrets: 'Secrets',
  Secrets: 'Secrets',
  storage: 'Storage',
  Storage: 'Storage',
};

// Sidebar entries to hide entirely in sailor mode (by name/id, lowercase)
const SIDEBAR_HIDE_IN_SAILOR = new Set([
  'replicasets',
  'daemonsets',
  'statefulsets',
  'jobs',
  'cronjobs',
  'endpoints',
  'ingresses',
  'networkpolicies',
  'persistentvolumes',
  'storageclasses',
  'limitranges',
  'resourcequotas',
  'poddisruptionbudgets',
  'horizontalpodautoscalers',
]);

export function makeTerminologyFilters() {
  /**
   * Sidebar filter: rename or hide entries.
   * Headlamp calls this for every sidebar entry; return null to hide, or a
   * modified entry object to rename.
   */
  function sidebarFilter(entry: any): any | null {
    const settings = getSettings();
    if (!settings.enableTerminology || settings.viewMode === 'admin') return entry;

    const name: string = (entry?.name ?? '').toLowerCase();

    if (SIDEBAR_HIDE_IN_SAILOR.has(name)) return null;

    const newLabel = SIDEBAR_LABEL_MAP[entry?.name] ?? SIDEBAR_LABEL_MAP[entry?.label];
    if (newLabel) {
      return { ...entry, label: newLabel };
    }

    return entry;
  }

  /**
   * Column processor: called by Headlamp with the array of column definitions
   * for a resource table. We mutate headers and cell renderers.
   */
  function columnProcessor(columns: any[], resourceClass: any): any[] {
    const settings = getSettings();
    if (!settings.enableTerminology || settings.viewMode === 'admin') return columns;

    // Namespace mapping for cell values
    const nsMap: Record<string, string> = {};
    for (const m of settings.namespaceMappings) {
      if (m.namespace) nsMap[m.namespace] = m.systemName || m.namespace;
    }

    return columns.map(col => {
      const header: string = col?.label ?? col?.header ?? '';

      // Rename "Namespace" → "System"
      if (header.toLowerCase() === 'namespace') {
        return {
          ...col,
          label: 'System',
          header: 'System',
          getValue: col.getValue
            ? (resource: any) => {
                const raw = col.getValue(resource);
                return nsMap[raw] ?? raw;
              }
            : undefined,
        };
      }

      // Rename status column cell values
      if (header.toLowerCase() === 'status' || header.toLowerCase() === 'ready') {
        return {
          ...col,
          getValue: col.getValue
            ? (resource: any) => translateStatus(col.getValue(resource))
            : undefined,
        };
      }

      return col;
    });
  }

  return { sidebarFilter, columnProcessor };
}

// ── Status translation ───────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  Running: 'Running',
  Succeeded: 'Completed',
  Pending: 'Starting',
  Failed: 'Offline',
  Unknown: 'Unknown',
  CrashLoopBackOff: 'Offline (Restart Loop)',
  OOMKilled: 'Offline (Out of Memory)',
  Error: 'Offline',
  Terminating: 'Shutting Down',
  ContainerCreating: 'Starting',
  ImagePullBackOff: 'Offline (Image Error)',
  ErrImagePull: 'Offline (Image Error)',
  Completed: 'Completed',
  Evicted: 'Evicted',
};

function translateStatus(raw: any): any {
  if (typeof raw !== 'string') return raw;
  return STATUS_MAP[raw] ?? raw;
}
