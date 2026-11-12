import { useState, useRef, useCallback } from 'react';

/**
 * Reusable synchronous + React UI lock hook to prevent accidental double-submission,
 * duplicate invoices, duplicate vouchers, or duplicate journal postings across rapid clicks.
 */
export function useSubmitLock() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lockRef = useRef(false);

  const runWithLock = useCallback(async <T>(fn: () => Promise<T> | T): Promise<T | undefined> => {
    if (lockRef.current) return undefined;
    lockRef.current = true;
    setIsSubmitting(true);
    try {
      return await fn();
    } finally {
      lockRef.current = false;
      setIsSubmitting(false);
    }
  }, []);

  const tryAcquire = useCallback((): boolean => {
    if (lockRef.current) return false;
    lockRef.current = true;
    setIsSubmitting(true);
    return true;
  }, []);

  const release = useCallback((): void => {
    lockRef.current = false;
    setIsSubmitting(false);
  }, []);

  return {
    isSubmitting,
    lockRef,
    runWithLock,
    tryAcquire,
    release
  };
}
