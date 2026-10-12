import { isValidObjectId } from 'mongoose';
import { Resource } from '../models/Resource';
import { Role } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { CreateResourceInput, ListResourcesQuery, UpdateResourceInput } from '../validators/resource.schema';

const notFound = () => new ApiError(404, 'Resource not found');
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sameName = (name: string) => Resource.findOne({ name }).collation({ locale: 'en', strength: 2 });

export async function listResources(role: Role, query: ListResourcesQuery) {
  const filter: Record<string, any> = {};
  // Only admins may see deactivated resources
  if (!(role === 'COLLEGE_ADMIN' && query.includeInactive)) filter.isActive = true;
  if (query.type) filter.type = query.type;
  if (query.q) filter.name = { $regex: escapeRegex(query.q), $options: 'i' };

  const [items, total] = await Promise.all([
    Resource.find(filter)
      .sort({ name: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Resource.countDocuments(filter),
  ]);
  return { items, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}

export async function getResource(id: string) {
  if (!isValidObjectId(id)) throw notFound();
  const resource = await Resource.findById(id);
  if (!resource) throw notFound();
  return resource;
}

export async function createResource(input: CreateResourceInput) {
  if (await sameName(input.name)) throw new ApiError(409, 'A resource with this name already exists');
  return Resource.create(input);
}

export async function updateResource(id: string, input: UpdateResourceInput) {
  if (!isValidObjectId(id)) throw notFound();
  if (input.name) {
    const clash = await sameName(input.name);
    if (clash && clash.id !== id) throw new ApiError(409, 'A resource with this name already exists');
  }
  const resource = await Resource.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true });
  if (!resource) throw notFound();
  return resource;
}
