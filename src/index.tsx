import {
  registerRoute,
  registerSidebarEntry,
  registerSidebarEntryFilter,
  registerResourceTableColumnsProcessor,
  registerRouteFilter,
  registerPluginSettings,
  registerUIPanel,
  registerAppBarAction,
} from '@kinvolk/headlamp-plugin/lib';

import React from 'react';
import { getFilterDrivingSettingsSignature } from './settingsStore';
import { ViewModeToggle } from './ViewModeToggle';
import { SettingsPage } from './settings';
import { SailorLandingRedirect } from './dashboard/SailorLandingRedirect';
import { SystemHealthDashboard, SystemDrillDown } from './dashboard/SystemHealthDashboard';
import { makeTerminologyFilters } from './terminology';
import { makeComplexityFilters } from './complexity';
import { registerSailorDetailsView } from './sailorDetailsView';

// Settings — must be registered first so config is available
registerPluginSettings('sailor-view', SettingsPage, true);

// Sailor / Admin toggle in the top app bar (global; reloads on change like settings)
registerAppBarAction(() => React.createElement(ViewModeToggle, { variant: 'appBar' }));

// ── Feature 1: System Health Dashboard ──────────────────────────────────────
registerSidebarEntry({
  parent: null,
  name: 'sailor-dashboard',
  label: 'System Health',
  url: '/sailor-view/dashboard',
  icon: 'mdi:ship-wheel',
});

registerRoute({
  path: '/sailor-view/dashboard',
  sidebar: 'sailor-dashboard',
  name: 'sailor-dashboard',
  exact: true,
  component: () => React.createElement(SystemHealthDashboard),
});

registerRoute({
  path: '/sailor-view/dashboard/:systemName',
  sidebar: 'sailor-dashboard',
  name: 'sailor-dashboard-drilldown',
  exact: true,
  component: () => React.createElement(SystemDrillDown),
});

// Phase 1: sailor mode — redirect bare cluster landing (`/c/:cluster`) to System Health
registerUIPanel({
  id: 'sailor-landing-redirect',
  side: 'top',
  component: () => React.createElement(SailorLandingRedirect),
});

// ── Feature 2: Plain Language Terminology ────────────────────────────────────
const { sidebarFilter: terminologySidebarFilter, columnProcessor } = makeTerminologyFilters();
registerSidebarEntryFilter(terminologySidebarFilter);
registerResourceTableColumnsProcessor(columnProcessor);

// Sailor view: hide Container spec blocks + trim deployment revision / last-applied annotations
registerSailorDetailsView();

// ── Feature 4: Complexity Hiding ─────────────────────────────────────────────
const { routeFilter, sidebarFilter: complexitySidebarFilter } = makeComplexityFilters();
registerRouteFilter(routeFilter);
registerSidebarEntryFilter(complexitySidebarFilter);

// Headlamp’s sidebar tree is memoized without depending on `pluginConfigs`. We cannot use
// Headlamp’s Redux store from bundled plugin code (wrong instance). Poll localStorage instead.
let lastFilterSettingsSig = getFilterDrivingSettingsSignature();
window.setInterval(() => {
  const next = getFilterDrivingSettingsSignature();
  if (next === lastFilterSettingsSig) return;
  lastFilterSettingsSig = next;
  window.location.reload();
}, 1500);
