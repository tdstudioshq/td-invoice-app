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
      leads: {
        Row: {
          id: string;
          owner_id: string;
          instagram_id: string;
          username: string;
          full_name: string | null;
          is_private: boolean;
          is_verified: boolean;
          profile_pic_url: string | null;
          relationship_type: "followers" | "following";
          source_username: string;
          source_file: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          instagram_id: string;
          username: string;
          full_name?: string | null;
          is_private?: boolean;
          is_verified?: boolean;
          profile_pic_url?: string | null;
          relationship_type: "followers" | "following";
          source_username: string;
          source_file?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      qr_codes: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string;
          type: "url" | "text";
          destination_url: string | null;
          raw_value: string;
          style_json: Json;
          is_dynamic: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          name: string;
          slug: string;
          type?: "url" | "text";
          destination_url?: string | null;
          raw_value: string;
          style_json?: Json;
          is_dynamic?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["qr_codes"]["Insert"]>;
        Relationships: [];
      };
      qr_scans: {
        Row: {
          id: string;
          qr_code_id: string;
          scanned_at: string;
          referrer: string | null;
          user_agent: string | null;
          ip_hash: string | null;
          country: string | null;
          device: string | null;
        };
        Insert: {
          id?: string;
          qr_code_id: string;
          scanned_at?: string;
          referrer?: string | null;
          user_agent?: string | null;
          ip_hash?: string | null;
          country?: string | null;
          device?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["qr_scans"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "qr_scans_qr_code_id_fkey";
            columns: ["qr_code_id"];
            referencedRelation: "qr_codes";
            referencedColumns: ["id"];
          },
        ];
      };
      social_accounts: {
        Row: {
          id: string;
          owner_id: string;
          platform: "instagram";
          username: string;
          instagram_business_account_id: string;
          profile_picture_url: string | null;
          followers_count: number | null;
          follows_count: number | null;
          media_count: number | null;
          token_expires_at: string | null;
          last_synced_at: string | null;
          sync_status: "pending" | "syncing" | "connected" | "error";
          sync_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          platform?: "instagram";
          username: string;
          instagram_business_account_id: string;
          profile_picture_url?: string | null;
          followers_count?: number | null;
          follows_count?: number | null;
          media_count?: number | null;
          token_expires_at?: string | null;
          last_synced_at?: string | null;
          sync_status?: "pending" | "syncing" | "connected" | "error";
          sync_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["social_accounts"]["Insert"]
        >;
        Relationships: [];
      };
      social_posts: {
        Row: {
          id: string;
          owner_id: string;
          social_account_id: string;
          instagram_media_id: string;
          caption: string | null;
          media_type: string;
          media_url: string | null;
          thumbnail_url: string | null;
          permalink: string;
          published_at: string;
          username: string;
          like_count: number | null;
          comments_count: number | null;
          raw_payload: Json;
          synced_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          social_account_id: string;
          instagram_media_id: string;
          caption?: string | null;
          media_type: string;
          media_url?: string | null;
          thumbnail_url?: string | null;
          permalink: string;
          published_at: string;
          username: string;
          like_count?: number | null;
          comments_count?: number | null;
          raw_payload?: Json;
          synced_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["social_posts"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "social_posts_account_owner_fkey";
            columns: ["social_account_id", "owner_id"];
            referencedRelation: "social_accounts";
            referencedColumns: ["id", "owner_id"];
          },
        ];
      };
      social_sync_logs: {
        Row: {
          id: string;
          owner_id: string;
          social_account_id: string;
          status: "running" | "completed" | "error";
          posts_fetched: number;
          posts_upserted: number;
          error_message: string | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          social_account_id: string;
          status: "running" | "completed" | "error";
          posts_fetched?: number;
          posts_upserted?: number;
          error_message?: string | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["social_sync_logs"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "social_sync_logs_account_owner_fkey";
            columns: ["social_account_id", "owner_id"];
            referencedRelation: "social_accounts";
            referencedColumns: ["id", "owner_id"];
          },
        ];
      };
    };
    Views: {
      qr_code_scan_counts: {
        Row: {
          qr_code_id: string | null;
          scan_count: number | null;
        };
        Relationships: [];
      };
    };
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
      resolve_qr_target: {
        Args: { p_slug: string };
        Returns: { qr_code_id: string; destination_url: string }[];
      };
      log_qr_scan: {
        Args: {
          p_qr_code_id: string;
          p_referrer?: string | null;
          p_user_agent?: string | null;
          p_ip_hash?: string | null;
          p_country?: string | null;
          p_device?: string | null;
        };
        Returns: undefined;
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
export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type QrCodeRecord = Database["public"]["Tables"]["qr_codes"]["Row"];
export type QrScan = Database["public"]["Tables"]["qr_scans"]["Row"];
export type SocialAccount =
  Database["public"]["Tables"]["social_accounts"]["Row"];
export type SocialPost = Database["public"]["Tables"]["social_posts"]["Row"];
export type SocialSyncLog =
  Database["public"]["Tables"]["social_sync_logs"]["Row"];

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
