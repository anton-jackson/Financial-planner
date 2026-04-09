import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "./AuthContext";

export function LoginPage() {
  const { onSignIn, error, loading } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">
          Financial Planner
        </h1>
        <p className="text-slate-500 mb-6">
          Sign in to access your financial plan
        </p>

        {loading ? (
          <div className="text-slate-400">Verifying...</div>
        ) : (
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={onSignIn}
              onError={() => onSignIn({ credential: undefined })}
              theme="outline"
              size="large"
              width={280}
            />
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
