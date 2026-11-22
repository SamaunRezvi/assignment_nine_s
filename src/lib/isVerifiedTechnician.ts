import { collections } from '../config/db';

export async function isVerifiedTechnician(email: string): Promise<boolean> {
  const approvedCount = await collections
    .services()
    .countDocuments({ technicianEmail: email, approvalStatus: 'approved' });

  return approvedCount > 0;
}
