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
      if (type === 'checkpoint') {
        // Show location name for checkpoints
        return item.name || 'Checkpoint';
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
