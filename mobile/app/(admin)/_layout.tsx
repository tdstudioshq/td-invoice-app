import { Tabs } from "expo-router";

import { TabIcon } from "@/src/components/tab-icon";
import { tabPressListeners, tabScreenOptions } from "@/src/components/tabs";

export default function AdminLayout() {
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen
        name="dashboard"
        listeners={tabPressListeners}
        options={{
          title: "Dashboard",
          tabBarIcon: (props) => <TabIcon name="grid" {...props} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        listeners={tabPressListeners}
        options={{
          title: "Clients",
          tabBarIcon: (props) => <TabIcon name="people" {...props} />,
        }}
      />
      <Tabs.Screen
        name="invoices"
        listeners={tabPressListeners}
        options={{
          title: "Invoices",
          tabBarIcon: (props) => <TabIcon name="document-text" {...props} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        listeners={tabPressListeners}
        options={{
          title: "Settings",
          tabBarIcon: (props) => <TabIcon name="settings" {...props} />,
        }}
      />
    </Tabs>
  );
}
