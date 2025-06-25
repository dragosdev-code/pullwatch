import { RefreshButton } from './RefreshButton';
import { useDebug } from '../hooks';

interface HeaderProps {
  prCount: number;
  isLoading: boolean;
  onRefresh: () => void;
}

export const Header = ({ prCount, isLoading, onRefresh }: HeaderProps) => {
  const { handleGithubClick, isDebugPending } = useDebug();

  return (
    <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 relative">
      <div className="flex items-center">
        <h1 className="text-base font-semibold text-gray-900">
          <button
            onClick={handleGithubClick}
            className={`transition-all duration-200 ${
              isDebugPending
                ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white px-2 py-1 rounded-md shadow-md hover:shadow-lg transform hover:scale-105'
                : ''
            }`}
            title={isDebugPending ? 'Click once more to enable debug mode' : 'Github Live Review'}
          >
            {isDebugPending ? '🔧 Debug Ready' : 'Github'}
          </button>
          {!isDebugPending && ' Live Review'}
        </h1>
        <span className="ml-2 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-full">
          {prCount}
        </span>
      </div>

      <RefreshButton isLoading={isLoading} onRefresh={onRefresh} />
    </div>
  );
};
