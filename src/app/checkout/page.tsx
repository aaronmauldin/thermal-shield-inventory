"use client";

import { Suspense } from "react";
import { CheckoutForm } from "@/components/CheckoutForm";

export default function CheckoutPage() {
  return (
    <div className="animate-rise">
      <div className="page-title-block">
        <div>
          <h1 className="page-title">Check Out Material</h1>
          <p className="page-lead">
            Grab what you need. We&apos;ll update stock automatically.
          </p>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="panel empty">
            <h2>Loading...</h2>
          </div>
        }
      >
        <CheckoutForm />
      </Suspense>
    </div>
  );
}
