/**
 * AccessExpander - A small tappable "Access" toggle that expands to
 * show a status-tagged list of data types or permissions a source
 * will need.
 *
 * Rendered as the `footer` slot of a RadioRow so tapping the expander
 * does not select the radio.
 *
 * Items can be plain strings (rendered with a neutral bullet, no
 * status shown) or `{ label, status }` objects where status is one of:
 *   - 'granted'        → ✓ prefix (permission currently held)
 *   - 'ungranted'      → ○ prefix (permission not held / missing)
 *   - 'unverifiable'   → - prefix (state can't be detected from the
 *                       app, e.g. OEM battery-manager screens); the
 *                       affected label typically carries a trailing
 *                       * that ties it to the footnote
 *   - 'pendingRestart' → ↻ prefix (Health Connect keeps reporting the
 *                       old grants until the app process restarts —
 *                       used after an in-app revoke so the checklist
 *                       reflects the user's intent rather than HC's
 *                       stale answer)
 *
 * `statusFootnotes` maps a status to a footnote line that renders
 * below the list when that status appears in `items`. Multiple
 * footnotes render in the order the statuses appear.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { typographyThemed } from '../../styles/typography';
import { spacing } from '../../styles/global';
import { ChevronIcon } from '../../assets/icons';

export type AccessItemStatus =
  | 'granted'
  | 'ungranted'
  | 'unverifiable'
  | 'pendingRestart';

export interface AccessItem {
  label: string;
  /** Omit for a neutral bullet (no check/dot/star prefix). */
  status?: AccessItemStatus;
}

interface AccessExpanderProps {
  /**
   * Bulleted items. Strings render with a neutral bullet; AccessItem
   * objects render with a status prefix.
   */
  items: (string | AccessItem)[];
  /** Label for the toggle. Defaults to "Required Access". */
  label?: string;
  /**
   * Footnotes shown below the list, one per status present in items.
   * Only statuses that actually appear in the current items render a
   * footnote line, so callers can safely pass copy for every status
   * without worrying about conditional rendering.
   */
  statusFootnotes?: Partial<Record<AccessItemStatus, string>>;
}

// Prefix characters chosen for legibility at caption size in both
// light and dark themes. '○' is the outlined circle for ungranted;
// '-' is a neutral dash for unverifiable rows whose label carries a
// trailing '*' pointing at the footnote; '↻' pairs with the
// pendingRestart footnote.
const PREFIX_BY_STATUS: Record<AccessItemStatus, string> = {
  granted: '✓',
  ungranted: '○',
  unverifiable: '-',
  pendingRestart: '↻',
};

// Order footnotes render in when multiple statuses are present.
// pendingRestart first because it's action-required ("restart me"),
// unverifiable second because it's just informational.
const FOOTNOTE_ORDER: AccessItemStatus[] = [
  'pendingRestart',
  'unverifiable',
  'ungranted',
  'granted',
];

function normalizeItem(item: string | AccessItem): AccessItem {
  return typeof item === 'string' ? { label: item } : item;
}

export default function AccessExpander({
  items,
  label = 'Required Access',
  statusFootnotes,
}: AccessExpanderProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = React.useState(false);

  const normalized = items.map(normalizeItem);
  const presentStatuses = new Set(
    normalized.map(i => i.status).filter((s): s is AccessItemStatus => !!s),
  );
  const activeFootnotes = statusFootnotes
    ? FOOTNOTE_ORDER.filter(
        s => presentStatuses.has(s) && statusFootnotes[s],
      ).map(s => ({ status: s, text: statusFootnotes[s] as string }))
    : [];

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.toggle}
        onPress={() => setExpanded(prev => !prev)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${label}, ${expanded ? 'expanded' : 'collapsed'}`}
        hitSlop={8}
      >
        <View
          style={[styles.chevronWrapper, expanded && styles.chevronExpanded]}
        >
          <ChevronIcon
            direction="right"
            size={14}
            color={theme.colors.textSecondary}
          />
        </View>
        <Text
          style={[typographyThemed(theme).captionSecondary, styles.toggleLabel]}
        >
          {label}
        </Text>
      </Pressable>
      {expanded && (
        <View style={styles.list}>
          {normalized.map(item => (
            <View key={item.label} style={styles.listItem}>
              <Text
                style={[
                  typographyThemed(theme).captionSecondary,
                  styles.prefix,
                ]}
              >
                {item.status ? PREFIX_BY_STATUS[item.status] : '•'}
              </Text>
              <Text style={typographyThemed(theme).captionSecondary}>
                {item.label}
              </Text>
            </View>
          ))}
          {activeFootnotes.map(f => (
            <Text
              key={f.status}
              style={[
                typographyThemed(theme).captionSecondary,
                styles.footnote,
              ]}
            >
              {f.text}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xs,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chevronWrapper: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronExpanded: {
    transform: [{ rotate: '90deg' }],
  },
  toggleLabel: {
    fontWeight: '600',
  },
  list: {
    marginTop: spacing.xs,
    paddingLeft: spacing.sm,
  },
  listItem: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  prefix: {
    width: 12,
    textAlign: 'center',
  },
  footnote: {
    marginTop: spacing.xs,
    fontStyle: 'italic',
    opacity: 0.7,
  },
});
