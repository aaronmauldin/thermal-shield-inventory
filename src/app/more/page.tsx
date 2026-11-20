"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  CalendarEmblem,
  ChartEmblem,
  EmblemBadge,
  TemplateEmblem,
  TruckEmblem,
} from "@/components/Emblems";

const inventoryLinks = [
  {
    href: "/estimates",
    title: "Upcoming material",
    copy: "Jobber jobs → material needs from templates",
    tone: "orange" as const,
    icon: CalendarEmblem,
  },
  {
    href: "/templates",
    title: "Line item templates",
    copy: "Map Jobber line names to materials & qty",
    tone: "orange" as const,
    icon: TemplateEmblem,
  },
  {
    href: "/jobs",
    title: "Material usage",
    copy: "Weekly & monthly charts, averages, search jobs",
    tone: "blue" as const,
    icon: ChartEmblem,
  },
  {
    href: "/trucks",
    title: "Trucks",
    copy: "Manage trucks, view materials and bag tally",
    tone: "blue" as const,
    icon: TruckEmblem,
  },
];

export default function MorePage() {
  const { user } = useAuth();
  const crew = user?.role === "crew";
  const inventory = crew
    ? inventoryLinks.filter((link) => link.href === "/trucks")
    : inventoryLinks;

  return (
    <div className="animate-rise">
      <div className="page-title-block">
        <div>
          <h1 className="page-title">More</h1>
          <p className="page-lead">Tools to keep your inventory running smoothly.</p>
        </div>
      </div>

      <div className="more-groups">
        <section>
          <h2>Inventory & Jobs</h2>
          <div className="item-list">
            {inventory.map((link) => {
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href} className="panel more-link">
                  <EmblemBadge tone={link.tone}>
                    <Icon size={22} />
                  </EmblemBadge>
                  <div className="more-link-copy">
                    <strong>{link.title}</strong>
                    <span>{link.copy}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
