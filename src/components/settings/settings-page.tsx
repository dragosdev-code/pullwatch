interface SettingsPageProps {
  onClose: () => void;
}

export const SettingsPage = ({ onClose }: SettingsPageProps) => {
  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className=" p-1.5 rounded-lg hover:bg-indigo-100 text-slate-400 hover:text-slate-600 transition-colors duration-200 cursor-pointer"
        aria-label="Close settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
          className="size-5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
      <div className="h-full flex flex-col px-5 pt-4 pb-5">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-0.5">
          <h1 className="text-lg font-bold text-slate-800">Settings</h1>
        </div>
      </div>
    </>
  );
};
