import { Tabs } from "expo-router";

import { TabIcon } from "@/src/components/tab-icon";
import { tabPressListeners, tabScreenOptions } from "@/src/components/tabs";

export default function PortalLayout() {
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen
        name="portal-home"
        listeners={tabPressListeners}
        options={{
          title: "Home",
          tabBarIcon: (props) => <TabIcon name="home" {...props} />,
        }}
      />
      <Tabs.Screen
        name="portal-files"
        listeners={tabPressListeners}
        options={{
          title: "Files",
          tabBarIcon: (props) => <TabIcon name="folder" {...props} />,
        }}
      />
      <Tabs.Screen
        name="portal-invoices"
        listeners={tabPressListeners}
        options={{
          title: "Invoices",
          tabBarIcon: (props) => <TabIcon name="document-text" {...props} />,
        }}
      />
      <Tabs.Screen
        name="portal-settings"
        listeners={tabPressListeners}
        options={{
          title: "Settings",
          tabBarIcon: (props) => <TabIcon name="settings" {...props} />,
        }}
      />
    </Tabs>
  );
}
