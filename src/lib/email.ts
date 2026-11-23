import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

type BookingEmailEvent = 'accepted' | 'rejected' | 'completed' | 'paid' | 'reschedule-proposed';

interface BookingEmailData {
  customerEmail: string;
  customerName: string;
  serviceTitle: string;
  technicianName: string;
  finalAmount?: number;
  assignedTimeSlot?: string;
  proposedDate?: string;
  proposedShift?: string;
}

const SUBJECT: Record<BookingEmailEvent, string> = {
  accepted: 'Your repair request was accepted',
  rejected: 'Your repair request was declined',
  completed: 'Your repair job is complete',
  paid: 'Payment received, thank you',
  'reschedule-proposed': 'A new time was proposed for your repair request',
};

function buildMessage(event: BookingEmailEvent, data: BookingEmailData): string {
  const { customerName, serviceTitle, technicianName, finalAmount, assignedTimeSlot, proposedDate, proposedShift } = data;

  switch (event) {
    case 'accepted': {
      const slot = assignedTimeSlot ? ` Your time slot is ${assignedTimeSlot}.` : '';
      return `Hi ${customerName},\n\n${technicianName} has accepted your request for ${serviceTitle}.${slot} They will get in touch about the next steps.\n\nFixMate`;
    }
    case 'rejected':
      return `Hi ${customerName},\n\n${technicianName} was unable to take on your request for ${serviceTitle}. You can browse other technicians offering the same service on FixMate.\n\nFixMate`;
    case 'completed':
      return `Hi ${customerName},\n\n${technicianName} has marked your ${serviceTitle} job as complete. The final amount is $${finalAmount?.toFixed(2)}. You can pay now from your bookings page.\n\nFixMate`;
    case 'paid':
      return `Hi ${customerName},\n\nYour payment of $${finalAmount?.toFixed(2)} for ${serviceTitle} has been received. Thank you for using FixMate.\n\nFixMate`;
    case 'reschedule-proposed':
      return `Hi ${customerName},\n\n${technicianName} cannot take your ${serviceTitle} request at the original time, and has proposed a new ${proposedShift} shift on ${proposedDate}. Please accept or reject this new time from your bookings page.\n\nFixMate`;
  }
}

export async function sendBookingStatusEmail(data: BookingEmailData, event: BookingEmailEvent) {
  if (!resend) return;

  try {
    await resend.emails.send({
      from: 'FixMate <onboarding@resend.dev>',
      to: data.customerEmail,
      subject: SUBJECT[event],
      text: buildMessage(event, data),
    });
  } catch (err) {
    console.error('Failed to send booking status email:', err);
  }
}
