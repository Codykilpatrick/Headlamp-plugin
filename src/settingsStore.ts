/**
 * Read Sailor View settings where Headlamp actually stores them.
 *
 * Plugin settings UI uses ConfigStore(pluginName) → Redux `pluginConfigs[name]` and
 * persists to localStorage key `pluginConfigs` (see Headlamp's pluginConfigSlice).
 * This must match that path — not a custom localStorage key — or filters never see
 * saved view mode / toggles.
 */

import store from '@kinvolk/headlamp-plugin/lib/redux/stores/store';
import { DEFAULT_SETTINGS, SailorViewSettings } from './settings';

/** Must match `registerPluginSettings('…', …)` in `src/index.tsx`. */
export const SAILOR_VIEW_PLUGIN_CONFIG_KEY = 'sailor-view';

const PLUGIN_CONFIGS_STORAGE_KEY = 'pluginConfigs';

function mergeSettings(parsed: Partial<SailorViewSettings> | undefined | null): SailorViewSettings {
  if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    hideRoutes: { ...DEFAULT_SETTINGS.hideRoutes, ...(parsed.hideRoutes ?? {}) },
  };
}

/** Subset of settings that drive sidebar / route filters; used to reload after Save. */
export function getFilterDrivingSettingsSignature(): string {
  const s = getSettings();
  return JSON.stringify({
    viewMode: s.viewMode,
    enableTerminology: s.enableTerminology,
    enableTroubleshooting: s.enableTroubleshooting,
    enableComplexityHiding: s.enableComplexityHiding,
    hideRoutes: s.hideRoutes,
  });
}

export function getSettings(): SailorViewSettings {
  try {
    const state = store.getState() as { pluginConfigs?: Record<string, unknown> };
    const fromStore = state?.pluginConfigs?.[SAILOR_VIEW_PLUGIN_CONFIG_KEY] as
      | Partial<SailorViewSettings>
      | undefined;
    if (fromStore != null && typeof fromStore === 'object') {
      return mergeSettings(fromStore);
    }
  } catch {
    // Store not initialised (should not happen inside Headlamp)
  }

  try {
    const raw = localStorage.getItem(PLUGIN_CONFIGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const all = JSON.parse(raw) as Record<string, unknown>;
    const parsed = all[SAILOR_VIEW_PLUGIN_CONFIG_KEY] as Partial<SailorViewSettings> | undefined;
    return mergeSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}
