import { TitleParticleCanvas } from './TitleParticleCanvas';
import { RefreshButton } from './RefreshButton';

interface HeaderProps {
  prCount: number;
  isLoading: boolean;
  showTitleParticles: boolean;
  onRefresh: () => void;
  onTitleParticlesComplete: () => void;
}

export const Header = ({
  prCount,
  isLoading,
  showTitleParticles,
  onRefresh,
  onTitleParticlesComplete,
}: HeaderProps) => {
  return (
    <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 relative">
      {/* Title particle canvas */}
      {showTitleParticles && <TitleParticleCanvas onComplete={onTitleParticlesComplete} />}

      <div className="flex items-center">
        <h1 className="text-base font-semibold text-gray-900">Github Live Review</h1>
        <span className="ml-2 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-full">
          {prCount}
        </span>
      </div>

      <RefreshButton isLoading={isLoading} onRefresh={onRefresh} />
    </div>
  );
};
