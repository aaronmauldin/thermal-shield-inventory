"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TallyRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/trucks");
  }, [router]);

  return (
    <div className="panel empty animate-rise">
      <h2>Opening trucks...</h2>
      <p>Bag tally now lives inside each truck page.</p>
    </div>
  );
}
