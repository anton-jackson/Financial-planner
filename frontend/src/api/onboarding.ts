import { api } from "./client";

export interface OnboardingStatus {
  needs_onboarding: boolean;
}

export const onboardingApi = {
  status: () => api.get<OnboardingStatus>("/onboarding/status"),
  complete: (data: { profile: unknown; assets: unknown }) =>
    api.post<{ status: string }>("/onboarding/complete", data),
};
