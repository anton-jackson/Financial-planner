import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { assetsApi } from "../api/assets";
import type { AssetsFile } from "../types/assets";

export function useAssets() {
  return useQuery({ queryKey: ["assets"], queryFn: assetsApi.get });
}

export function useUpdateAssets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AssetsFile) => assetsApi.put(data),
    onSuccess: (_resp, savedData) => {
      qc.setQueryData(["assets"], savedData);
    },
  });
}
