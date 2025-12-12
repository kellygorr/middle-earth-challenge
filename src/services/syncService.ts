import { database } from './database';
import { fitnessService } from './fitnessService';
import { useSaveStore } from '../stores/saveStore';
import { useProgressStore } from '../stores/progressStore';
import { getCurrentSegment, getSegmentProgress, JOURNEY_SEGMENTS, TOTAL_JOURNEY_MILES } from '../constants/journey';
import checkpointsData from '../constants/checkpoints.json';

/**
 * Sync service - Coordinates fitness data synchronization with the database
 * Handles background sync and real-time updates
 */

export interface SyncResult {
  success: boolean;
  milesAdded: number;
  checkpointCompleted: boolean;
  checkpointNumber?: number;
  error?: string;
}

class SyncService {
  private isBackgroundSyncSetup = false;

  /**
   * Perform a full sync of fitness data
   * Updates journey progress and detects checkpoint completions
   */
  async sync(): Promise<SyncResult> {
    try {
      const { activeSave, journeyProgress } = useSaveStore.getState();
      
      if (!activeSave || !journeyProgress) {
        return {
          success: false,
          milesAdded: 0,
          checkpointCompleted: false,
          error: 'No active save',
        };
      }

      // Get fitness data since last sync
      const lastSyncDate = new Date(journeyProgress.lastSyncDate);
      const newDistance = await fitnessService.getDistanceSince(lastSyncDate);

      if (newDistance <= 0) {
        return {
          success: true,
          milesAdded: 0,
          checkpointCompleted: false,
        };
      }

      // Calculate new totals
      const oldTotalMiles = journeyProgress.totalMiles;
      const newTotalMiles = Math.min(
        oldTotalMiles + newDistance,
        TOTAL_JOURNEY_MILES
      );
      const milesAdded = newTotalMiles - oldTotalMiles;

      // Get current segment
      const currentSegment = getCurrentSegment(newTotalMiles);
      const milesIntoSegment = newTotalMiles - currentSegment.startMiles;
      const segmentNumber = currentSegment.id;

      // Check if checkpoint completed
      let checkpointCompleted = false;
      let completedCheckpointNumber: number | undefined;

      if (
        segmentNumber !== journeyProgress.currentCheckpoint &&
        newTotalMiles > oldTotalMiles
      ) {
        // Checkpoint completed!
        checkpointCompleted = true;
        completedCheckpointNumber = journeyProgress.currentCheckpoint;

        // Calculate stats for completed checkpoint
        const completedSegment = JOURNEY_SEGMENTS[completedCheckpointNumber - 1];
        const saveStartDate = new Date(activeSave.startDate || activeSave.createdDate);
        const completionDate = new Date();
        const daysToComplete = Math.ceil(
          (completionDate.getTime() - saveStartDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const avgMilesPerDay = completedSegment.miles / daysToComplete;

        // Save checkpoint completion
        await database.addCheckpointCompletion({
          saveId: activeSave.id,
          checkpointNumber: completedCheckpointNumber,
          completedDate: completionDate.toISOString(),
          daysToComplete,
          avgMilesPerDay,
        });

        // Update progress store
        useProgressStore.getState().addCheckpointCompletion({
          id: `completion_${Date.now()}_${completedCheckpointNumber}`,
          saveId: activeSave.id,
          checkpointNumber: completedCheckpointNumber,
          completedDate: completionDate.toISOString(),
          daysToComplete,
          avgMilesPerDay,
        });
      }

      // Update journey progress in database
      await database.updateJourneyProgress(activeSave.id, {
        currentCheckpoint: segmentNumber,
        totalMiles: newTotalMiles,
        currentCheckpointMiles: milesIntoSegment,
        lastSyncDate: new Date().toISOString(),
      });

      // Update store
      useSaveStore.getState().setJourneyProgress({
        ...journeyProgress,
        currentCheckpoint: segmentNumber,
        totalMiles: newTotalMiles,
        currentCheckpointMiles: milesIntoSegment,
        lastSyncDate: new Date().toISOString(),
      });

      // Update daily distance
      const today = new Date().toISOString().split('T')[0];
      await database.addDailyDistance({
        saveId: activeSave.id,
        date: today,
        miles: milesAdded,
      });

      // Check if journey completed
      if (newTotalMiles >= TOTAL_JOURNEY_MILES && activeSave.status !== 'completed') {
        await database.updateJourneyProgress(activeSave.id, {
          totalMiles: TOTAL_JOURNEY_MILES,
        });

        // Mark save as completed
        const endDate = new Date().toISOString();
        // TODO: Update save status in database (would need to add method to database service)
        useSaveStore.getState().updateSave(activeSave.id, {
          status: 'completed',
          endDate,
        });
      }

      // Update last sync date
      useProgressStore.getState().setLastSyncDate(new Date().toISOString());

      return {
        success: true,
        milesAdded,
        checkpointCompleted,
        checkpointNumber: completedCheckpointNumber,
      };
    } catch (error) {
      console.error('Sync error:', error);
      return {
        success: false,
        milesAdded: 0,
        checkpointCompleted: false,
        error: String(error),
      };
    }
  }

  /**
   * Setup background sync
   * Uses react-native-background-fetch to sync periodically
   */
  async setupBackgroundSync(): Promise<void> {
    if (this.isBackgroundSyncSetup) {
      return;
    }

    try {
      // TODO: Implement with react-native-background-fetch
      // const BackgroundFetch = require('react-native-background-fetch');
      // 
      // await BackgroundFetch.configure(
      //   {
      //     minimumFetchInterval: 15, // 15 minutes
      //     stopOnTerminate: false,
      //     startOnBoot: true,
      //   },
      //   async (taskId) => {
      //     console.log('[BackgroundFetch] taskId:', taskId);
      //     await this.sync();
      //     BackgroundFetch.finish(taskId);
      //   },
      //   (taskId) => {
      //     console.log('[BackgroundFetch] TIMEOUT:', taskId);
      //     BackgroundFetch.finish(taskId);
      //   }
      // );

      console.log('Background sync setup required');
      this.isBackgroundSyncSetup = true;
    } catch (error) {
      console.error('Background sync setup error:', error);
    }
  }

  /**
   * Start real-time sync (for when app is active)
   * Useful during active workouts
   */
  startRealTimeSync(): void {
    fitnessService.startRealTimeUpdates(async (distance) => {
      console.log('Real-time distance update:', distance);
      // Trigger a sync
      await this.sync();
    });
  }

  /**
   * Stop real-time sync
   */
  stopRealTimeSync(): void {
    fitnessService.stopRealTimeUpdates();
  }
}

export const syncService = new SyncService();
