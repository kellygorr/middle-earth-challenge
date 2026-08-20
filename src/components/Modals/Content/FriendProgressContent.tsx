import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  FRIEND_AFFINITIES,
  FRIEND_AFFINITY_LABELS,
  getFriendAffinityColor,
  type FriendAffinity,
} from '../../../constants/friendAffinities';
import { friendProgressWorkflow } from '../../../services/friendProgressWorkflow';
import { useFriendProgressStore } from '../../../stores/friendProgressStore';
import { useProgressStore } from '../../../stores/progressStore';
import { useSettingsStore, useTheme } from '../../../stores/settingsStore';
import { spacing } from '../../../styles/global';
import { typographyThemed } from '../../../styles/typography';
import {
  combineSharedDisplayName,
  generateFantasySurname,
  splitSharedDisplayName,
} from '../../../utils/fantasyNameGenerator';
import Button from '../../Buttons/Button';
import ErrorMessageBanner from '../../ErrorMessageBanner';
import SettingsRef from '../../SettingsRef';
import { StatusBadge } from '../../StatusBadge';
import Section from '../Section';

const getErrorMessage = (error: unknown): string => {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : '';

  if (code.includes('permission-denied')) {
    return 'Please try again.';
  }

  return error instanceof Error && !error.message.startsWith('[')
    ? error.message
    : 'Please try again.';
};

const PendingActionPlaceholder = () => (
  <View
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    pointerEvents="none"
    style={styles.pendingActionPlaceholder}
  >
    <Button onPress={() => {}} variant="brand" disabled>
      Start sharing
    </Button>
  </View>
);

interface ActionError {
  message: string;
  title: string;
}

let draftAffinity: FriendAffinity | null = null;

const formatAge = (ms: number): string => {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export default function FriendProgressContent() {
  const theme = useTheme();
  const sharingEnabled = useSettingsStore(state => state.sharingEnabled);
  const savedDisplayName = useSettingsStore(state => state.sharingDisplayName);
  const savedAffinity = useSettingsStore(state => state.sharingAffinity);
  const provisioningPending = useSettingsStore(
    state => state.sharingProvisioningPending,
  );
  const deletionPending = useSettingsStore(
    state => state.sharingDeletionPending,
  );
  const totalMiles = useProgressStore(state => state.getTotalMiles());
  const showKelly = useFriendProgressStore(state => state.showKelly);
  const fetchParticipants = useFriendProgressStore(
    state => state.fetchParticipants,
  );
  const fetchError = useFriendProgressStore(state => state.fetchError);
  const lastFetchedAt = useFriendProgressStore(state => state.lastFetchedAt);
  const participantCount = useFriendProgressStore(
    state => state.participants.length,
  );
  const savedNameParts = splitSharedDisplayName(savedDisplayName);
  const [firstName, setFirstName] = useState(savedNameParts.firstName);
  const [fantasySurname, setFantasySurname] = useState(
    savedNameParts.fantasySurname || generateFantasySurname(),
  );
  const [affinity, setAffinity] = useState(
    sharingEnabled && savedAffinity
      ? savedAffinity
      : draftAffinity ??
          FRIEND_AFFINITIES[
            Math.floor(Math.random() * FRIEND_AFFINITIES.length)
          ],
  );
  const [isWorking, setIsWorking] = useState(false);
  const [isEnablingSharing, setIsEnablingSharing] = useState(false);
  const actionInFlightRef = useRef(false);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const displayName = combineSharedDisplayName(firstName, fantasySurname);
  const isNameValid = displayName.length > 0;
  const nameChanged = displayName !== (savedDisplayName ?? '');
  const profileChanged = nameChanged || affinity !== savedAffinity;
  const showSharingStatus =
    sharingEnabled || provisioningPending || isEnablingSharing;

  // Cached markers keep rendering after a failed refresh, so say so rather
  // than letting old positions read as current.
  const freshnessLabel = (() => {
    if (!sharingEnabled || provisioningPending) return null;
    if (fetchError) {
      return lastFetchedAt
        ? `Couldn't refresh — showing positions from ${formatAge(
            Date.now() - lastFetchedAt,
          )}`
        : "Couldn't load friend progress";
    }
    if (lastFetchedAt === null) return null;
    if (participantCount === 0) return null;
    return `Updated ${formatAge(Date.now() - lastFetchedAt)}`;
  })();

  useEffect(() => {
    if (
      (sharingEnabled && !provisioningPending) ||
      (!sharingEnabled && !deletionPending)
    ) {
      setActionError(null);
    }
  }, [sharingEnabled, provisioningPending, deletionPending]);

  const selectAffinity = (selectedAffinity: FriendAffinity) => {
    draftAffinity = selectedAffinity;
    setAffinity(selectedAffinity);
  };

  const runAction = async (
    action: () => Promise<void>,
    errorTitle: string,
  ) => {
    // The disabling state only takes effect on the next render, so a second
    // tap in the same frame would otherwise publish or delete twice.
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setIsWorking(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError({
        title: errorTitle,
        message: getErrorMessage(error),
      });
    } finally {
      setIsWorking(false);
      actionInFlightRef.current = false;
    }
  };

  const handleStopSharing = () => {
    Alert.alert('Stop sharing with friends', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop Sharing',
        style: 'destructive',
        onPress: () =>
          runAction(
            friendProgressWorkflow.disableSharing,
            'Sharing could not be stopped',
          ),
      },
    ]);
  };

  const handleStartSharing = async () => {
    setIsEnablingSharing(true);
    await runAction(
      async () => {
        await friendProgressWorkflow.enableSharing(
          displayName,
          totalMiles,
          affinity,
        );
        showKelly();
      },
      'Sharing could not be started',
    );
    setIsEnablingSharing(false);
  };

  return (
    <>
      <Section style={styles.sharingStatusSection}>
        <StatusBadge
          label={
            isEnablingSharing || provisioningPending
              ? 'Enabling sharing…'
              : 'Sharing enabled'
          }
          inProgress={isEnablingSharing || provisioningPending}
          visible={showSharingStatus}
          reserveSpace
          style={styles.sharingStatus}
        />
        {freshnessLabel && (
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              styles.freshnessLabel,
            ]}
          >
            {freshnessLabel}
          </Text>
        )}
        <View style={styles.formStack}>
          <View style={styles.fieldStack}>
            <Text style={typographyThemed(theme).captionPrimaryBold}>
              First name
            </Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              editable={!isWorking && !provisioningPending && !deletionPending}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={24}
              placeholder="Enter first name"
              placeholderTextColor={theme.colors.textSecondary}
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.divider,
                  color: theme.colors.textPrimary,
                },
              ]}
            />
          </View>

          <View style={styles.fieldStack}>
            <View style={styles.fieldHeader}>
              <Text style={typographyThemed(theme).captionPrimaryBold}>
                Last name
              </Text>
              <Button
                onPress={() => setFantasySurname(generateFantasySurname())}
                variant="outline"
                size="small"
              >
                Generate
              </Button>
            </View>
            <TextInput
              value={fantasySurname}
              onChangeText={setFantasySurname}
              editable={!isWorking && !provisioningPending && !deletionPending}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={24}
              placeholder="Enter last name"
              placeholderTextColor={theme.colors.textSecondary}
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.divider,
                  color: theme.colors.textPrimary,
                },
              ]}
            />
          </View>

          <View style={styles.previewBlock}>
            <Text style={typographyThemed(theme).captionPrimaryBold}>
              Public Hobbit name
            </Text>
            <Text style={typographyThemed(theme).bodyPrimary}>
              {displayName || 'Enter your name'}
            </Text>
          </View>

          <View style={styles.fieldStack}>
            <Text style={typographyThemed(theme).captionPrimaryBold}>
              Where do you hail from?
            </Text>
            <Text style={typographyThemed(theme).captionSecondary}>
              Choose how friends see your map marker.
            </Text>
            <View accessibilityRole="radiogroup" style={styles.affinityOptions}>
              {FRIEND_AFFINITIES.map(option => {
                const selected = affinity === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    disabled={
                      isWorking || provisioningPending || deletionPending
                    }
                    onPress={() => selectAffinity(option)}
                    style={[
                      styles.affinityOption,
                      {
                        borderColor: selected
                          ? getFriendAffinityColor(option, theme)
                          : theme.colors.divider,
                        backgroundColor: theme.colors.surface,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.affinitySwatch,
                        {
                          backgroundColor: getFriendAffinityColor(
                            option,
                            theme,
                          ),
                        },
                      ]}
                    />
                    <Text style={typographyThemed(theme).captionPrimary}>
                      {FRIEND_AFFINITY_LABELS[option]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {actionError && (
            <ErrorMessageBanner
              title={actionError.title}
              message={actionError.message}
            />
          )}

          {deletionPending && !isWorking ? (
            <>
              <Text style={typographyThemed(theme).captionSecondary}>
                Shared data deletion is pending. No progress is being shared.
              </Text>
              <Button
                onPress={() =>
                  runAction(
                    friendProgressWorkflow.retryPendingDeletion,
                    'Sharing could not be stopped',
                  )
                }
                variant="outline"
                disabled={isWorking}
              >
                Retry deletion
              </Button>
            </>
          ) : deletionPending ? (
            <PendingActionPlaceholder />
          ) : provisioningPending && !isWorking ? (
            <View style={styles.actionStack}>
              <Text style={typographyThemed(theme).captionSecondary}>
                Sharing setup is pending. No progress is being shared yet.
              </Text>
              <Button
                onPress={() =>
                  runAction(
                    () =>
                      friendProgressWorkflow.synchronize(
                        totalMiles,
                        fetchParticipants,
                      ),
                    'Sharing setup could not be completed',
                  )
                }
                variant="outline"
                disabled={isWorking}
              >
                Retry setup
              </Button>
            </View>
          ) : provisioningPending ? (
            <PendingActionPlaceholder />
          ) : sharingEnabled ? (
            <View style={styles.actionStack}>
              <Button
                onPress={handleStopSharing}
                variant="outline"
                disabled={isWorking}
              >
                Stop sharing
              </Button>
              {profileChanged && isNameValid && (
                <Button
                  onPress={() =>
                    runAction(
                      () =>
                        friendProgressWorkflow.updateProfile(
                          displayName,
                          affinity,
                        ),
                      'Profile could not be updated',
                    )
                  }
                  variant="brand"
                  disabled={isWorking}
                >
                  Save updates
                </Button>
              )}
            </View>
          ) : (
            <Button
              onPress={handleStartSharing}
              variant="brand"
              disabled={isWorking || !isNameValid}
            >
              Start sharing
            </Button>
          )}
        </View>
      </Section>

      <View style={styles.infoStack}>
        <View>
          <Text
            style={[
              typographyThemed(theme).captionPrimary,
              styles.sectionLabel,
            ]}
          >
            Manage shared data
          </Text>
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              styles.sectionText,
            ]}
          >
            To remove shared data, stop sharing or delete data in{' '}
            <SettingsRef />. Both actions remove your shared data.
          </Text>
        </View>

        <View>
          <Text
            style={[
              typographyThemed(theme).captionPrimary,
              styles.sectionLabel,
            ]}
          >
            Data use
          </Text>
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              styles.sectionText,
            ]}
          >
            When sharing is enabled, your Hobbit name, color, and total journey
            distance are stored securely and shared with other participants so
            they can see your progress and you can see theirs.
          </Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  infoStack: {
    gap: spacing.xl,
    marginTop: spacing.xl,
  },
  sectionLabel: {
    fontWeight: '600',
    textAlign: 'left',
  },
  sectionText: {
    marginTop: spacing.xs,
    textAlign: 'left',
  },
  formStack: {
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  fieldStack: {
    gap: spacing.xs,
  },
  fieldHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  input: {
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  previewBlock: {
    gap: spacing.xs,
  },
  pendingActionPlaceholder: {
    opacity: 0,
  },
  actionStack: {
    gap: spacing.sm,
  },
  sharingStatus: {
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  sharingStatusSection: {
    marginTop: spacing.sm,
  },
  freshnessLabel: {
    alignSelf: 'center',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  affinityOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  affinityOption: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  affinitySwatch: {
    borderRadius: 8,
    height: 16,
    width: 16,
  },
});
