import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardOffset(initialOffset: number = 20) {
  const [keyboardOffset, setKeyboardOffset] = useState(initialOffset);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => {
        const kbHeight = e?.endCoordinates?.height ?? 0;
        setKeyboardOffset(kbHeight + initialOffset);
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardOffset(initialOffset),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [initialOffset]);

  return keyboardOffset;
}
