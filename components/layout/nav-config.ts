import type { ComponentType } from "react";
import {
  LayoutDashboard,
  Users,
  FileText,
  FolderLock,
  Factory,
  Package,
  Palette,
  QrCode,
  Settings,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/mylar-requests", label: "Mylar Requests", icon: Package },
  { href: "/design-requests", label: "Design Requests", icon: Palette },
  { href: "/partner-jobs", label: "Partner Jobs", icon: Factory },
  { href: "/qr", label: "QR Codes", icon: QrCode },
  { href: "/client-portals", label: "Client Portals", icon: FolderLock },
  { href: "/settings", label: "Settings", icon: Settings },
];
