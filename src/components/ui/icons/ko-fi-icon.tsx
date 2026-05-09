interface KoFiIconProps {
  className?: string;
}

export const KoFiIcon = ({ className = 'size-4' }: KoFiIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 11h12v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4Z" />
      <path d="M16 12h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M7 7c.6-.8.6-1.7 0-2.5" />
      <path d="M10.5 7c.6-.8.6-1.7 0-2.5" />
      <path d="M14 7c.6-.8.6-1.7 0-2.5" />
    </svg>
  );
};
