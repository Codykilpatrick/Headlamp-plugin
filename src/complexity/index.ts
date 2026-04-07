/**
 * Feature 4 — Complexity Hiding
 *
 * registerRouteFilter: suppresses advanced K8s routes (CRDs, cluster roles,
 *   API explorer, etc.) based on admin-configurable toggles.
 *
 * registerSidebarEntryFilter: hides corresponding sidebar items.
 *
 * Both filters are no-ops when viewMode === 'admin' or
 * enableComplexityHiding === false.
 */

import { getSettings } from '../settingsStore';

// ── Route path patterns to suppress ─────────────────────────────────────────
// Keyed to match settings.hideRoutes fields.

const ROUTE_PATTERNS: Record<string, RegExp[]> = {
  crds: [/\/crds?/, /\/customresourcedefinitions?/],
  clusterRoles: [/\/clusterroles?/, /\/clusterrolebindings?/],
  roles: [/\/roles?(?!\/|bindings)/, /\/rolebindings?/],
  serviceAccounts: [/\/serviceaccounts?/],
  apiExplorer: [/\/api-explorer/, /\/apiexplorer/, /\/apis\b/],
  namespaces: [/^\/namespaces\/?$/],
};

// ── Sidebar entry names to suppress (lowercase) ──────────────────────────────

const SIDEBAR_HIDE_MAP: Record<string, string[]> = {
  crds: ['crds', 'customresourcedefinitions', 'crd'],
  clusterRoles: ['clusterroles', 'clusterrolebindings', 'cluster-roles', 'cluster-role-bindings'],
  roles: ['roles', 'rolebindings', 'role-bindings'],
  serviceAccounts: ['serviceaccounts', 'service-accounts'],
  apiExplorer: ['api-explorer', 'apiexplorer'],
  namespaces: ['namespaces'],
};

export function makeComplexityFilters() {
  /**
   * Route filter — return false to suppress the route.
   * Headlamp calls this for each registered route; returning false removes it.
   */
  function routeFilter(route: any): boolean {
    const settings = getSettings();
    if (!settings.enableComplexityHiding || settings.viewMode === 'admin') return true;

    const path: string = route?.path ?? '';

    for (const [key, patterns] of Object.entries(ROUTE_PATTERNS)) {
      const shouldHide = settings.hideRoutes[key as keyof typeof settings.hideRoutes];
      if (shouldHide && patterns.some(re => re.test(path))) {
        return false;
      }
    }

    return true;
  }

  /**
   * Sidebar filter — return null to hide the entry.
   * Shared with Feature 2 (terminology); called for every sidebar item.
   */
  function sidebarFilter(entry: any): any | null {
    const settings = getSettings();
    if (!settings.enableComplexityHiding || settings.viewMode === 'admin') return entry;

    const name: string = (entry?.name ?? '').toLowerCase();

    for (const [key, names] of Object.entries(SIDEBAR_HIDE_MAP)) {
      const shouldHide = settings.hideRoutes[key as keyof typeof settings.hideRoutes];
      if (shouldHide && names.includes(name)) {
        return null;
      }
    }

    return entry;
  }

  return { routeFilter, sidebarFilter };
}
