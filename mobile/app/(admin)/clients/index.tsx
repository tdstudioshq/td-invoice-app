import { useRouter } from "expo-router";

import {
  Card,
  ListRow,
  MessageState,
  QueryBoundary,
  Screen,
} from "@/src/components/ui";
import { getClients } from "@/src/lib/data";
import { useScreenQuery } from "@/src/hooks/use-screen-query";

export default function ClientsScreen() {
  const router = useRouter();
  const query = useScreenQuery(getClients);

  return (
    <Screen
      title="Clients"
      subtitle="Client records from the shared Supabase workspace."
      refreshing={query.refreshing}
      onRefresh={() => void query.refresh()}
    >
      <QueryBoundary
        loading={query.loading}
        error={query.error}
        hasData={Boolean(query.data)}
        retry={() => void query.retry()}
      >
        {query.data?.length ? (
          <Card>
            {query.data.map((client) => (
              <ListRow
                key={client.id}
                title={client.company_name}
                subtitle={client.contact_name ?? client.email ?? "No contact"}
                onPress={() =>
                  router.push({
                    pathname: "/clients/[id]",
                    params: { id: client.id },
                  })
                }
              />
            ))}
          </Card>
        ) : (
          <MessageState
            title="No clients"
            message="Create clients in the web app; they will appear here."
            icon="people-outline"
          />
        )}
      </QueryBoundary>
    </Screen>
  );
}
