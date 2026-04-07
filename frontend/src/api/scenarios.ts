import type { Scenario, ScenarioListItem } from "../types/scenario";
import { api } from "./client";

export const scenariosApi = {
  list: () => api.get<ScenarioListItem[]>("/scenarios"),
  get: (name: string) => api.get<Scenario>(`/scenarios/${name}`),
  put: (name: string, data: Scenario) =>
    api.put<Scenario>(`/scenarios/${name}`, data),
  delete: (name: string) => api.delete(`/scenarios/${name}`),
  clone: (name: string, newName: string) =>
    api.post<Scenario>(`/scenarios/${name}/clone?new_name=${newName}`, {}),
};
