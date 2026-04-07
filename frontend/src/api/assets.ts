import type { AssetsFile } from "../types/assets";
import { api } from "./client";

export const assetsApi = {
  get: () => api.get<AssetsFile>("/assets"),
  put: (data: AssetsFile) => api.put<AssetsFile>("/assets", data),
  patch: (data: Partial<AssetsFile>) => api.patch<AssetsFile>("/assets", data),
};
