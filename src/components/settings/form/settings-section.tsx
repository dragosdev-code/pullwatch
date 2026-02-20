interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

export const SettingsSection = ({ title, children }: SettingsSectionProps) => {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 px-1">
        {title}
      </p>
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col gap-3">{children}</div>
    </div>
  );
};
