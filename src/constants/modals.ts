/**
 * Modal configuration for SharedModal content switching.
 * Static config lives here; content/footer components are referenced directly.
 */

import React from 'react';
import {
  StatsContent,
  SettingsContent,
  SyncContent,
  MilesContent,
  InfoContent,
} from '../components/Modals/Content';
import { MilesFooter, InfoFooter } from '../components/Modals/Footers';

export type ModalType = 'stats' | 'settings' | 'miles' | 'sync' | 'info';

export interface ModalConfig {
  /** Modal title (displayed above card in portrait, left side in landscape) */
  title: string;
  /** Content component to render */
  content?: React.ComponentType;
  /** Footer component to render (below scroll area) */
  footer?: React.ComponentType;
  /** Use smaller header padding (no left button space) */
  smallHeader?: boolean;
  /** Use narrower max-width */
  narrow?: boolean;
  /** Enable keyboard avoiding behavior */
  keyboardAvoiding?: boolean;
  /** Left button type */
  leftButton?: 'home' | 'back' | null;
  /** Scroll container type: 'default' wraps in ScrollView, 'custom' lets content handle scrolling */
  scrollType?: 'default' | 'custom';
}

export const MODAL_CONFIG: Record<ModalType, ModalConfig> = {
  stats: {
    title: 'Stats',
    content: StatsContent,
    smallHeader: true,
    scrollType: 'default',
  },
  settings: {
    title: 'Settings',
    content: SettingsContent,
    leftButton: 'home',
    scrollType: 'default',
  },
  miles: {
    title: 'Distance',
    content: MilesContent,
    footer: MilesFooter,
    smallHeader: true,
    keyboardAvoiding: true,
    scrollType: 'custom',
  },
  sync: {
    title: 'Sync',
    content: SyncContent,
    smallHeader: true,
    scrollType: 'default',
  },
  info: {
    title: '', // Dynamic - comes from modalStack entry
    content: InfoContent,
    footer: InfoFooter,
    narrow: true,
    scrollType: 'default',
  },
};
