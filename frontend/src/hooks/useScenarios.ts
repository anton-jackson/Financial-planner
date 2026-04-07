import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { scenariosApi } from "../api/scenarios";
import type { Scenario } from "../types/scenario";

export function useScenarioList() {
  return useQuery({ queryKey: ["scenarios"], queryFn: scenariosApi.list });
}

export function useScenario(name: string) {
  return useQuery({
    queryKey: ["scenarios", name],
    queryFn: () => scenariosApi.get(name),
    enabled: !!name,
  });
}

export function useUpdateScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: Scenario }) =>
      scenariosApi.put(name, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenarios"] }),
  });
}

export function useDeleteScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => scenariosApi.delete(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenarios"] }),
  });
}

export function useCloneScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, newName }: { name: string; newName: string }) =>
      scenariosApi.clone(name, newName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenarios"] }),
  });
}

export function useCreateScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: Scenario }) =>
      scenariosApi.put(name, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenarios"] }),
  });
}
