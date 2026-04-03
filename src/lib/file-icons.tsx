import {
  CodeBracketIcon,
  DocumentIcon,
  DocumentTextIcon,
  FilmIcon,
  MusicalNoteIcon,
  PhotoIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';

export const folderIconClasses = 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';

export function getFileIcon(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith('image/')) {
    return {
      Icon: PhotoIcon,
      classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
      tint: 'from-emerald-50/90 to-teal-50/70 dark:from-emerald-950/40 dark:to-slate-900',
    };
  }
  if (normalized.startsWith('video/')) {
    return {
      Icon: FilmIcon,
      classes: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
      tint: 'from-violet-50/90 to-purple-50/70 dark:from-violet-950/40 dark:to-slate-900',
    };
  }
  if (normalized.startsWith('audio/')) {
    return {
      Icon: MusicalNoteIcon,
      classes: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300',
      tint: 'from-fuchsia-50/90 to-pink-50/70 dark:from-fuchsia-950/40 dark:to-slate-900',
    };
  }
  if (normalized.includes('pdf')) {
    return {
      Icon: DocumentTextIcon,
      classes: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300',
      tint: 'from-red-50/90 to-rose-50/70 dark:from-red-950/40 dark:to-slate-900',
    };
  }
  if (normalized.includes('spreadsheet') || normalized.includes('excel') || normalized.includes('csv')) {
    return {
      Icon: TableCellsIcon,
      classes: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
      tint: 'from-teal-50/90 to-emerald-50/70 dark:from-teal-950/40 dark:to-slate-900',
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
      classes: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
      tint: 'from-indigo-50/90 to-blue-50/70 dark:from-indigo-950/40 dark:to-slate-900',
    };
  }
  return {
    Icon: DocumentIcon,
    classes: 'bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300',
    tint: 'from-primary-50/90 to-slate-50/70 dark:from-slate-800/70 dark:to-slate-900',
  };
}
