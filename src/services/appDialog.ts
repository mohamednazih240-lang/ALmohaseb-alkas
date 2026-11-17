export type AppDialogVariant = 'danger' | 'warning' | 'success' | 'info' | 'error';

export interface AppConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: AppDialogVariant;
}

export interface AppAlertOptions {
  title?: string;
  okText?: string;
  variant?: AppDialogVariant;
}

export interface PendingAppDialog {
  id: number;
  kind: 'confirm' | 'alert';
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  variant: AppDialogVariant;
  resolve: (result: boolean) => void;
}

type DialogListener = (queue: PendingAppDialog[]) => void;

let dialogSeq = 0;
let queue: PendingAppDialog[] = [];
const listeners = new Set<DialogListener>();

function notifyListeners() {
  const snapshot = [...queue];
  listeners.forEach(fn => {
    try {
      fn(snapshot);
    } catch {
      // ignore listener errors
    }
  });
}

export function subscribeAppDialogs(listener: DialogListener): () => void {
  listeners.add(listener);
  listener([...queue]);
  return () => {
    listeners.delete(listener);
  };
}

export function resolveAppDialog(id: number, result: boolean): void {
  const target = queue.find(d => d.id === id);
  if (!target) return;
  queue = queue.filter(d => d.id !== id);
  notifyListeners();
  target.resolve(result);
}

function inferAlertVariant(message: string): AppDialogVariant {
  const msg = message || '';
  if (
    msg.includes('⛔') ||
    msg.includes('خطأ') ||
    msg.includes('عذراً') ||
    msg.includes('لا يمكن') ||
    msg.includes('تعذر') ||
    msg.includes('غير صالح') ||
    msg.includes('غير متوازن') ||
    msg.includes('Rollback')
  ) {
    return 'error';
  }
  if (msg.includes('⚠️') || msg.includes('منع التكرار') || msg.includes('تنبيه') || msg.includes('تحذير')) {
    return 'warning';
  }
  if (msg.includes('✓') || msg.includes('بنجاح')) {
    return 'success';
  }
  return 'info';
}

function inferConfirmVariant(message: string): AppDialogVariant {
  const msg = message || '';
  if (msg.includes('حذف') || msg.includes('نهائياً') || msg.includes('استبدال جميع البيانات') || msg.includes('عكس')) {
    return 'danger';
  }
  if (msg.includes('⚠️') || msg.includes('تحذير') || msg.includes('تنبيه') || msg.includes('إقفال') || msg.includes('إعادة فتح')) {
    return 'warning';
  }
  return 'info';
}

function defaultTitleForVariant(kind: 'confirm' | 'alert', variant: AppDialogVariant): string {
  if (kind === 'confirm') {
    if (variant === 'danger') return 'تأكيد الحذف والإلغاء';
    if (variant === 'warning') return 'تأكيد الإجراء';
    return 'تأكيد العملية';
  }
  if (variant === 'error') return 'تعذر تنفيذ العملية';
  if (variant === 'warning') return 'تنبيه هام';
  if (variant === 'success') return 'تمت العملية بنجاح';
  return 'إشعار النظام';
}

export function appConfirm(message: string, options?: AppConfirmOptions): Promise<boolean> {
  const variant = options?.variant || inferConfirmVariant(message);
  const title = options?.title || defaultTitleForVariant('confirm', variant);
  const confirmText = options?.confirmText || (variant === 'danger' ? 'نعم، تأكيد الحذف' : 'تأكيد وموافقة');
  const cancelText = options?.cancelText || 'إلغاء';

  return new Promise<boolean>(resolve => {
    const id = ++dialogSeq;
    queue = [
      ...queue,
      {
        id,
        kind: 'confirm',
        title,
        message: String(message || ''),
        confirmText,
        cancelText,
        variant,
        resolve
      }
    ];
    notifyListeners();
  });
}

export function appAlert(message: string, options?: AppAlertOptions): Promise<void> {
  const variant = options?.variant || inferAlertVariant(message);
  const title = options?.title || defaultTitleForVariant('alert', variant);
  const okText = options?.okText || 'حسناً';

  return new Promise<void>(resolve => {
    const id = ++dialogSeq;
    queue = [
      ...queue,
      {
        id,
        kind: 'alert',
        title,
        message: String(message || ''),
        confirmText: okText,
        variant,
        resolve: () => resolve()
      }
    ];
    notifyListeners();
  });
}
