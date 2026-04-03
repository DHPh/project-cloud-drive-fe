import {
  CodeBracketIcon,
  DocumentIcon,
  DocumentTextIcon,
  FilmIcon,
  MusicalNoteIcon,
  PhotoIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';

export const folderIconClasses = 'bg-amber-500/15 text-amber-700 dark:text-amber-400';

export function getFileIcon(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith('image/')) {
    return {
      Icon: PhotoIcon,
      classes: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
      tint: 'from-emerald-500/10 to-teal-500/5 dark:from-emerald-500/15 dark:to-transparent',
    };
  }
  if (normalized.startsWith('video/')) {
    return {
      Icon: FilmIcon,
      classes: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
      tint: 'from-purple-500/10 to-violet-500/5 dark:from-purple-500/15 dark:to-transparent',
    };
  }
  if (normalized.startsWith('audio/')) {
    return {
      Icon: MusicalNoteIcon,
      classes: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
      tint: 'from-fuchsia-500/10 to-pink-500/5 dark:from-fuchsia-500/15 dark:to-transparent',
    };
  }
  if (normalized.includes('pdf')) {
    return {
      Icon: DocumentTextIcon,
      classes: 'bg-red-500/15 text-red-700 dark:text-red-400',
      tint: 'from-red-500/10 to-rose-500/5 dark:from-red-500/15 dark:to-transparent',
    };
  }
  if (normalized.includes('spreadsheet') || normalized.includes('excel') || normalized.includes('csv')) {
    return {
      Icon: TableCellsIcon,
      classes: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
      tint: 'from-teal-500/10 to-emerald-500/5 dark:from-teal-500/15 dark:to-transparent',
    };
  }
  if (
    normalized.startsWith('text/') ||
    normalized.includes('json') ||
    normalized.includes('javascript') ||
    normalized.includes('typescript') ||
    normalized.includes('yaml') ||
    normalized.includes('xml')
  ) {
    return {
      Icon: CodeBracketIcon,
      classes: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
      tint: 'from-indigo-500/10 to-blue-500/5 dark:from-indigo-500/15 dark:to-transparent',
    };
  }
  return {
    Icon: DocumentIcon,
    classes: 'bg-accent-soft text-accent-text',
    tint: 'from-accent-soft to-transparent',
  };
}
