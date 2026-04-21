interface ThemeSwatchProps {
  name: string;
  isActive: boolean;
}

export const ThemeSwatch = ({ name, isActive }: ThemeSwatchProps) => (
  <div
    data-theme={name}
    className={`
      relative overflow-hidden rounded shrink-0
      w-8 h-6
      bg-base-100 shadow-sm
      transition-all duration-200
      ${isActive ? 'ring-2 ring-inset ring-primary' : 'ring-1 ring-inset ring-black/5'}
    `}
  >
    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />

    <div className="absolute inset-0 flex items-center justify-center gap-0.5 pl-1">
      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
      <div className="w-1.5 h-1.5 rounded-full bg-secondary" />
      <div className="w-1.5 h-1.5 rounded-full bg-accent" />
    </div>
  </div>
);
