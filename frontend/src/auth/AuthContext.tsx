import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api } from "../api/client";

interface AuthState {
  /** Whether the backend requires auth */
  authRequired: boolean | null;
  /** The Google ID token (null when not signed in or auth disabled) */
  token: string | null;
  /** Authenticated user email */
  email: string | null;
  /** True while checking auth config or validating token */
  loading: boolean;
  /** Error message from auth flow */
  error: string | null;
  /** Call when Google sign-in returns a credential */
  onSignIn: (credentialResponse: { credential?: string }) => void;
  /** Sign out — clears token from memory */
  signOut: () => void;
}

const AuthContext = createContext<AuthState>({
  authRequired: null,
  token: null,
  email: null,
  loading: true,
  error: null,
  onSignIn: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount, ask the backend if auth is enabled
  useEffect(() => {
    api
      .get<{ auth_enabled: boolean }>("/auth/config")
      .then((cfg) => {
        setAuthRequired(cfg.auth_enabled);
        if (!cfg.auth_enabled) {
          setLoading(false);
        }
      })
      .catch(() => {
        // If we can't reach the backend, assume no auth
        setAuthRequired(false);
        setLoading(false);
      });
  }, []);

  // When auth is required but we have no token, stay in loading=false so
  // the login screen shows
  useEffect(() => {
    if (authRequired === true && !token) {
      setLoading(false);
    }
  }, [authRequired, token]);

  const onSignIn = useCallback(
    (credentialResponse: { credential?: string }) => {
      const idToken = credentialResponse.credential;
      if (!idToken) {
        setError("No credential received from Google");
        return;
      }

      setLoading(true);
      setError(null);

      // Validate token against our backend
      fetch("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${idToken}` },
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(body.detail || `Auth failed: ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          setToken(idToken);
          setEmail(data.email);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setToken(null);
          setEmail(null);
          setLoading(false);
        });
    },
    []
  );

  const signOut = useCallback(() => {
    setToken(null);
    setEmail(null);
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ authRequired, token, email, loading, error, onSignIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
