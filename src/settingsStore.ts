/**
 * Thin wrapper around Headlamp's plugin data store so feature modules can
 * read the current SailorView settings without prop-drilling.
 *
 * Headlamp persists plugin settings under the plugin name key in localStorage.
 * We read it directly here so filters (which are not React components) can
 * access the config synchronously.
 */

import { DEFAULT_SETTINGS, SailorViewSettings } from './settings';

const STORAGE_KEY = 'headlamp-plugin-data-sailor-view';

export function getSettings(): SailorViewSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SailorViewSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      hideRoutes: { ...DEFAULT_SETTINGS.hideRoutes, ...(parsed.hideRoutes ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
