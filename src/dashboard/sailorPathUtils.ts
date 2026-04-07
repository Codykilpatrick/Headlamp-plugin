import { matchPath } from 'react-router-dom';

/**
 * True when the URL is only the cluster prefix (no resource section yet), e.g. `/c/my-cluster` or `/c/my-cluster/`.
 * Headlamp sends users here after picking a cluster (single-cluster shortcut).
 */
export function isClusterBareRootPath(pathname: string): boolean {
  const path = pathname.split('?')[0];
  return !!(
    matchPath(path, { path: '/c/:cluster', exact: true }) ||
    matchPath(path, { path: '/c/:cluster/', exact: true })
  );
}
