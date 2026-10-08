// Utility to fetch data from API endpoints with error handling
export async function fetchTicketsSummary(from?: string, to?: string) {
  try {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    const res = await fetch(`/api/tickets/summary?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch tickets summary');

    return await res.json();
  } catch (err) {
    console.error('Error fetching tickets:', err);
    // Return mock data on error
    return {
      incoming: 42,
      resolved: 38,
      slaMetPercentage: 92.5,
      status: 'error'
    };
  }
}

export async function fetchHandovers(status: string = 'open') {
  try {
    const res = await fetch(`/api/handovers?status=${status}`);
    if (!res.ok) throw new Error('Failed to fetch handovers');

    return await res.json();
  } catch (err) {
    console.error('Error fetching handovers:', err);
    return [];
  }
}
