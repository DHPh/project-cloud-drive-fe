import { FolderIcon } from '@heroicons/react/24/outline';

export function BrandIcon({ large = false }: { large?: boolean }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-sm ${large ? 'h-16 w-16 rounded-2xl' : 'h-9 w-9 rounded-lg'}`}>
      <FolderIcon className={large ? 'h-9 w-9' : 'h-6 w-6'} />
    </span>
  );
}
