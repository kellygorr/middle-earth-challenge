import React, { forwardRef } from 'react';
import { Pressable } from 'react-native';
import Button from './Button';
import { useSettingsStore } from '../../stores/settingsStore';
import { useInfoStore } from '../../stores/infoStore';
import { useUIStore } from '../../stores/uiStore';
import { PointType } from '../../types';

interface InfoButtonProps {
  item: PointType;
  type: 'checkpoint' | 'trivia';
}

const InfoButton = forwardRef<
  React.ElementRef<typeof Pressable>,
  InfoButtonProps
>(function InfoButtonComponent({ item, type }: InfoButtonProps, ref) {
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
      size={
        labelSize === 'small'
          ? 'small'
          : labelSize === 'large'
          ? 'large'
          : 'default'
      }
      textSize={
        labelSize === 'small'
          ? 'small'
          : labelSize === 'large'
          ? 'large'
          : 'default'
      }
      isOpen={isInfoModalOpen}
      isLabelButton
      ref={ref}
    >
      {getDisplayText()}
    </Button>
  );
});

export default InfoButton;
