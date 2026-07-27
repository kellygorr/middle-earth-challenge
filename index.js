/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { pedometerBackgroundTask } from './src/services/pedometerBackgroundTask';

AppRegistry.registerComponent(appName, () => App);

// Pedometer mode: WorkManager fires this task ~5x/day via
// PedometerHeadlessJsService (Android only). See
// docs/pedometer-mode.md § Phase 3b. The factory shape
// `() => taskFn` is required by RN's headless-task contract.
AppRegistry.registerHeadlessTask(
  'PedometerSweep',
  () => pedometerBackgroundTask,
);
