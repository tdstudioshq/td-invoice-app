// Database types for the TD Studios invoice app.
//
// These mirror supabase/migrations/0001_initial_schema.sql. If you change the
// schema, regenerate or update these to match. With the Supabase CLI you can run:
//   supabase gen types typescript --local > lib/types/database.ts

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

// Maps to the three private-storage prefixes (uploads/, final-files/, invoices/).
export type FileCategory = "uploads" | "final_files" | "invoices";

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
          owner_id: string | null;
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
          owner_id?: string | null;
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
          owner_id: string | null;
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
          owner_id?: string | null;
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
          owner_id: string | null;
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
          owner_id?: string | null;
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
          owner_id: string | null;
          invoice_id: string;
          description: string;
          quantity: number;
          unit_price: number;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
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
          owner_id: string | null;
          invoice_id: string;
          amount: number;
          payment_date: string;
          method: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
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
      client_users: {
        Row: {
          id: string;
          owner_id: string | null;
          user_id: string;
          client_id: string;
          email: string | null;
          can_upload: boolean;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          user_id: string;
          client_id: string;
          email?: string | null;
          can_upload?: boolean;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["client_users"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "client_users_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      client_file_folders: {
        Row: {
          id: string;
          owner_id: string | null;
          client_id: string;
          category: FileCategory;
          name: string;
          parent_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          client_id: string;
          category?: FileCategory;
          name: string;
          parent_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["client_file_folders"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "client_file_folders_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      client_files: {
        Row: {
          id: string;
          owner_id: string | null;
          client_id: string;
          folder_id: string | null;
          category: FileCategory;
          storage_path: string;
          name: string;
          size_bytes: number;
          mime_type: string | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          client_id: string;
          folder_id?: string | null;
          category?: FileCategory;
          storage_path: string;
          name: string;
          size_bytes?: number;
          mime_type?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["client_files"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "client_files_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_files_folder_id_fkey";
            columns: ["folder_id"];
            referencedRelation: "client_file_folders";
            referencedColumns: ["id"];
          },
        ];
      };
      file_activity: {
        Row: {
          id: string;
          owner_id: string | null;
          client_id: string;
          file_id: string | null;
          actor_id: string | null;
          action: string;
          detail: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          client_id: string;
          file_id?: string | null;
          actor_id?: string | null;
          action: string;
          detail?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["file_activity"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "file_activity_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
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
      portal_client_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      is_portal_user: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      portal_can_upload: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      invoice_status: InvoiceStatus;
      file_category: FileCategory;
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
export type ClientUser = Database["public"]["Tables"]["client_users"]["Row"];
export type ClientFileFolder =
  Database["public"]["Tables"]["client_file_folders"]["Row"];
export type ClientFile = Database["public"]["Tables"]["client_files"]["Row"];
export type FileActivity =
  Database["public"]["Tables"]["file_activity"]["Row"];

// Composed shapes returned by joined queries.
export type InvoiceWithClient = Invoice & {
  client: Pick<Client, "id" | "company_name" | "contact_name" | "email"> | null;
};

export type InvoiceWithRelations = Invoice & {
  client: Client | null;
  invoice_items: InvoiceItem[];
  payments: Payment[];
};

// Composed shapes for the client portal.
export type ClientFileWithFolder = ClientFile & {
  folder: Pick<ClientFileFolder, "id" | "name" | "category"> | null;
};

// A client row plus its portal-access summary, used by the admin portal screens.
export type ClientPortalSummary = Client & {
  portal_user: ClientUser | null;
  file_count: number;
};
