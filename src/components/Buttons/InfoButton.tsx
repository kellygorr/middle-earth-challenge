import React, { forwardRef } from 'react';
import { Pressable } from 'react-native';
import Button from './Button';
import { useSettingsStore } from '../../stores/settingsStore';
import { useInfoStore } from '../../stores/infoStore';
import { PointType } from '../../types';

interface InfoButtonProps {
  item: PointType;
  type: 'checkpoint' | 'trivia';
  checkpointIndex?: number; // For checkpoint numbering
}

const InfoButton = forwardRef<
  React.ElementRef<typeof Pressable>,
  InfoButtonProps
>(function InfoButton({ item, type, checkpointIndex }: InfoButtonProps, ref) {
  const { openModal, isModalVisible } = useInfoStore();
  const labelSize = useSettingsStore(state => state.labelSize);

  // Generate display text based on type
  const getDisplayText = () => {
    if (type === 'checkpoint') {
      const checkpointNumber =
        checkpointIndex !== undefined ? checkpointIndex + 1 : 1;
      return `Checkpoint #${checkpointNumber}`;
    } else {
      return item.name;
    }
  };

  return (
    <Button
      onPress={openModal}
      variant={type === 'trivia' ? 'outline' : 'primary'}
      size="default"
      isMediumText={labelSize === 'large'}
      isOpen={isModalVisible}
      ref={ref as any}
    >
      {getDisplayText()}
    </Button>
  );
});

export default InfoButton;
