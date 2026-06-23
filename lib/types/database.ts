// Database types for the TD Studios invoice app.
//
// These mirror supabase/migrations/0001_initial_schema.sql. If you change the
// schema, regenerate or update these to match. With the Supabase CLI you can run:
//   supabase gen types typescript --local > lib/types/database.ts

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          company_name: string;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_name: string;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
        Relationships: [];
      };
      company_settings: {
        Row: {
          id: string;
          company_name: string;
          address: string | null;
          email: string | null;
          phone: string | null;
          tax_rate: number;
          payment_instructions: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_name?: string;
          address?: string | null;
          email?: string | null;
          phone?: string | null;
          tax_rate?: number;
          payment_instructions?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["company_settings"]["Insert"]
        >;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          invoice_number: string;
          client_id: string | null;
          status: InvoiceStatus;
          issue_date: string;
          due_date: string | null;
          tax_rate: number;
          discount_rate: number;
          notes: string | null;
          subtotal: number;
          discount_amount: number;
          tax_amount: number;
          total: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          invoice_number?: string;
          client_id?: string | null;
          status?: InvoiceStatus;
          issue_date?: string;
          due_date?: string | null;
          tax_rate?: number;
          discount_rate?: number;
          notes?: string | null;
          subtotal?: number;
          discount_amount?: number;
          tax_amount?: number;
          total?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["invoices"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_items: {
        Row: {
          id: string;
          invoice_id: string;
          description: string;
          quantity: number;
          unit_price: number;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          description?: string;
          quantity?: number;
          unit_price?: number;
          position?: number;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["invoice_items"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey";
            columns: ["invoice_id"];
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          invoice_id: string;
          amount: number;
          payment_date: string;
          method: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          amount?: number;
          payment_date?: string;
          method?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey";
            columns: ["invoice_id"];
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      next_invoice_number: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: {
      invoice_status: InvoiceStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}

// Convenience row aliases used throughout the app.
export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceItem = Database["public"]["Tables"]["invoice_items"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type CompanySettings =
  Database["public"]["Tables"]["company_settings"]["Row"];

// Composed shapes returned by joined queries.
export type InvoiceWithClient = Invoice & {
  client: Pick<Client, "id" | "company_name" | "contact_name" | "email"> | null;
};

export type InvoiceWithRelations = Invoice & {
  client: Client | null;
  invoice_items: InvoiceItem[];
  payments: Payment[];
};
