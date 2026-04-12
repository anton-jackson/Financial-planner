import { useEffect, useRef, useCallback } from "react";

/**
 * Auto-saves after `delay` ms of inactivity when dirty.
 * Returns a stable `save` callback and a status string ("Saving..." | "Unsaved" | null).
 */
export function useAutoSave(
  saveFn: () => void | Promise<void>,
  dirty: boolean,
  saving: boolean,
  delay = 1500,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  const save = useCallback(() => saveFnRef.current(), []);

  useEffect(() => {
    if (!dirty || saving) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(), delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [dirty, saving, save, delay]);

  const status = saving ? "Saving..." : dirty ? "Unsaved" : null;

  return { save, status };
}
