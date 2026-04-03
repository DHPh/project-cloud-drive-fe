export function BrandIcon({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-primary-600 to-indigo-600 text-white shadow-sm ${large ? 'h-16 w-16 rounded-2xl' : 'h-9 w-9 rounded-xl'}`}
    >
      <svg viewBox="0 0 32 32" fill="none" className={large ? 'h-10 w-10' : 'h-6 w-6'}>
        <path
          d="M7.5 22.5h16.2a4.3 4.3 0 0 0 .75-8.53A6.6 6.6 0 0 0 11.4 11.9a5.1 5.1 0 0 0-3.9 10.6Z"
          fill="currentColor"
          fillOpacity="0.94"
        />
        <path
          d="M16 14v6.2m0 0-2.4-2.4M16 20.2l2.4-2.4"
          stroke="#1d4ed8"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
