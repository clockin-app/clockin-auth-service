export interface EmployeePayload {
  id: string;
  email: string;
  role: string;
  password: string;
  is_active: boolean;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}
