import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Keyboard,
  FlatList,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import { useTheme, useSettingsStore } from '../../../stores/settingsStore';
import { typographyThemed } from '../../../styles/typography';
import { spacing, iconSizes, scrollStyles } from '../../../styles/global';
import Button, { IconButton } from '../../Buttons';
import { useProgressStore } from '../../../stores/progressStore';
import { useUIStore } from '../../../stores/uiStore';
import { EditIcon, ChevronIcon, CloseIcon } from '../../../assets/icons';
import DateStepper from '../DateStepper';
import { DistanceEntry } from '../../../types';
import {
  formatDateLabel,
  formatTime,
  formatDistance,
} from '../../../utils/date';
import EmptyState from '../EmptyState';
import { useScrollIntoView } from '../../../hooks/useScrollIntoView';

// Number of days to load at a time
const DAYS_PER_PAGE = 30;

// Helper to get start of day timestamp
const getStartOfDay = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

// TEST DATA: Generate fake entries for pagination testing
const generateTestEntries = (): DistanceEntry[] => {
  const entries: DistanceEntry[] = [];
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Generate 60 days of fake data (starting from 6 days ago to not overlap with real data)
  for (let dayOffset = 6; dayOffset <= 65; dayOffset++) {
    const baseDate = now - dayOffset * DAY_MS;
    // 1-3 entries per day
    const entriesPerDay = Math.floor(Math.random() * 3) + 1;

    for (let i = 0; i < entriesPerDay; i++) {
      const hourOffset = Math.floor(Math.random() * 12) + 6; // 6am - 6pm
      const entryDate = getStartOfDay(baseDate) + hourOffset * 60 * 60 * 1000;
      entries.push({
        id: `test_${dayOffset}_${i}`,
        saveId: 'default',
        date: entryDate,
        miles: Math.round((Math.random() * 4 + 0.5) * 100) / 100, // 0.5 - 4.5 miles
        source: 'manual',
      });
    }
  }
  return entries;
};

// Cache test entries so they don't regenerate on every render
const TEST_ENTRIES = generateTestEntries();

// Type for grouped day data
interface DayGroup {
  dayKey: number;
  entries: DistanceEntry[];
  totalMiles: number;
}

// Separator between day groups
const DaySeparator = () => <View style={styles.daySeparator} />;

/**
 * MilesContent - FlatList content for the Miles modal.
 * Displays distance entries grouped by day with collapsible sections.
 * Uses pagination to load older days on scroll.
 * Uses uiStore for pending state shared with MilesFooter.
 */
export default function MilesContent() {
  const theme = useTheme();
  const useMiles = useSettingsStore(state => state.useMiles);
  const editInputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList<DayGroup>>(null);

  // Keyboard height state - triggers re-render to add padding for scroll space
  const [keyboardInset, setKeyboardInset] = useState(0);

  // Scroll into view using measureLayout for accurate positioning
  const { registerRef, scrollIntoView, onScroll } = useScrollIntoView<DayGroup>(
    {
      listRef: flatListRef,
    },
  );

  // Listen for keyboard open/close to update padding
  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showListener = Keyboard.addListener(showEvent, e => {
      setKeyboardInset(e.endCoordinates.height);
    });

    const hideListener = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  // Store state
  const distanceEntries = useProgressStore(state => state.distanceEntries);

  // Pending state from uiStore
  const pendingEntries = useUIStore(state => state.pendingEntries);
  const pendingDeletions = useUIStore(state => state.pendingDeletions);
  const editingEntry = useUIStore(state => state.editingEntry);
  const editDate = useUIStore(state => state.editDate);
  const setEditingEntry = useUIStore(state => state.setEditingEntry);
  const updatePendingEntry = useUIStore(state => state.updatePendingEntry);
  const removePendingEntry = useUIStore(state => state.removePendingEntry);
  const markForDeletion = useUIStore(state => state.markForDeletion);

  // Local edit input state
  const [editInput, setEditInput] = useState('');

  // Pagination state
  const [visibleDaysCount, setVisibleDaysCount] = useState(DAYS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Combine and filter entries
  const combinedEntries = useMemo(() => {
    return [
      ...(distanceEntries || []).filter(
        d => !pendingDeletions.some(pd => pd.id === d.id),
      ),
      ...pendingEntries,
      ...TEST_ENTRIES, // TODO: Remove test data after pagination testing
    ];
  }, [distanceEntries, pendingEntries, pendingDeletions]);

  // Group ALL entries by day (newest first) with total miles
  const allDayGroups = useMemo(() => {
    const groups = new Map<
      number,
      { entries: DistanceEntry[]; totalMiles: number }
    >();

    for (const entry of combinedEntries) {
      const dayKey = getStartOfDay(entry.date as number);
      const group = groups.get(dayKey) || { entries: [], totalMiles: 0 };
      group.entries.push(entry);
      group.totalMiles += entry.miles;
      groups.set(dayKey, group);
    }

    // Sort each day's entries by time (newest first for inverted display)
    for (const group of groups.values()) {
      group.entries.sort((a, b) => {
        const ta = a.date as number;
        const tb = b.date as number;
        if (ta !== tb) return tb - ta;
        return String(b.id).localeCompare(String(a.id));
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
        }),
      );
  }, [combinedEntries]);

  // Paginated day groups (only show visibleDaysCount)
  const dayGroups = useMemo(() => {
    return allDayGroups.slice(0, visibleDaysCount);
  }, [allDayGroups, visibleDaysCount]);

  const hasMoreDays = allDayGroups.length > visibleDaysCount;

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

  // Update expanded days when a new most recent day appears
  useEffect(() => {
    if (allDayGroups.length > 0) {
      const mostRecentDay = allDayGroups[0].dayKey;
      setExpandedDays(prev => {
        if (!prev.has(mostRecentDay)) {
          const next = new Set(prev);
          next.add(mostRecentDay);
          return next;
        }
        return prev;
      });
    }
  }, [allDayGroups]);

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

  // Set edit input value when editing starts (autoFocus handles keyboard)
  useEffect(() => {
    if (editingEntry) {
      setEditInput(editingEntry.miles.toString());
    }
  }, [editingEntry]);

  // Scroll to editing entry when keyboard opens (keyboardInset changes)
  useEffect(() => {
    if (!editingEntry) return;
    if (keyboardInset === 0) return; // Wait for keyboard to open

    console.log('[MilesContent] Scroll effect triggered', {
      editingEntryId: editingEntry.id,
      keyboardInset,
    });

    // Wait for editSection to render and layout (it only exists when isEditing is true)
    // Need longer delay because the edit section has to mount first
    const timer = setTimeout(() => {
      scrollIntoView(editingEntry.id, keyboardInset);
    }, 100);

    return () => clearTimeout(timer);
  }, [editingEntry, keyboardInset, scrollIntoView]);

  const startEditing = (item: DistanceEntry) => {
    // Toggle: if already editing this item, cancel
    if (editingEntry?.id === item.id) {
      cancelEditing();
      return;
    }

    // Open edit for this item
    setEditingEntry(item, item.date as number);
    setEditInput(item.miles.toString());
  };

  const cancelEditing = () => {
    setEditingEntry(null);
    setEditInput('');
  };

  const handleDateChange = (newDate: number) => {
    if (!editingEntry) return;
    setEditingEntry(editingEntry, newDate);
  };

  const handleEdit = () => {
    if (!editingEntry || editDate === null) return;
    const newMiles = parseFloat(editInput);
    if (isNaN(newMiles) || newMiles <= 0) return;

    if (String(editingEntry.id).startsWith('pending_')) {
      // Update pending entry
      updatePendingEntry(editingEntry.id, { miles: newMiles, date: editDate });
    } else {
      // For existing entries: mark old for deletion, add new pending with same ID
      markForDeletion(editingEntry);
      const updatedEntry: DistanceEntry = {
        id: editingEntry.id,
        saveId: editingEntry.saveId,
        date: editDate,
        miles: newMiles,
        source: editingEntry.source || 'manual',
      };
      useUIStore.getState().addPendingEntry(updatedEntry);
    }

    cancelEditing();
    Keyboard.dismiss();
  };

  const handleDelete = () => {
    if (!editingEntry) return;

    if (String(editingEntry.id).startsWith('pending_')) {
      removePendingEntry(editingEntry.id);
    } else {
      markForDeletion(editingEntry);
    }

    cancelEditing();
    Keyboard.dismiss();
  };

  if (dayGroups.length === 0) {
    return (
      <EmptyState
        message={`Add ${
          useMiles ? 'miles' : 'kilometers'
        } to get started tracking your journey!\n\nOr start syncing your health data from the Settings screen`}
      />
    );
  }

  const renderEntry = (item: DistanceEntry) => {
    const isEditing = editingEntry?.id === item.id;

    return (
      <View key={item.id}>
        <View style={styles.listItem}>
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
            hitSlop={16}
          />
          <View style={styles.listItemLeft}>
            <View style={styles.titleRow}>
              <Text style={typographyThemed(theme).bodyPrimary}>
                {formatTime(item.date as number)}
              </Text>
              <Text style={typographyThemed(theme).bodyPrimary}>
                {formatDistance(item.miles, true)}
              </Text>
            </View>
            <Text style={typographyThemed(theme).captionSecondary}>
              {item.source === 'health-connect'
                ? 'Health Connect'
                : item.source === 'synced'
                ? 'Synced'
                : 'Manual'}
            </Text>
          </View>
          {isEditing && (
            <IconButton
              icon={
                <CloseIcon
                  size={iconSizes.small}
                  color={theme.colors.textSecondary}
                />
              }
              pressedIcon={
                <CloseIcon
                  size={iconSizes.small}
                  color={theme.colors.textPrimary}
                />
              }
              onPress={cancelEditing}
              variant="transparent"
              hitSlop={12}
            />
          )}
        </View>
        {isEditing && (
          <View style={styles.editSection}>
            <DateStepper
              date={editDate ?? item.date}
              onDateChange={handleDateChange}
            />
            <View
              style={styles.editFieldsRow}
              ref={ref => registerRef(item.id, ref)}
            >
              <TextInput
                ref={editInputRef}
                style={[
                  styles.input,
                  styles.editInputField,
                  {
                    backgroundColor: theme.colors.surface,
                    color: theme.colors.textPrimary,
                    borderWidth: 1,
                    borderColor: theme.colors.divider,
                  },
                ]}
                value={editInput}
                onChangeText={setEditInput}
                keyboardType="numeric"
                autoFocus
                selectTextOnFocus
                disableFullscreenUI={true}
                placeholderTextColor={theme.colors.textSecondary}
              />
              <Text style={typographyThemed(theme).bodyPrimary}>miles</Text>
            </View>
            <View style={styles.editButtonsRow}>
              <Button onPress={handleDelete} variant="primary" size="default">
                Delete
              </Button>
              <Button onPress={handleEdit} variant="brand" size="default">
                Update
              </Button>
            </View>
          </View>
        )}
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
  const ListEndComponent = () => {
    if (isLoadingMore) {
      return (
        <View style={styles.listEndContainer}>
          <Text
            style={[
              typographyThemed(theme).captionSecondary,
              styles.listEndText,
            ]}
          >
            Loading data...
          </Text>
        </View>
      );
    }
    if (hasMoreDays) return null;
    return (
      <View style={styles.listEndContainer}>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.listEndText]}
        >
          — The journey begins —
        </Text>
      </View>
    );
  };

  return (
    <FlatList
      ref={flatListRef}
      data={dayGroups}
      extraData={editingEntry?.id}
      keyExtractor={item => item.dayKey.toString()}
      renderItem={renderDayGroup}
      ItemSeparatorComponent={DaySeparator}
      ListFooterComponent={ListEndComponent}
      style={scrollStyles.scrollView}
      contentContainerStyle={[
        scrollStyles.scrollContent,
        {
          gap: 0,
          paddingBottom: editingEntry ? keyboardInset + spacing.lg : 0,
        },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews={false}
      inverted
      onEndReached={loadMoreDays}
      onEndReachedThreshold={0.5}
      onScroll={e => onScroll(e.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
    />
  );
}

const styles = StyleSheet.create({
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
    paddingVertical: spacing.xs,
  },
  listItemLeft: {
    flexDirection: 'column',
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  editSection: {
    paddingBottom: spacing.sm,
  },
  editFieldsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  editButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  input: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  editInputField: {
    minWidth: 80,
    textAlign: 'right',
    flex: 1,
  },
  listEndContainer: {
    alignItems: 'center',
  },
  listEndText: {
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
