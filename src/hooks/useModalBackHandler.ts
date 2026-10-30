import { useEffect, useRef } from 'react';

/**
 * Global stack of active modal IDs.
 * Guarantees that only the topmost modal responds to the phone back button,
 * and closing an inner modal via its UI 'x' button NEVER triggers parent
 * modals or exits the invoice editor!
 */
interface ModalStackEntry {
  id: string;
  onClose: () => void;
}

const modalStack: ModalStackEntry[] = [];
let isSilentPop = false;
let globalPopListenerAttached = false;

function ensureGlobalListener() {
  if (globalPopListenerAttached || typeof window === 'undefined') return;
  globalPopListenerAttached = true;

  window.addEventListener('popstate', (e) => {
    // If this pop was triggered programmatically to clean up a closed modal, ignore it completely
    if (isSilentPop) {
      isSilentPop = false;
      return;
    }

    // Only close the topmost modal on the stack!
    if (modalStack.length > 0) {
      const top = modalStack.pop();
      if (top && typeof top.onClose === 'function') {
        top.onClose();
      }
    }
  });
}

/**
 * Custom hook to intercept mobile browser & hardware back button (popstate)
 * Safely manages sub-modals without accidental parent unmounting.
 */
export function useModalBackHandler(
  isOpen: boolean,
  onClose: () => void,
  modalId: string = 'modal'
) {
  const isPushedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    ensureGlobalListener();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      // Modal was closed via UI (e.g. clicking 'x' or cancel button)
      const stackIdx = modalStack.findIndex(m => m.id === modalId);
      if (stackIdx !== -1) {
        modalStack.splice(stackIdx, 1);
      }

      if (isPushedRef.current) {
        isPushedRef.current = false;
        // Cleanly pop the history state without triggering any modal's onClose
        if (window.history.state && window.history.state.subModal === modalId) {
          isSilentPop = true;
          window.history.back();
        }
      }
      return;
    }

    // Modal was opened: register on stack & push history state
    modalStack.push({
      id: modalId,
      onClose: () => onCloseRef.current()
    });

    const currentState = window.history.state || {};
    window.history.pushState(
      {
        ...currentState,
        subModal: modalId,
        openedAt: Date.now()
      },
      ''
    );
    isPushedRef.current = true;

    return () => {
      const idx = modalStack.findIndex(m => m.id === modalId);
      if (idx !== -1) {
        modalStack.splice(idx, 1);
      }
      if (isPushedRef.current) {
        isPushedRef.current = false;
        if (window.history.state && window.history.state.subModal === modalId) {
          isSilentPop = true;
          window.history.back();
        }
      }
    };
  }, [isOpen, modalId]);
}
