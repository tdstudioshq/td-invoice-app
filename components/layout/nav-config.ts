import type { ComponentType } from "react";
import { InstagramLogoIcon } from "@phosphor-icons/react";
import {
  LayoutDashboard,
  Users,
  FileText,
  FolderLock,
  Settings,
  UserSearch,
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
  { href: "/leads", label: "Leads", icon: UserSearch },
  { href: "/social", label: "Social Hub", icon: InstagramLogoIcon },
  { href: "/client-portals", label: "Client Portals", icon: FolderLock },
  { href: "/settings", label: "Settings", icon: Settings },
];
