import type { ReactNode } from "react";

type IconProps = {
  size?: number;
  className?: string;
};

function Svg({
  size = 22,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

export function TruckEmblem(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M3 7h11v10H3V7Zm11 3h4l3 3v4h-7V10Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </Svg>
  );
}

export function CalendarEmblem(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M7 3v3M17 3v3M4.5 8h15M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 13h2v2H8v-2Zm3 0h2v2h-2v-2Zm3 0h2v2h-2v-2Z"
        fill="currentColor"
      />
    </Svg>
  );
}

export function TemplateEmblem(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M8 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M10 9h7M10 13h7M10 17h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ChartEmblem(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M4 19V5M4 19h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8 16V11M12 16V8M16 16v-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function HistoryEmblem(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.6 10a8 8 0 1 1 1.5 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4 7.5V11h3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CategoryEmblem(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 12v9M4 7.5l8 4.5 8-4.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </Svg>
  );
}

export function PlusBoxEmblem(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 9v6M9 12h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function SettingsEmblem(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.2-2-3.4-2.3.7a7.7 7.7 0 0 0-1.7-1L15 3h-6l-.5 2.1a7.7 7.7 0 0 0-1.7 1L4.5 5.4l-2 3.4 2 1.2a7.8 7.8 0 0 0 .1 2l-2 1.2 2 3.4 2.3-.7a7.7 7.7 0 0 0 1.7 1L9 21h6l.5-2.1a7.7 7.7 0 0 0 1.7-1l2.3.7 2-3.4-2-1.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function InventoryEmblem(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M4 8.5 12 4l8 4.5v9L12 22l-8-4.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 12.5v9.5M4 8.5l8 4 8-4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </Svg>
  );
}

export function CheckoutEmblem(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M9 7H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M15 3h6v6M21 3l-9 9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CheckEmblem(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M5 12.5 9.5 17 19 7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function WarnEmblem(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 8v5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 16.5h.01"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function StackEmblem(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M4 8.5 12 4l8 4.5-8 4.5-8-4.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M4 12.5 12 17l8-4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function EmblemBadge({
  tone = "blue",
  children,
}: {
  tone?: "blue" | "orange" | "teal" | "slate";
  children: ReactNode;
}) {
  return <span className={`emblem-badge emblem-${tone}`}>{children}</span>;
}

type EmblemComponent = (props: IconProps) => ReactNode;

export function PageHeading({
  title,
  tone = "blue",
  icon: Icon,
}: {
  title: string;
  tone?: "blue" | "orange" | "teal" | "slate";
  icon: EmblemComponent;
}) {
  return (
    <h1 className="page-title page-title-with-emblem">
      <EmblemBadge tone={tone}>
        <Icon size={24} />
      </EmblemBadge>
      {title}
    </h1>
  );
}
