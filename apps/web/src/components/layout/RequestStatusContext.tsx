import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { installRequestCounter } from "@/lib/requestCounter";

const RequestCountContext = createContext(0);

export function RequestStatusProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const uninstall = installRequestCounter(setCount);
    return uninstall;
  }, []);

  return (
    <RequestCountContext.Provider value={count}>
      {children}
    </RequestCountContext.Provider>
  );
}

export function useRequestCount() {
  return useContext(RequestCountContext);
}
