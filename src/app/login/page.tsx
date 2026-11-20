import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="login-screen">
      <Suspense
        fallback={
          <div className="panel empty login-card">
            <h2>Opening TSI INV...</h2>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
