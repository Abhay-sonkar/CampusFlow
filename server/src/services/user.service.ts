import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { UpdateProfileInput } from '../validators/user.schema';
import { toPublicUser } from './auth.service';

// The profile (branch, year, skills) drives eligibility checks and recommendations
export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const user = await User.findByIdAndUpdate(userId, { $set: input }, { returnDocument: 'after', runValidators: true });
  if (!user) throw new ApiError(404, 'User not found');
  return toPublicUser(user);
}
