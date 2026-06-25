import {
  LayoutDashboard,
  Users,
  FileText,
  FolderLock,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/client-portals", label: "Client Portals", icon: FolderLock },
  { href: "/settings", label: "Settings", icon: Settings },
];
