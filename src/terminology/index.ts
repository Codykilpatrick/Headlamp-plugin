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
  services: 'Services',
  Services: 'Services',
  configmaps: 'Configuration',
  ConfigMaps: 'Configuration',
  secrets: 'Secrets',
  Secrets: 'Secrets',
  storage: 'Storage',
  Storage: 'Storage',
};

// Sidebar entries to hide entirely in sailor mode. Keys are entry.name lowercased
// (Headlamp passes mixed-case names like "Pods" — we normalize with .toLowerCase()).
//
// Top-level sections (hide the whole group + children): security, gatewayapi, workloads,
// storage, network, config, cluster, map, crds, etc. — match entry.name (not the label:
// the "Configuration" group is name "config", not "configuration").
const SIDEBAR_HIDE_IN_SAILOR = new Set([
  // Whole "Security" sidebar group (Service Accounts, Roles, Role Bindings)
  'security',
  // Whole "Configuration" sidebar group (Config Maps, Secrets, HPAs, …) — Headlamp name is `config`
  'config',
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
  // Gateway API (beta) — parent name is gatewayapi; omit to hide only leaves instead
  'gateways',
  'gatewayclasses',
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
      entry.label = newLabel; // mutate in place — Headlamp's filter() discards the return value for replacements
    }

    return entry;
  }

  /**
   * Column processor: called by Headlamp with the array of column definitions
   * for a resource table. We mutate headers and cell renderers.
   */
  function columnProcessor({ id, columns }: { id: string; columns: any[] }): any[] {
    const settings = getSettings();
    if (!settings.enableTerminology || settings.viewMode === 'admin') return columns;

    // Workloads overview (mixed Deployments, StatefulSets, …): drop Kind — redundant noise for sailors.
    let cols = columns;
    if (id === 'headlamp-workloads') {
      cols = cols.filter((col: any) => {
        if (col === 'kind' || col === 'type') return false;
        if (typeof col === 'object' && col != null && (col.id === 'kind' || col.id === 'type')) return false;
        return true;
      });
    }

    // Namespace mapping for cell values
    const nsMap: Record<string, string> = {};
    for (const m of settings.namespaceMappings) {
      if (m.namespace) nsMap[m.namespace] = m.systemName || m.namespace;
    }

    return cols.map(col => {
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
