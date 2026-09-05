import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminApp } from './AdminApp.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export function AdminEntry(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminApp />
    </QueryClientProvider>
  );
}
