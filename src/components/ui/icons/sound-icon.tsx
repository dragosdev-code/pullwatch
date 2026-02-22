import type { NotificationSound } from '../../../../extension/common/types';
import { getSoundDefinition } from '../../../../extension/common/sound-config';
import { MuteIcon } from './mute-icon';
import { BellIcon } from './bell-icon';
import { WaveIcon } from './wave-icon';

interface SoundIconProps {
  sound: NotificationSound;
  className?: string;
}

export const SoundIcon = ({ sound, className = 'size-4' }: SoundIconProps) => {
  const definition = getSoundDefinition(sound);

  if (!definition || definition.icon === 'mute') {
    return <MuteIcon className={className} />;
  }

  if (definition.icon === 'bell') {
    return <BellIcon className={className} />;
  }

  // Wave/sound icon (default for ping)
  return <WaveIcon className={className} />;
};
