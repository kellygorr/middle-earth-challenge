import React, {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { useTheme } from '../../stores/settingsStore';
import { spacing, borderRadius } from '../../styles/global';

interface TimeInputProps {
  /** Full timestamp (ms). Only the time portion is mutated. */
  date: number;
  onDateChange: (newDate: number) => void;
}

export interface TimeInputHandle {
  commit: () => number;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Format a timestamp as `H:MM AM/PM` for the input. */
function formatTimeInput(date: number): string {
  const d = new Date(date);
  const h24 = d.getHours();
  const m = d.getMinutes();
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(m)} ${ampm}`;
}

/**
 * Parse a user-typed time string. Accepts flexible variants:
 *   "10:45 AM", "10:45am", "1045 pm", "10:45" (24h), "10" (hour only)
 * Returns { hours24, minutes } on success, or null.
 */
function parseTimeInput(
  raw: string,
): { hours24: number; minutes: number } | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  const meridiemMatch = s.match(/(am|pm)\s*$/);
  const meridiem = meridiemMatch ? meridiemMatch[1] : null;
  const core = meridiemMatch ? s.slice(0, meridiemMatch.index).trim() : s;

  let hours: number;
  let minutes: number;

  if (core.includes(':')) {
    const [hStr, mStr = '0'] = core.split(':');
    hours = parseInt(hStr, 10);
    minutes = parseInt(mStr, 10);
  } else {
    // Compact form like "1045" or "845"
    const digits = core.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length <= 2) {
      hours = parseInt(digits, 10);
      minutes = 0;
    } else {
      hours = parseInt(digits.slice(0, digits.length - 2), 10);
      minutes = parseInt(digits.slice(-2), 10);
    }
  }

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    minutes < 0 ||
    minutes > 59 ||
    hours < 0 ||
    hours > 23
  ) {
    return null;
  }

  if (meridiem) {
    // 12h with AM/PM
    if (hours < 1 || hours > 12) return null;
    let h24 = hours % 12;
    if (meridiem === 'pm') h24 += 12;
    return { hours24: h24, minutes };
  }

  // No meridiem → treat as 24h
  return { hours24: hours, minutes };
}

/**
 * Single text input for editing the time portion of a timestamp.
 * Renders as `H:MM AM/PM`; parses flexibly on blur (or when the user
 * dismisses the keyboard). If input can't be parsed, the field snaps
 * back to the last valid value.
 */
const TimeInput = forwardRef<TimeInputHandle, TimeInputProps>(
  function TimeInput({ date, onDateChange }, ref) {
    const theme = useTheme();
    const [text, setText] = useState(() => formatTimeInput(date));
    const textRef = useRef(text);

    // Reset the field text whenever the source date changes externally
    // (e.g. reset button, opening a different entry).
    useLayoutEffect(() => {
      const formatted = formatTimeInput(date);
      textRef.current = formatted;
      setText(formatted);
    }, [date]);

    const commit = (): number => {
      const parsed = parseTimeInput(textRef.current);
      if (!parsed) {
        // Revert to the last known-good value.
        const formatted = formatTimeInput(date);
        textRef.current = formatted;
        setText(formatted);
        return date;
      }
      const d = new Date(date);
      d.setHours(parsed.hours24, parsed.minutes, 0, 0);
      const nextTs = d.getTime();
      // Normalize the display (e.g. "1045pm" -> "10:45 PM").
      const formatted = formatTimeInput(nextTs);
      textRef.current = formatted;
      setText(formatted);
      if (nextTs !== date) onDateChange(nextTs);
      return nextTs;
    };

    useImperativeHandle(ref, () => ({ commit }));

    return (
      <View style={styles.container}>
        <TextInput
          testID="edit-time-input"
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.surface,
              color: theme.colors.textPrimary,
              borderColor: theme.colors.divider,
            },
          ]}
          value={text}
          onChangeText={value => {
            textRef.current = value;
            setText(value);
          }}
          onBlur={commit}
          onSubmitEditing={commit}
          returnKeyType="done"
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="10:45 AM"
          placeholderTextColor={theme.colors.textSecondary}
        />
      </View>
    );
  },
);

export default TimeInput;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minWidth: 88,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    textAlign: 'center',
  },
});
