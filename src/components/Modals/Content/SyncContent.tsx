import React from 'react';
import { Platform } from 'react-native';
import SyncContentIOS from './SyncContentIOS';
import SyncContentAndroid from './SyncContentAndroid';

/**
 * SyncContent - Platform dispatcher for the Sync modal.
 *
 * iOS and Android have different flows (single-source Apple Health vs.
 * two-source picker with pedometer). Each platform has its own
 * self-contained component so changes to one cannot affect the other.
 */
export default function SyncContent() {
  return Platform.OS === 'ios' ? <SyncContentIOS /> : <SyncContentAndroid />;
}
