import { Request, Response } from 'express';
import * as departmentService from '../services/department.service';

export async function list(_req: Request, res: Response) {
  res.json({ success: true, departments: await departmentService.listDepartments() });
}

export async function create(req: Request, res: Response) {
  res.status(201).json({ success: true, department: await departmentService.createDepartment(req.body) });
}

export async function update(req: Request, res: Response) {
  res.json({ success: true, department: await departmentService.updateDepartment(String(req.params.id), req.body) });
}
