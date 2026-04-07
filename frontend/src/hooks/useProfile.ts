import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { profileApi } from "../api/profile";
import type { Profile } from "../types/profile";

export function useProfile() {
  return useQuery({ queryKey: ["profile"], queryFn: profileApi.get });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Profile) => profileApi.put(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}
