export interface ContactSubmission {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  countryCode?: string;
  message: string;
}

export interface ContactResponse {
  success: boolean;
  message: string;
  id?: number;
}

export interface DatabaseContact {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  country_code: string | null;
  message: string;
  created_at: string;
}
