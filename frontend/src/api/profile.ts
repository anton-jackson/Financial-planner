import type { Profile } from "../types/profile";
import { api } from "./client";

export const profileApi = {
  get: () => api.get<Profile>("/profile"),
  put: (data: Profile) => api.put<Profile>("/profile", data),
  patch: (data: Partial<Profile>) => api.patch<Profile>("/profile", data),
};
