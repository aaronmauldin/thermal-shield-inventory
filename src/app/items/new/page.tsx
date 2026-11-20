"use client";

import { ItemForm } from "@/components/ItemForm";
import { PageHeading, PlusBoxEmblem } from "@/components/Emblems";

export default function NewItemPage() {
  return (
    <div className="animate-rise">
      <PageHeading title="Add material" tone="orange" icon={PlusBoxEmblem} />
      <p className="page-sub">
        Log what&apos;s on the truck or in the warehouse. Set a low-stock number
        so the crew gets emailed before you run dry.
      </p>
      <ItemForm />
    </div>
  );
}
