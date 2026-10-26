/**
 * `isOemBatteryOffender` — true when the given manufacturer string
 * (from `pedometerService.getEnvironment().manufacturer`, lowercased
 * caller-side or here) ships an aggressive battery manager that will
 * silently kill our foreground step-counter service, requiring the
 * user to whitelist us in a manufacturer-specific settings screen.
 *
 * Used to add a "Battery settings" bullet to the pedometer radio's
 * Required Access list on affected devices only — on stock Android /
 * Pixel / Motorola / Nokia the OS respects the standard battery-
 * optimization allowlist and no extra action is needed.
 *
 * Offender list mirrors the switch in
 * `PedometerModule.openOemBatterySettings` and is sourced from the
 * community-maintained https://dontkillmyapp.com reference.
 *
 * In `__DEV__` builds only, "google" (Pixel) is treated as an offender
 * so we can preview the UI on Pixel dev hardware. Metro strips this
 * branch in production bundles.
 */
export function isOemBatteryOffender(rawManufacturer: string): boolean {
  const m = (rawManufacturer || '').toLowerCase();

  if (m.includes('samsung')) return true;
  if (m.includes('xiaomi') || m.includes('redmi') || m.includes('poco'))
    return true;
  if (m.includes('huawei') || m.includes('honor')) return true;
  if (m.includes('oneplus')) return true;
  if (m.includes('oppo') || m.includes('realme')) return true;
  if (m.includes('vivo')) return true;

  if (__DEV__ && m.includes('google')) return true;

  return false;
}

/**
 * True when the "affected" classification for the given manufacturer is
 * only coming from the __DEV__ Pixel preview branch. Lets the UI tag
 * dev-only rows so they're visibly distinct from the real offender
 * copy (Samsung / Xiaomi / etc.).
 */
export function isOemBatteryDevPreview(rawManufacturer: string): boolean {
  const m = (rawManufacturer || '').toLowerCase();
  return __DEV__ && m.includes('google');
}

/**
 * True on stock-Google (Pixel) hardware. Used to conditionally show
 * Pixel-specific navigation hints in the pedometer permission alerts
 * — the "App battery usage → Allow background usage → Unrestricted"
 * screen is a well-documented Pixel quirk where the parent-level
 * toggle is cosmetic and the actual bit only flips via the drilled-in
 * radio group. See:
 *   https://stackoverflow.com/questions/78880281
 */
export function isPixelDevice(rawManufacturer: string): boolean {
  return (rawManufacturer || '').toLowerCase().includes('google');
}

/**
 * Copy for the post-connect follow-up prompt on offender OEMs. Frames
 * the OEM battery step as the next dialog in the permission sequence
 * (matching stock Android's own "Allow to run in the background?" tone)
 * rather than as an extra chore.
 *
 * Returns `null` for non-offender manufacturers so callers can gate
 * the prompt with a single truthy check.
 */
export interface OemBatteryPromptCopy {
  title: string;
  body: string;
}

export interface OemBatteryGuidance {
  problem: string;
  solution: string;
}

export function getOemBatteryGuidance(
  rawManufacturer: string,
): OemBatteryGuidance {
  const m = (rawManufacturer || '').toLowerCase();

  if (m.includes('samsung')) {
    return {
      problem:
        "Samsung's Device Care can put apps to sleep, which can stop step tracking.",
      solution:
        'In Sync settings, open Battery settings and add Middle Earth Challenge to Never auto sleeping apps.',
    };
  }

  if (m.includes('xiaomi') || m.includes('redmi') || m.includes('poco')) {
    return {
      problem: 'MIUI can block background activity and stop step tracking.',
      solution:
        'In Sync settings, open Battery settings and enable autostart for Middle Earth Challenge.',
    };
  }

  if (m.includes('huawei') || m.includes('honor')) {
    return {
      problem:
        'Huawei can close background apps and stop step tracking within about an hour.',
      solution:
        'In Sync settings, open Battery settings and add Middle Earth Challenge to Protected apps.',
    };
  }

  if (
    m.includes('oneplus') ||
    m.includes('oppo') ||
    m.includes('realme') ||
    m.includes('vivo')
  ) {
    return {
      problem:
        "Your phone's battery manager can pause step tracking in the background.",
      solution:
        'In Sync settings, open Battery settings and allow Middle Earth Challenge to run in the background.',
    };
  }

  if (__DEV__ && m.includes('google')) {
    return {
      problem:
        '[DEV PREVIEW] Pixel is not actually affected by this OEM battery issue.',
      solution:
        'This guidance is shown only so the OEM recovery UI can be previewed on development hardware.',
    };
  }

  return {
    problem:
      "Your phone's battery manager may have stopped step tracking in the background.",
    solution:
      'Open Sync settings and check the background activity and battery settings.',
  };
}

export function getOemBatteryPromptCopy(
  rawManufacturer: string,
): OemBatteryPromptCopy | null {
  const m = (rawManufacturer || '').toLowerCase();

  if (!isOemBatteryOffender(m)) return null;

  const guidance = getOemBatteryGuidance(m);
  return {
    title: 'Allow background activity',
    body: `${guidance.problem} ${guidance.solution}`,
  };
}
