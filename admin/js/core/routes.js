const ADMIN_BASE_PATH = typeof window !== 'undefined' && (
  window.location.pathname === '/admin' ||
  window.location.pathname.startsWith('/admin/')
) ? '/admin' : '';

function adminPath(path) {
  return ADMIN_BASE_PATH + path;
}

export const PATHS = {
  dashboard: adminPath('/'),
  bookings: adminPath('/bookings/'),
  availability: adminPath('/availability/'),
  customers: adminPath('/customers/'),
  invoices: adminPath('/invoices/'),
  marketing: adminPath('/marketing/'),
  login: adminPath('/login/')
};

export const PAGE_TITLES = {
  dashboard: 'Dashboard',
  bookings: 'Bookings',
  availability: 'Availability',
  customers: 'Customers',
  invoices: 'Invoices',
  marketing: 'Marketing',
  login: 'Sign in'
};
