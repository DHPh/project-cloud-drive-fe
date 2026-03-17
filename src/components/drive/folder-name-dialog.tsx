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
  onSaved: (folder: FolderSummary) => Promise<void>;
};

export function FolderNameDialog({ folder, parent, suspended, trigger, onDismiss, onExpired, onSaved }: Props) {
  const { text } = useLocale();
  return (
    <ItemNameDialog
      initialName={folder?.name ?? ''} label={text.folderName} requiredMessage={text.folderNameRequired} discardMessage={text.discardFolderName}
      title={folder ? text.editFolderInfo : text.createFolder} description={folder ? text.editFolderInfoDescription : text.createFolderDescription}
      submitLabel={folder ? text.save : text.createFolder}
      descriptionField={{ label: text.folderDescription, initialValue: folder?.description ?? '' }}
      dialogTestId={folder ? 'folder-rename-dialog' : 'folder-create-dialog'} inputId="folder-name" inputTestId="folder-name-input"
      submitTestId="folder-name-submit" cancelTestId="folder-name-cancel" errorTestId="folder-name-error"
      suspended={suspended} trigger={trigger} onDismiss={onDismiss} onSessionExpired={onExpired} onSaved={onSaved}
      save={(name, signal, description) => folder
        ? updateFolder(folder.id, { ...(name === folder.name ? {} : { name }), description }, signal)
        : createFolder({ name, parentId: parent === 'root' ? null : parent, description }, signal)}
    />
  );
}
