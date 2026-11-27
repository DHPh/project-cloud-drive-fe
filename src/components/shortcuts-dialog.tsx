'use client';

import { useRef } from 'react';
import { Overlay } from './overlay';
import { useLocale } from './providers';

type Props = {
  open: boolean;
  onDismiss: () => void;
  restoreFocus?: HTMLElement | null;
};

export function ShortcutsDialog({ open, onDismiss, restoreFocus }: Props) {
  const { locale, text } = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);
  const vi = locale === 'vi';

  const shortcuts: Array<[string, string]> = vi
    ? [
        ['Mở Command Palette', 'Ctrl+K hoặc /'],
        ['Xem nhanh tệp đang chọn', 'Space'],
        ['Mở mục đang chọn', 'Enter'],
        ['Đổi tên mục đang chọn', 'F2'],
        ['Chia sẻ & Mã QR', 'S'],
        ['Di chuyển tới…', 'M'],
        ['Tải xuống tệp đang chọn', 'D'],
        ['Đưa vào Thùng rác', 'Delete'],
        ['Tạo thư mục mới', 'Shift+N'],
        ['Tải tệp lên / Dán tệp', 'U · Ctrl+V'],
        ['Đổi Lưới ↔ Danh sách', 'V'],
        ['Bật/tắt thanh chi tiết bên phải', 'I'],
        ['Chọn tất cả / Bỏ chọn', 'Ctrl+A · Esc'],
        ['Đi tới Drive / Dòng thời gian / Thùng rác', 'G rồi D / T / X'],
        ['Đi tới Chia sẻ / Bảng / Tài khoản / Quản trị', 'G rồi S / O / B / A'],
      ]
    : [
        ['Open Command Palette', 'Ctrl+K or /'],
        ['Quick preview selected file', 'Space'],
        ['Open selected item', 'Enter'],
        ['Rename selected item', 'F2'],
        ['Share & QR code', 'S'],
        ['Move to…', 'M'],
        ['Download selected file', 'D'],
        ['Move to Trash', 'Delete'],
        ['Create new folder', 'Shift+N'],
        ['Upload files / Paste file', 'U · Ctrl+V'],
        ['Toggle Grid / List view', 'V'],
        ['Toggle right details panel', 'I'],
        ['Select all / Clear selection', 'Ctrl+A · Esc'],
        ['Go to Drive / Timeline / Trash', 'G then D / T / X'],
        ['Go to Shared / Boards / Account / Admin', 'G then S / O / B / A'],
      ];

  if (!open) return null;

  return (
    <Overlay
      open={open}
      testId="shortcuts-dialog"
      title={vi ? 'Phím tắt & Macro' : 'Keyboard shortcuts & Macros'}
      description={vi ? 'Dùng bàn phím để điều hướng và thao tác nhanh trên Cloud Drive.' : 'Use your keyboard to navigate and act faster across Cloud Drive.'}
      onDismiss={onDismiss}
      initialFocus={closeRef}
      restoreFocus={restoreFocus}
    >
      <div className="min-h-0 space-y-2.5 overflow-y-auto ux-scroll-contain p-5 sm:p-6">
        <div className="grid gap-2 sm:grid-cols-2">
          {shortcuts.map(([label, keys]) => (
            <div
              key={label}
              className="flex items-start justify-between gap-2.5 rounded-lg border border-line bg-surface-subtle px-3 py-2 text-xs"
            >
              <span className="leading-snug text-ink-secondary">{label}</span>
              <kbd className="kbd-chip">{keys}</kbd>
            </div>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 justify-end border-t border-line px-5 py-3 sm:px-6">
        <button ref={closeRef} type="button" className="button button-primary min-h-10" onClick={onDismiss}>
          {text.close}
        </button>
      </div>
    </Overlay>
  );
}
