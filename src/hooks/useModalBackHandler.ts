import { useEffect, useRef } from 'react';

/**
 * Custom hook to intercept mobile browser & hardware back button (popstate)
 * Ensures that if a modal, drawer, or nested sub-page/editor is open,
 * pressing the phone's back button closes the sub-view and returns to the
 * parent page rather than exiting the application or resetting to the dashboard.
 */
export function useModalBackHandler(
  isOpen: boolean,
  onClose: () => void,
  modalId: string = 'modal'
) {
  const isPushedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      if (isPushedRef.current) {
        isPushedRef.current = false;
        if (window.history.state && window.history.state.subModal === modalId) {
          window.history.back();
        }
      }
      return;
    }

    // Modal was opened: push a state to history stack so phone back button pops it
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

    const handlePopState = (e: PopStateEvent) => {
      // Phone back button was pressed!
      if (isPushedRef.current) {
        isPushedRef.current = false;
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (isPushedRef.current) {
        isPushedRef.current = false;
        if (window.history.state && window.history.state.subModal === modalId) {
          window.history.back();
        }
      }
    };
  }, [isOpen, modalId]);
}
