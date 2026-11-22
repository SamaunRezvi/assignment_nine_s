import { collections } from '../config/db';
import type { AuthUser } from '../middleware/auth';

const STATUS_TEXT: Record<string, string> = {
  requested: 'New repair request', accepted: 'Request accepted', rejected: 'Request rejected',
  'in-progress': 'Repair started', completed: 'Repair completed', cancelled: 'Request cancelled', paid: 'Payment received',
  rated: 'New customer feedback',
};

export async function notificationSnapshot(user: AuthUser) {
  const profile = await collections.users().findOne({ email: user.email });
  if (!profile) throw new Error('Notification account not found');
  const readAt = profile.notificationsReadAt ? new Date(profile.notificationsReadAt) : new Date(0);
  const scope = user.role === 'admin' ? {} : user.role === 'technician'
    ? { technicianEmail: user.email } : { customerEmail: user.email };
  // Use the persisted booking history as the event source, including events
  // written by other API instances and events missed while disconnected.
  const [result] = await collections.bookings().aggregate([
    { $match: scope },
    { $unwind: '$statusHistory' },
    { $match: { 'statusHistory.status': { $in: Object.keys(STATUS_TEXT) } } },
    { $sort: { 'statusHistory.changedAt': -1, _id: -1 } },
    { $facet: {
      items: [{ $limit: 30 }, { $project: {
        bookingId: { $toString: '$_id' }, serviceTitle: 1, customerName: 1, rating: 1, review: 1,
        status: '$statusHistory.status', createdAt: '$statusHistory.changedAt',
      } }],
      unread: [{ $match: { 'statusHistory.changedAt': { $gt: readAt } } }, { $count: 'count' }],
    } },
  ]).toArray();
  const href = user.role === 'admin' ? '/dashboard/admin/bookings' : user.role === 'technician'
    ? '/dashboard/technician/requests' : '/dashboard/customer/bookings';
  return {
    enabled: profile.notificationsEnabled !== false,
    readAt: readAt.toISOString(),
    unreadCount: result?.unread[0]?.count ?? 0,
    items: (result?.items ?? []).map((event: { bookingId: string; serviceTitle: string; customerName?: string; rating?: number; review?: string; status: string; createdAt: Date }) => ({
      id: `${event.bookingId}:${event.status}:${new Date(event.createdAt).toISOString()}`,
      title: STATUS_TEXT[event.status],
      message: event.status === 'rated' ? `${event.customerName || 'Customer'} rated ${event.serviceTitle} ${event.rating}/5: ${(event.review || '').slice(0, 160)}` : event.serviceTitle,
      createdAt: new Date(event.createdAt).toISOString(), href,
    })),
  };
}
