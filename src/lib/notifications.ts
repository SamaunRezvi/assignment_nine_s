import { collections } from '../config/db';
import type { AuthUser } from '../middleware/auth';

const STATUS_TEXT: Record<string, string> = {
  requested: 'New repair request', accepted: 'Request accepted', rejected: 'Request rejected',
  'in-progress': 'Repair started', completed: 'Repair completed', cancelled: 'Request cancelled', paid: 'Payment received',
  rated: 'New customer feedback', 'reschedule-proposed': 'Reschedule proposed',
};

// Each event goes to the one party who needs to act on or learn about it,
// not to whoever already caused it: a technician is notified of a new
// request, the customer is notified once the technician moves on it, and
// admin only sees the payment as a platform-wide audit trail.
const EVENTS_FOR_ROLE: Record<AuthUser['role'], string[]> = {
  technician: ['requested', 'rated'],
  customer: ['accepted', 'rejected', 'in-progress', 'completed', 'cancelled', 'reschedule-proposed'],
  admin: ['paid'],
};

export async function notificationSnapshot(user: AuthUser) {
  const profile = await collections.users().findOne({ email: user.email });
  if (!profile) throw new Error('Notification account not found');
  const readAt = profile.notificationsReadAt ? new Date(profile.notificationsReadAt) : new Date(0);
  const scope = user.role === 'admin' ? {} : user.role === 'technician'
    ? { technicianEmail: user.email } : { customerEmail: user.email };
  const relevantStatuses = EVENTS_FOR_ROLE[user.role];
  // Use the persisted booking history as the event source, including events
  // written by other API instances and events missed while disconnected.
  const [result] = await collections.bookings().aggregate([
    { $match: scope },
    { $unwind: '$statusHistory' },
    { $match: { 'statusHistory.status': { $in: relevantStatuses } } },
    { $sort: { 'statusHistory.changedAt': -1, _id: -1 } },
    { $facet: {
      items: [{ $limit: 30 }, { $project: {
        bookingId: { $toString: '$_id' }, serviceTitle: 1, customerName: 1, rating: 1, review: 1,
        shift: 1, assignedTimeSlot: 1, proposedDate: 1, proposedShift: 1,
        status: '$statusHistory.status', createdAt: '$statusHistory.changedAt',
      } }],
      unread: [{ $match: { 'statusHistory.changedAt': { $gt: readAt } } }, { $count: 'count' }],
    } },
  ]).toArray();
  const href = user.role === 'admin' ? '/dashboard/admin/transactions' : user.role === 'technician'
    ? '/dashboard/technician/requests' : '/dashboard/customer/bookings';
  return {
    enabled: profile.notificationsEnabled !== false,
    readAt: readAt.toISOString(),
    unreadCount: result?.unread[0]?.count ?? 0,
    items: (result?.items ?? []).map((event: {
      bookingId: string; serviceTitle: string; customerName?: string; rating?: number; review?: string;
      shift?: string; assignedTimeSlot?: string; proposedDate?: Date; proposedShift?: string;
      status: string; createdAt: Date;
    }) => ({
      id: `${event.bookingId}:${event.status}:${new Date(event.createdAt).toISOString()}`,
      title: STATUS_TEXT[event.status],
      message: buildMessage(event),
      createdAt: new Date(event.createdAt).toISOString(), href,
    })),
  };
}

function buildMessage(event: {
  serviceTitle: string; customerName?: string; rating?: number; review?: string;
  shift?: string; assignedTimeSlot?: string; proposedDate?: Date; proposedShift?: string; status: string;
}) {
  if (event.status === 'rated') {
    return `${event.customerName || 'Customer'} rated ${event.serviceTitle} ${event.rating}/5: ${(event.review || '').slice(0, 160)}`;
  }
  if (event.status === 'accepted' && event.shift) {
    const slot = event.assignedTimeSlot ? ` at ${event.assignedTimeSlot}` : '';
    return `${event.serviceTitle} confirmed for the ${event.shift} shift${slot}`;
  }
  if (event.status === 'reschedule-proposed' && event.proposedShift) {
    const date = event.proposedDate ? new Date(event.proposedDate).toLocaleDateString() : '';
    return `New time proposed for ${event.serviceTitle}: ${event.proposedShift} shift on ${date}`;
  }
  return event.serviceTitle;
}
