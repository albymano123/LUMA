import { createContext, useContext } from "react";

export const ToastContext = createContext({ notify: () => {} });

/** notify("message") shows a short toast (live-region announced). */
export const useToast = () => useContext(ToastContext);
