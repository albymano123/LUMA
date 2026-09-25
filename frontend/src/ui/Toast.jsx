import { useCallback, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";

import { ToastContext } from "./toastContext";
import "./ui.css";

const LIFETIME_MS = 6000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const notify = useCallback((message) => {
    if (!message) return;

    const id = ++counter.current;
    setToasts((current) => [...current.slice(-2), { id, message }]);

    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), LIFETIME_MS);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="lp-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="lp-toast">
            <Info size={18} aria-hidden="true" />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
