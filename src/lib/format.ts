export function currency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function dateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function riskColor(score: number): { bg: string; text: string; ring: string; label: string } {
  if (score >= 60) return { bg: 'bg-danger-50', text: 'text-danger-700', ring: 'ring-danger-200', label: 'High risk' };
  if (score >= 35) return { bg: 'bg-warning-50', text: 'text-warning-700', ring: 'ring-warning-200', label: 'Moderate' };
  return { bg: 'bg-primary-50', text: 'text-primary-700', ring: 'ring-primary-200', label: 'Low risk' };
}

export function statusBadge(status: string): { bg: string; text: string; dot: string; label: string } {
  switch (status) {
    case 'overdue':
      return { bg: 'bg-danger-50', text: 'text-danger-700', dot: 'bg-danger-500', label: 'Overdue' };
    case 'paid':
      return { bg: 'bg-primary-50', text: 'text-primary-700', dot: 'bg-primary-500', label: 'Paid' };
    case 'sent':
      return { bg: 'bg-accent-50', text: 'text-accent-700', dot: 'bg-accent-500', label: 'Sent' };
    default:
      return { bg: 'bg-ink-100', text: 'text-ink-600', dot: 'bg-ink-400', label: 'Draft' };
  }
}
