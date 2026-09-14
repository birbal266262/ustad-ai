/**
 * Client hook for equippable profile cosmetics (avatar frames, badges, name
 * styles). Thin wrapper over the server-function boundary — it never decides
 * ownership; it just surfaces the real state and calls the server to change it.
 */
import { useCallback, useEffect, useState } from "react";
import { cosmeticsStateFn, cosmeticsEquipFn, cosmeticsUnequipFn } from "@/lib/cosmetics.functions";
import type { EquippableCategory } from "@/lib/cosmetics-spec";

export type UseCosmetics = {
  state: Awaited<ReturnType<typeof cosmeticsStateFn>> | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  equip: (itemId: string) => Promise<void>;
  unequip: (category: EquippableCategory) => Promise<void>;
};

export function useCosmetics(token: string | null): UseCosmetics {
  const [state, setState] = useState<UseCosmetics["state"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      setState(await cosmeticsStateFn({ data: { token } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your cosmetics.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const equip = useCallback(
    async (itemId: string) => {
      if (!token) return;
      setState(await cosmeticsEquipFn({ data: { token, itemId } }));
    },
    [token],
  );

  const unequip = useCallback(
    async (category: EquippableCategory) => {
      if (!token) return;
      setState(await cosmeticsUnequipFn({ data: { token, category } }));
    },
    [token],
  );

  return { state, loading, error, refresh, equip, unequip };
}
