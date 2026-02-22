import { GearIcon } from '../ui/icons';

export const OpenSettingsButton = () => {
  return (
    <button className="absolute bottom-0 right-0 text-gray-500 hover:cursor-pointer hover:scale-105">
      <GearIcon className="size-6" />
    </button>
  );
};
