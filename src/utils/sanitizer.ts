/**
 * Utilities for input sanitization, field validation, and Dominican Republic formatting.
 */

// Sanitize string to prevent basic XSS or script injection
export function sanitizeString(input: string | undefined | null): string {
  if (!input) return '';
  return String(input)
    .trim()
    .replace(/[<>]/g, ''); // Strip basic HTML tag delimiters
}

// Format currency as Dominican Pesos (RD$ 1,250.00)
export function formatCurrency(amount: number | string | undefined | null): string {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(num)
    .replace('DOP', 'RD$');
}

// Format Dominican date (e.g., 22/07/2026) without timezone shift
export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return '';
  try {
    if (typeof dateString === 'string' && dateString.includes('-')) {
      const parts = dateString.split('T')[0].split('-');
      if (parts.length === 3) {
        const year = parts[0];
        const month = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        return `${day}/${month}/${year}`;
      }
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('es-DO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return dateString;
  }
}

// Calculate due date based on start date and days
export function addDaysToDate(dateString: string, days: number): string {
  const parts = dateString ? dateString.split('-') : [];
  let date: Date;
  if (parts.length === 3) {
    date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  } else {
    date = new Date();
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

// Format RNC or Cédula (001-0000000-0 or 1-30-00000-0)
export function formatDocumento(doc: string | undefined | null): string {
  if (!doc) return '';
  const clean = doc.replace(/\D/g, '');
  if (clean.length === 11) {
    // Cédula: 001-0000000-0
    return `${clean.slice(0, 3)}-${clean.slice(3, 10)}-${clean.slice(10)}`;
  }
  if (clean.length === 9) {
    // RNC: 1-30-00000-0
    return `${clean.slice(0, 1)}-${clean.slice(1, 3)}-${clean.slice(3, 8)}-${clean.slice(8)}`;
  }
  return doc;
}

// Phone validator and formatter
export function formatTelefono(phone: string | undefined | null): string {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10) {
    return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  return phone;
}

// Round to 2 decimal places reliably
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
