import {
  registerRoute,
  registerSidebarEntry,
  registerSidebarEntryFilter,
  registerResourceTableColumnsProcessor,
  registerDetailsViewSection,
  registerRouteFilter,
  registerPluginSettings,
} from '@kinvolk/headlamp-plugin/lib';

import React from 'react';
import { SettingsPage } from './settings';
import { SystemHealthDashboard, SystemDrillDown } from './dashboard/SystemHealthDashboard';
import { makeTerminologyFilters } from './terminology';
import { TroubleshootingSection } from './troubleshooting/TroubleshootingPanel';
import { makeComplexityFilters } from './complexity';

// Settings — must be registered first so config is available
registerPluginSettings('sailor-view', SettingsPage, true);

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

// ── Feature 2: Plain Language Terminology ────────────────────────────────────
const { sidebarFilter: terminologySidebarFilter, columnProcessor } = makeTerminologyFilters();
registerSidebarEntryFilter(terminologySidebarFilter);
registerResourceTableColumnsProcessor(columnProcessor);

// ── Feature 3: Guided Troubleshooting Panel ──────────────────────────────────
registerDetailsViewSection(TroubleshootingSection);

// ── Feature 4: Complexity Hiding ─────────────────────────────────────────────
const { routeFilter, sidebarFilter: complexitySidebarFilter } = makeComplexityFilters();
registerRouteFilter(routeFilter);
registerSidebarEntryFilter(complexitySidebarFilter);
