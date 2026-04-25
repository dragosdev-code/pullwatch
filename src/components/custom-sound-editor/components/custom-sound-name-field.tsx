import { useFormContext } from 'react-hook-form';
import { MAX_CUSTOM_SOUND_NAME_LENGTH } from '@common/constants';
import { validateCustomSoundName } from '@common/custom-sound-name';
import type { SoundNameForm } from '../types';

interface CustomSoundNameFieldProps {
  disabled: boolean;
  existingNames: string[];
}

export const CustomSoundNameField = ({ disabled, existingNames }: CustomSoundNameFieldProps) => {
  const {
    register,
    formState: { errors },
  } = useFormContext<SoundNameForm>();

  return (
  <div className="form-control">
    <label className="label py-1" htmlFor="custom-sound-name">
      <span className="label-text text-xs">Sound name</span>
    </label>
    <input
      id="custom-sound-name"
      type="text"
      maxLength={MAX_CUSTOM_SOUND_NAME_LENGTH}
      autoComplete="off"
      placeholder="My notification sound"
      disabled={disabled}
      className={`input input-bordered input-sm w-full ${errors.soundName ? 'input-error' : ''}`}
      {...register('soundName', {
        validate: (value) => {
          const result = validateCustomSoundName(value, { existingNames });
          return result.ok || result.message;
        },
      })}
    />
    <p className="text-[11px] text-base-content/50 mt-1 px-0.5">
      Letters, numbers, spaces, and . , - &apos; &middot; max {MAX_CUSTOM_SOUND_NAME_LENGTH}{' '}
      characters
    </p>
    {errors.soundName && (
      <p className="text-error text-xs mt-1 px-0.5" role="alert">
        {errors.soundName.message}
      </p>
    )}
  </div>
  );
};
