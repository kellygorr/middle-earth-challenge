import React, { forwardRef } from 'react';
import Button from './Button';
import { useSettingsStore } from '../../stores/settingsStore';
import { useInfoStore } from '../../stores/infoStore';
import { useUIStore } from '../../stores/uiStore';
import { PointType } from '../../types';

interface InfoButtonProps {
  item: PointType;
  type: 'checkpoint' | 'trivia';
}

const InfoButton = forwardRef<any, InfoButtonProps>(
  function InfoButtonComponent({ item, type }: InfoButtonProps, ref) {
    const openModal = useInfoStore(state => state.openModal);
    const isInfoModalOpen = useUIStore(state => state.isModalOpen('info'));
    const labelSize = useSettingsStore(state => state.labelSize);

    // Generate display text based on type
    const getDisplayText = () => {
      const idx = item.index as number | undefined;
      const n = typeof idx === 'number' && idx >= 0 ? idx + 1 : undefined;
      if (type === 'checkpoint') {
        return typeof n === 'number' ? `Checkpoint #${n}` : 'Checkpoint';
      }
      // Trivia button should show the trivia's name
      return item.name || 'Trivia';
    };

    return (
      <Button
        onPress={openModal}
        variant={type === 'trivia' ? 'outline' : 'primary'}
        size="default"
        isMediumText={labelSize === 'large'}
        isOpen={isInfoModalOpen}
        ref={ref as any}
      >
        {getDisplayText()}
      </Button>
    );
  },
);

export default InfoButton;
