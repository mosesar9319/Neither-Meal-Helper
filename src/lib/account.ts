import { useEffect, useState } from 'react';
import { api } from './api';
import { device } from './device';
import type { AccountUser } from './types';

let linkedFor: string | null = null;

/** Links this device's saved requests and meals to the account, once per sign-in. */
function linkDevice(user: AccountUser) {
  if (linkedFor === user.email) return;
  linkedFor = user.email;
  const manage = device.boards().map((b) => b.manageToken);
  const edit = device.signups().map((s) => s.editToken);
  api.account.linkDeviceItems(manage, edit).catch(() => {
    linkedFor = null;
  });
}

/** The signed-in person (Continue with Google), or null. Always null when Google sign-in is off. */
export function useAccount() {
  const [state, setState] = useState<{ loading: boolean; user: AccountUser | null }>({ loading: api.googleEnabled, user: null });
  useEffect(() => {
    if (!api.googleEnabled) return;
    let alive = true;
    const load = () =>
      api.account
        .user()
        .then((user) => {
          if (!alive) return;
          setState({ loading: false, user });
          if (user) linkDevice(user);
        })
        .catch(() => alive && setState({ loading: false, user: null }));
    load();
    const off = api.account.onChange(load);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return state;
}
