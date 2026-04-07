/**
 * Sailor view: hide low-level workload detail sections and trim revision-style metadata.
 *
 * Uses Headlamp’s details view sections processor (runs after core sections are built).
 */

import React from 'react';
import {
  DefaultDetailsViewSection,
  DetailsViewDefaultHeaderActions,
  registerDetailsViewHeaderActionsProcessor,
  registerDetailsViewSectionsProcessor,
} from '@kinvolk/headlamp-plugin/lib';
import { getSettings } from './settingsStore';

/**
 * Extra detail sections to drop in sailor view (ids from Headlamp’s Details.tsx / workload views).
 * `headlamp.workload-revision-history` is RevisionHistorySection on newer Headlamp (Deployment / etc.).
 */
const SAILOR_HIDDEN_DETAIL_SECTION_IDS = new Set([
  'headlamp.workload-containers',
  'headlamp.statefulset-containers',
  'headlamp.daemonset-containers',
  'headlamp.pod-containers',
  'headlamp.workload-revision-history',
]);

/** Shown under “Annotations”; sailors rarely need rollout / last-applied blobs. */
const ANNOTATION_KEYS_OMIT_IN_SAILOR = [
  'deployment.kubernetes.io/revision',
  'kubectl.kubernetes.io/last-applied-configuration',
];

function resourceWithSailorMetadata(resource: any) {
  if (!resource?.metadata) return resource;
  const ann = resource.metadata.annotations;
  if (!ann || typeof ann !== 'object') return resource;
  let changed = false;
  const nextAnn = { ...ann };
  for (const k of ANNOTATION_KEYS_OMIT_IN_SAILOR) {
    if (k in nextAnn) {
      delete nextAnn[k];
      changed = true;
    }
  }
  if (!changed) return resource;
  return {
    ...resource,
    metadata: {
      ...resource.metadata,
      annotations: Object.keys(nextAnn).length > 0 ? nextAnn : undefined,
    },
  };
}

/** Clone METADATA SectionBox so MetadataDisplay gets a resource without omitted annotations. */
function patchMetadataSection(section: { id?: string; section?: unknown }, resource: any) {
  const el = section.section;
  if (!resource || !React.isValidElement(el)) return section;
  const filtered = resourceWithSailorMetadata(resource);
  if (filtered === resource) return section;

  const nextInner = React.cloneElement(el as React.ReactElement<any>, {
    children: React.Children.map((el as React.ReactElement<any>).props.children, (child: React.ReactNode) => {
      if (React.isValidElement(child) && (child.props as { resource?: unknown })?.resource === resource) {
        return React.cloneElement(child as React.ReactElement<any>, { resource: filtered });
      }
      return child;
    }),
  });

  return { ...section, section: nextInner };
}

function sailorDetailsSectionsProcessor(resource: any, sections: any[]) {
  const settings = getSettings();
  if (settings.viewMode === 'admin') return sections;

  let next = sections.filter(sec => {
    const id = sec?.id;
    return !(typeof id === 'string' && SAILOR_HIDDEN_DETAIL_SECTION_IDS.has(id));
  });

  next = next.map(sec => {
    if (sec?.id === DefaultDetailsViewSection.METADATA && resource) {
      return patchMetadataSection(sec, resource);
    }
    return sec;
  });

  return next;
}

/** Hide write-heavy / YAML actions on detail headers in sailor view. */
function sailorHeaderActionsProcessor(_resource: any, actions: any[]) {
  if (getSettings().viewMode === 'admin') return actions;
  const hide = new Set<string>([
    'rollback',
    DetailsViewDefaultHeaderActions.SCALE,
    DetailsViewDefaultHeaderActions.EDIT,
  ]);
  return actions.filter((a: { id?: string }) => a?.id == null || !hide.has(a.id));
}

export function registerSailorDetailsView(): void {
  registerDetailsViewSectionsProcessor(sailorDetailsSectionsProcessor);
  registerDetailsViewHeaderActionsProcessor(sailorHeaderActionsProcessor);
}
