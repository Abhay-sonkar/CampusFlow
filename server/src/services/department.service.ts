import { isValidObjectId } from 'mongoose';
import { Department } from '../models/Department';
import { ApiError } from '../utils/ApiError';
import { CreateDepartmentInput, UpdateDepartmentInput } from '../validators/department.schema';

const sameName = (name: string) => Department.findOne({ name }).collation({ locale: 'en', strength: 2 });

export const listDepartments = () => Department.find({ isActive: true }).sort({ name: 1 });

export async function createDepartment(input: CreateDepartmentInput) {
  if (await sameName(input.name)) throw new ApiError(409, 'A department with this name already exists');
  return Department.create(input);
}

export async function updateDepartment(id: string, input: UpdateDepartmentInput) {
  if (!isValidObjectId(id)) throw new ApiError(404, 'Department not found');
  if (input.name) {
    const clash = await sameName(input.name);
    if (clash && clash.id !== id) throw new ApiError(409, 'A department with this name already exists');
  }
  const department = await Department.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true });
  if (!department) throw new ApiError(404, 'Department not found');
  return department;
}
