import React, { useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { withClusterPrefix } from '../lib/clusterPaths';
import { getSettings } from '../settingsStore';
import { isClusterBareRootPath } from './sailorPathUtils';

/**
 * In sailor mode, send users from the empty cluster landing (`/c/:cluster`) to System Health.
 * Mounted via registerUIPanel so it stays inside the router.
 */
export function SailorLandingRedirect() {
  const history = useHistory();
  const location = useLocation();

  useEffect(() => {
    const settings = getSettings();
    if (settings.viewMode !== 'sailor') return;

    const pathname = location.pathname.split('?')[0];
    if (!isClusterBareRootPath(pathname)) return;

    const target = withClusterPrefix('/sailor-view/dashboard', pathname);
    if (pathname === target || pathname.startsWith(`${target}/`)) return;

    history.replace(target);
  }, [history, location.pathname]);

  return null;
}
