import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const latest = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const load = useCallback(
    async (quiet = false) => {
      const id = ++latest.current;
      if (!quiet) setState((s) => ({ ...s, loading: true }));
      try {
        const data = await run();
        if (id === latest.current) setState({ data, loading: false });
      } catch (error) {
        if (id === latest.current) setState({ error, loading: false });
      }
    },
    [run],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: () => load(true) };
}
