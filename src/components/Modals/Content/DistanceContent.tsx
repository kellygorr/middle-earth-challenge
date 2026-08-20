import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Animated,
  TextStyle,
} from 'react-native';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { typographyThemed } from '../../../styles/typography';
import {
  spacing,
  iconSizes,
  iconButtonSizes,
  scrollStyles,
} from '../../../styles/global';
import { IconButton } from '../../Buttons';
import { useProgressStore } from '../../../stores/progressStore';
import { useUIStore } from '../../../stores/uiStore';
import { EditIcon, ChevronIcon } from '../../../assets/icons';
import { DistanceEntry } from '../../../types';
import { stepsToMiles } from '../../../utils/stride';
import {
  formatDateLabel,
  formatTime,
  formatDistance,
  getStartOfDay,
} from '../../../utils/date';
import EmptyState from '../EmptyState';
import EditEntryModal from '../EditEntryModal';
import { TrackingOptions } from '../../TrackingOptions';
import { StatusBadge } from '../../StatusBadge';
import { useLivePedometerDelta } from '../../../hooks/useLivePedometerDelta';
import { getDistanceSourceLabel } from '../../../constants/distanceSources';
import { DEFAULT_SAVE_ID } from '../../../constants/gameConstants';

// Number of days to load at a time
const DAYS_PER_PAGE = 30;

// Sentinel id for the synthetic pedometer "live" row shown at the top of
// today's group when the user is in pedometer mode and steps have
// accumulated since the last commit. Rendered via `renderEntry`'s
// in-progress branch so it shares layout with the health-sync
// in-progress row.
const LIVE_ENTRY_ID = '__live__';

/**
 * Convert a stored miles value into the string shown in the edit input,
 * respecting the user's unit preference. Rounded to 2 decimals so km
 * conversions don't produce ugly floats (e.g. 4.023348...).
 */
// (formatEditInputValue moved to EditEntryModal along with the rest of
// the edit UI.)

// Type for grouped day data
interface DayGroup {
  dayKey: number;
  entries: DistanceEntry[];
  totalMiles: number;
  totalSteps: number;
}

// Separator between day groups
const DaySeparator = () => <View style={styles.daySeparator} />;

// Footer rendered at the *top* of the inverted list. Extracted from
// DistanceContent's render body to satisfy `react/no-unstable-nested-components`
// — passing an inline component definition to FlatList's ListFooterComponent
// would remount the subtree on every render.
interface ListEndFooterProps {
  isLoadingMore: boolean;
  hasMoreDays: boolean;
  captionStyle: TextStyle;
}
const ListEndFooter = ({
  isLoadingMore,
  hasMoreDays,
  captionStyle,
}: ListEndFooterProps) => {
  if (isLoadingMore) {
    return (
      <View style={styles.listEndContainer}>
        <Text style={[captionStyle, styles.listEndText]}>Loading data...</Text>
      </View>
    );
  }
  if (hasMoreDays) return null;
  return (
    <View style={styles.listEndContainer}>
      <Text style={[captionStyle, styles.listEndText]}>
        — The journey begins —
      </Text>
    </View>
  );
};

/**
 * DistanceContent - FlatList content for the Distance modal.
 * Displays distance entries grouped by day with collapsible sections.
 * Uses pagination to load older days on scroll.
 * Uses uiStore for pending state shared with MilesFooter.
 *
 * Editing a row opens `EditEntryModal` (rendered as a sibling of this
 * list) rather than expanding inline; this keeps the list steady while
 * the user is editing.
 */
export default function DistanceContent() {
  const theme = useTheme();
  const useMiles = useSettingsStore(state => state.useMiles);
  const syncEnabled = useSettingsStore(state => state.syncEnabled);
  const flatListRef = useRef<FlatList<DayGroup>>(null);

  // Store state
  const distanceEntries = useProgressStore(state => state.distanceEntries);

  const editingEntry = useUIStore(state => state.editingEntry);
  const setEditingEntry = useUIStore(state => state.setEditingEntry);

  // Pagination state
  const [visibleDaysCount, setVisibleDaysCount] = useState(DAYS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Group ALL entries by day (newest first) with total miles / steps
  const allDayGroups = useMemo(() => {
    const groups = new Map<
      number,
      { entries: DistanceEntry[]; totalMiles: number; totalSteps: number }
    >();

    for (const entry of distanceEntries || []) {
      const dayKey = getStartOfDay(entry.date as number);
      const group = groups.get(dayKey) || {
        entries: [],
        totalMiles: 0,
        totalSteps: 0,
      };
      group.entries.push(entry);
      group.totalMiles += entry.miles;
      group.totalSteps += entry.steps ?? 0;
      groups.set(dayKey, group);
    }

    // Sort each day's entries by time (oldest first). The FlatList is
    // inverted so days flow older-at-top / newest-at-bottom; keeping
    // entries within a day in the same direction means the chronology
    // reads coherently across day boundaries (bottom of yesterday =
    // yesterday's newest, top of today = today's oldest).
    for (const group of groups.values()) {
      group.entries.sort((a, b) => {
        const ta = a.date as number;
        const tb = b.date as number;
        if (ta !== tb) return ta - tb;
        return String(a.id).localeCompare(String(b.id));
      });
    }

    // Convert to array sorted by day (newest first)
    return Array.from(groups.entries())
      .sort((a, b) => b[0] - a[0])
      .map(
        ([dayKey, group]): DayGroup => ({
          dayKey,
          entries: group.entries,
          totalMiles: group.totalMiles,
          totalSteps: group.totalSteps,
        }),
      );
  }, [distanceEntries]);

  // Paginated day groups (only show visibleDaysCount)
  const dayGroups = useMemo(() => {
    return allDayGroups.slice(0, visibleDaysCount);
  }, [allDayGroups, visibleDaysCount]);

  const hasMoreDays = allDayGroups.length > visibleDaysCount;

  // Pedometer live delta — steps accumulated since the last commit but
  // not yet rolled up into a persisted range. Shown as a synthetic
  // "live" row at the newest position of today's group whenever
  // pedometer mode is active; the tracker is always "live" regardless
  // of whether new steps have arrived since the last commit, so we
  // render the row even when the delta is zero.
  const trackingMode = useSettingsStore(state => state.trackingMode);
  const liveSteps = useLivePedometerDelta();
  const showLiveRow = trackingMode === 'pedometer' || trackingMode === 'dual';
  const liveMiles = showLiveRow ? stepsToMiles(liveSteps) : 0;

  const dayGroupsWithLive = useMemo(() => {
    if (!showLiveRow) return dayGroups;

    const todayKey = getStartOfDay(Date.now());
    const liveEntry: DistanceEntry = {
      id: LIVE_ENTRY_ID,
      saveId: DEFAULT_SAVE_ID,
      date: Date.now(),
      miles: liveMiles,
      steps: liveSteps,
      source: 'pedometer',
    };

    const groups = [...dayGroups];
    const todayIdx = groups.findIndex(g => g.dayKey === todayKey);
    if (todayIdx === -1) {
      // No committed / pending entries for today yet — prepend a
      // synthetic today group containing only the live row.
      groups.unshift({
        dayKey: todayKey,
        entries: [liveEntry],
        totalMiles: liveMiles,
        totalSteps: liveSteps,
      });
    } else {
      const g = groups[todayIdx];
      groups[todayIdx] = {
        dayKey: g.dayKey,
        // Entries are sorted oldest → newest, so the live "in progress"
        // row sits at the end (newest position).
        entries: [...g.entries, liveEntry],
        totalMiles: g.totalMiles + liveMiles,
        totalSteps: g.totalSteps + liveSteps,
      };
    }
    return groups;
  }, [dayGroups, showLiveRow, liveSteps, liveMiles]);

  // The health-sync ingest path can amend the most-recent row of a
  // health source with fresh totals ([useSyncInterval.ts] ingestRecords).
  // To prevent that from clobbering a user edit, we lock the latest
  // today-row of each health source: no edit button, "In progress"
  // label — same treatment as the pedometer live row. Older rows and
  // yesterday's rows remain editable.
  const inProgressHealthIds = useMemo(() => {
    const ids = new Set<string>();
    const todayKey = getStartOfDay(Date.now());
    const todayGroup = dayGroups.find(g => g.dayKey === todayKey);
    if (!todayGroup) return ids;
    const latestBySource = new Map<string, DistanceEntry>();
    for (const e of todayGroup.entries) {
      if (e.source !== 'apple-health' && e.source !== 'health-connect') {
        continue;
      }
      const cur = latestBySource.get(e.source);
      if (!cur || (e.date as number) > (cur.date as number)) {
        latestBySource.set(e.source, e);
      }
    }
    latestBySource.forEach(e => ids.add(e.id));
    return ids;
  }, [dayGroups]);

  // Track which days are expanded (Set of dayKeys)
  // Most recent day (index 0) starts expanded
  const [expandedDays, setExpandedDays] = useState<Set<number>>(() => {
    if (allDayGroups.length > 0) {
      return new Set([allDayGroups[0].dayKey]);
    }
    return new Set();
  });

  // Animated rotation values for each day's chevron
  const rotationValues = useRef<Map<number, Animated.Value>>(new Map());

  // Get or create rotation value for a day
  const getRotationValue = useCallback(
    (dayKey: number, isExpanded: boolean) => {
      if (!rotationValues.current.has(dayKey)) {
        // Initialize based on current expanded state
        rotationValues.current.set(
          dayKey,
          new Animated.Value(isExpanded ? 1 : 0),
        );
      }
      return rotationValues.current.get(dayKey)!;
    },
    [],
  );

  // Update expanded days when a new most recent day appears — either a
  // freshly committed entry OR the synthetic today group that appears
  // when pedometer live steps arrive before today's first commit.
  useEffect(() => {
    if (dayGroupsWithLive.length > 0) {
      const mostRecentDay = dayGroupsWithLive[0].dayKey;
      setExpandedDays(prev => {
        if (!prev.has(mostRecentDay)) {
          const next = new Set(prev);
          next.add(mostRecentDay);
          return next;
        }
        return prev;
      });
    }
  }, [dayGroupsWithLive]);

  const toggleDay = (dayKey: number) => {
    const isCurrentlyExpanded = expandedDays.has(dayKey);
    const rotationValue = getRotationValue(dayKey, isCurrentlyExpanded);

    // Animate the chevron rotation
    Animated.timing(rotationValue, {
      toValue: isCurrentlyExpanded ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayKey)) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }
      return next;
    });
  };

  // Load more days when scrolling up
  const loadMoreDays = useCallback(() => {
    if (hasMoreDays && !isLoadingMore) {
      setIsLoadingMore(true);
      // Show loading indicator for at least 1 second
      setTimeout(() => {
        setVisibleDaysCount(prev => prev + DAYS_PER_PAGE);
        setIsLoadingMore(false);
      }, 1000);
    }
  }, [hasMoreDays, isLoadingMore]);

  // Editing a row now delegates to `EditEntryModal`. Tapping the pencil
  // simply flips the uiStore's `editingEntry` on; the modal watches
  // that value and mounts itself. Tapping the pencil for an already-
  // open entry closes the modal.
  const startEditing = (item: DistanceEntry) => {
    if (editingEntry?.id === item.id) {
      setEditingEntry(null);
      return;
    }
    setEditingEntry(item, item.date as number);
  };

  // Guard on dayGroupsWithLive (not dayGroups) so pedometer mode always
  // renders the list — the memo prepends a synthetic today group with the
  // live in-progress row whenever trackingMode === 'pedometer', so the
  // empty state only fires for: (a) no source selected, or (b) health-app
  // selected before the first sync lands.
  if (dayGroupsWithLive.length === 0) {
    const unit = useMiles ? 'miles' : 'kilometers';
    const addCopy = `Add ${unit}/steps to get started on your journey`;
    const syncedCopy = `Your health app is connected. ${
      useMiles ? 'Miles' : 'Kilometers'
    } will appear here as they sync (~5 minutes when live sync is enabled).`;

    const orSeparator = (
      <Text
        style={[
          typographyThemed(theme).captionSecondary,
          styles.emptyStateText,
        ]}
      >
        — or —
      </Text>
    );
    const syncRow = (
      <TrackingOptions
        showAddOption={false}
        showDevToggle={false}
        onOpenSyncModal={() =>
          useUIStore.getState().pushModal({ type: 'sync' })
        }
      />
    );
    const addText = (
      <Text
        style={[typographyThemed(theme).bodySecondary, styles.emptyStateText]}
      >
        {addCopy}
      </Text>
    );

    // Two empty states with different ordering:
    //   - Sync OFF: lead with manual entry ("add miles"), offer sync below
    //     as the alternative.
    //   - Sync ON:  lead with "you're synced, go walk", repeat the sync row
    //     so the user can manage it from here, then offer manual entry as
    //     the alternative.
    return (
      <EmptyState
        message={
          <Text
            style={[
              typographyThemed(theme).bodySecondary,
              styles.emptyStateText,
            ]}
          >
            {syncEnabled ? syncedCopy : addCopy}
          </Text>
        }
      >
        {syncEnabled ? (
          <>
            {syncRow}
            {orSeparator}
            {addText}
          </>
        ) : (
          <>
            {orSeparator}
            {syncRow}
          </>
        )}
      </EmptyState>
    );
  }

  // Synthetic pedometer "live" row and the latest today-row of a
  // health source are both rendered as "In progress" via `renderEntry`
  // below — no edit button, source label caption, real miles/steps on
  // the right. The only per-source difference is the caption text.
  const renderEntry = (item: DistanceEntry) => {
    const isLivePedometer = item.id === LIVE_ENTRY_ID;
    const inProgress = isLivePedometer || inProgressHealthIds.has(item.id);
    const sourceLabel = getDistanceSourceLabel(item.source);
    return (
      <View key={item.id}>
        <View style={styles.listItem}>
          {inProgress ? (
            // Uneditable: sync may still amend this row today. Spacer
            // keeps columns aligned with edit-capable rows.
            <View style={styles.liveIconSpacer} />
          ) : (
            <IconButton
              icon={
                <EditIcon
                  size={iconSizes.medium}
                  color={theme.colors.textSecondary}
                />
              }
              pressedIcon={
                <EditIcon
                  size={iconSizes.medium}
                  color={theme.colors.textPrimary}
                />
              }
              onPress={() => startEditing(item)}
              variant="transparent"
              size="small"
              hitSlop={16}
            />
          )}
          <View style={styles.listItemLeft}>
            {inProgress ? (
              <StatusBadge
                label="In progress"
                inProgress
                style={styles.entryStatusBadge}
              />
            ) : (
              <Text
                style={[typographyThemed(theme).bodyPrimary, styles.entryTime]}
              >
                {formatTime(item.date as number)}
              </Text>
            )}
            <Text
              style={[
                typographyThemed(theme).captionSecondary,
                inProgress ? styles.liveCaption : styles.entryCaption,
              ]}
            >
              {sourceLabel}
            </Text>
          </View>
          <View style={styles.entryValue}>
            <Text style={typographyThemed(theme).bodyPrimary}>
              {formatDistance(item.miles, {
                includeUnits: true,
                useMiles,
                // In-progress rows report feet/meters even at 0 and even
                // after crossing a full unit, so a walker sees numbers
                // move meaningfully instead of "0 mi" holding forever.
                forceSmallUnit: inProgress,
              })}
            </Text>
            <Text
              style={[
                typographyThemed(theme).captionSecondary,
                styles.entryStepsCaption,
              ]}
            >
              {item.steps.toLocaleString()} steps
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderDayGroup = ({ item }: { item: DayGroup }) => {
    const isExpanded = expandedDays.has(item.dayKey);
    const rotationValue = getRotationValue(item.dayKey, isExpanded);

    const rotateStyle = {
      transform: [
        {
          rotate: rotationValue.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '90deg'],
          }),
        },
      ],
    };

    return (
      <View>
        <Pressable
          style={styles.dayHeader}
          onPress={() => toggleDay(item.dayKey)}
        >
          <Animated.View style={rotateStyle}>
            <ChevronIcon
              direction="right"
              size={iconSizes.medium}
              color={theme.colors.textSecondary}
            />
          </Animated.View>
          <View style={styles.dayHeaderContent}>
            <Text style={typographyThemed(theme).bodyPrimary}>
              {formatDateLabel(item.dayKey)}
            </Text>
            <Text style={typographyThemed(theme).bodyPrimary}>
              {formatDistance(item.totalMiles, true)}
              {' / '}
              {item.totalSteps.toLocaleString()} steps
            </Text>
          </View>
        </Pressable>
        {isExpanded && (
          <View style={styles.entriesContainer}>
            {item.entries.map((entry, index) => (
              <View key={entry.id}>
                {index > 0 && <View style={styles.separator} />}
                {renderEntry(entry)}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  // Footer component shown when all days are loaded (appears at top in inverted list)
  const listEndFooter = (
    <ListEndFooter
      isLoadingMore={isLoadingMore}
      hasMoreDays={hasMoreDays}
      captionStyle={typographyThemed(theme).captionSecondary}
    />
  );

  return (
    <>
      <FlatList
        ref={flatListRef}
        data={dayGroupsWithLive}
        extraData={`${editingEntry?.id ?? ''}|${liveSteps}`}
        keyExtractor={item => item.dayKey.toString()}
        renderItem={renderDayGroup}
        ItemSeparatorComponent={DaySeparator}
        ListFooterComponent={listEndFooter}
        style={scrollStyles.scrollView}
        contentContainerStyle={[
          scrollStyles.scrollContent,
          styles.invertedListContent,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        inverted
        onEndReached={loadMoreDays}
        onEndReachedThreshold={0.5}
        scrollEventThrottle={16}
      />
      <EditEntryModal />
    </>
  );
}

const styles = StyleSheet.create({
  emptyStateText: {
    textAlign: 'center',
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  dayHeaderContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entriesContainer: {},
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  listItemLeft: {
    flexDirection: 'column',
    flex: 1,
  },
  entryStatusBadge: {
    alignSelf: 'flex-start',
  },
  liveIconSpacer: {
    width: iconButtonSizes.small,
    height: iconButtonSizes.small,
  },
  liveCaption: {
    marginTop: spacing.xs,
  },
  // The default body / caption line-heights (28 / 24) leave ~11px of
  // built-in whitespace between the two lines. Tighten them on this
  // specific row so the time and source label sit closer together.
  entryTime: {
    lineHeight: 20,
  },
  entryCaption: {
    lineHeight: 18,
  },
  entryValue: {
    alignItems: 'flex-end',
  },
  entryStepsCaption: {
    lineHeight: 18,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  daySeparator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    marginVertical: spacing.xs,
  },
  listEndContainer: {
    alignItems: 'center',
  },
  listEndText: {
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // The list is `inverted` (rotated 180°) so it stays anchored at the newest
  // entry. Without flexGrow, short content pins to the bottom of the viewport;
  // with flexGrow + inverted-flex-end the rows appear top-aligned as the user
  // expects. `gap: 0` overrides scrollStyles.scrollContent's default gap.
  invertedListContent: {
    gap: 0,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
});
