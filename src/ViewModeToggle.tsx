import React from 'react';
import Box from '@mui/material/Box';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { getSettings, persistSailorViewSettings } from './settingsStore';

export type ViewModeToggleProps = {
  /** `appBar`: compact for the top bar. `page`: label + toggle on System Health. */
  variant?: 'appBar' | 'page';
};

export function ViewModeToggle({ variant = 'page' }: ViewModeToggleProps) {
  const settings = getSettings();

  function handleChange(_: React.MouseEvent<HTMLElement>, value: 'sailor' | 'admin' | null) {
    if (value === null || value === settings.viewMode) return;
    persistSailorViewSettings({ viewMode: value });
    window.location.reload();
  }

  const group = (
    <ToggleButtonGroup
      exclusive
      value={settings.viewMode}
      onChange={handleChange}
      size="small"
      aria-label="Sailor or admin view mode"
      sx={
        variant === 'appBar'
          ? {
              '& .MuiToggleButton-root': { py: 0.5, px: 1, typography: 'caption', fontWeight: 600 },
            }
          : undefined
      }
    >
      <ToggleButton value="sailor" aria-label="Sailor view">
        Sailor
      </ToggleButton>
      <ToggleButton value="admin" aria-label="Admin view">
        Admin
      </ToggleButton>
    </ToggleButtonGroup>
  );

  if (variant === 'appBar') {
    return (
      <Tooltip title="Sailor (simplified) vs Admin (full Kubernetes UI). The page reloads when you switch.">
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 1 }}>
          {group}
        </Box>
      </Tooltip>
    );
  }

  return (
    <Box>
      <Typography
        component="span"
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', textAlign: 'right', mb: 0.5 }}
      >
        View mode (reloads to apply)
      </Typography>
      {group}
    </Box>
  );
}
