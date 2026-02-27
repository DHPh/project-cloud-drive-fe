'use client';

import { createFolder, updateFolder, type FolderSummary } from '@/lib/api';
import { useLocale } from '../providers';
import { ItemNameDialog } from './rename-dialog';

type Props = {
  folder?: FolderSummary;
  parent: string;
  suspended: boolean;
  trigger: HTMLElement | null;
  onDismiss: () => void;
  onExpired: () => void;
  onSaved: () => Promise<void>;
};

export function FolderNameDialog({ folder, parent, suspended, trigger, onDismiss, onExpired, onSaved }: Props) {
  const { text } = useLocale();
  return (
    <ItemNameDialog
      initialName={folder?.name ?? ''} label={text.folderName} requiredMessage={text.folderNameRequired} discardMessage={text.discardFolderName}
      title={folder ? text.renameFolder : text.createFolder} description={folder ? text.renameFolderDescription : text.createFolderDescription}
      submitLabel={folder ? text.save : text.createFolder}
      dialogTestId={folder ? 'folder-rename-dialog' : 'folder-create-dialog'} inputId="folder-name" inputTestId="folder-name-input"
      submitTestId="folder-name-submit" cancelTestId="folder-name-cancel" errorTestId="folder-name-error"
      suspended={suspended} trigger={trigger} onDismiss={onDismiss} onSessionExpired={onExpired} onSaved={onSaved}
      save={(name, signal) => folder ? updateFolder(folder.id, { name }, signal) : createFolder({ name, parentId: parent === 'root' ? null : parent }, signal)}
    />
  );
}
