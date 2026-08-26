// Database types for the TD Studios invoice app.
//
// These mirror supabase/migrations/0001_initial_schema.sql. If you change the
// schema, regenerate or update these to match. With the Supabase CLI you can run:
//   supabase gen types typescript --local > lib/types/database.ts

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

// Maps to the three private-storage prefixes (uploads/, final-files/, invoices/).
export type FileCategory = "uploads" | "final_files" | "invoices";

// Lifecycle of a client project (see lib/projects.ts for labels/ordering).
export type ProjectStatus =
  | "draft"
  | "in_progress"
  | "awaiting_review"
  | "revision_requested"
  | "approved"
  | "completed"
  | "archived";

// Dashboard task manager (migration 0022).
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

// Public Custom Mylar Printing inquiry wizard (migration 0023). Stored as
// text + check constraints rather than pg enums so the lists stay easy to
// extend — see lib/mylar-printing/types.ts for the labelled domain model.
export type MylarBagType =
  | "3.5g-4x5"
  | "3.5g-sideways-5x4"
  | "2in1-8x5"
  | "pound-bag";
export type MylarInquiryStatus =
  | "new"
  | "reviewing"
  | "quoted"
  | "approved"
  | "printing"
  | "completed"
  | "cancelled";

// Artwork slot on a design (migration 0024). Same text + check reasoning as
// above: adding a third slot later widens a constraint instead of altering an
// enum type. `MylarArtworkSide` in lib/mylar-printing/types.ts re-exports this.
export type MylarArtworkSideValue = "front" | "back";

// Preferred first contact channel (migration 0025). Informational only —
// nothing in this app messages a customer; this records which channel a human
// should open with. Nullable on the row: inquiries filed before the field
// existed genuinely stated nothing, and null says so.
export type MylarContactMethod = "text" | "call" | "email";

// Print-partner job portal (migration 20260825120000). Same text + check
// reasoning as the mylar/design-request lists above: the product line-up will
// grow, and a check constraint can be widened in one statement where
// `alter type ... add value` cannot run in a transaction. Labels and the
// runtime arrays live in lib/partner-jobs/types.ts — widen both together.
export type PartnerProductType =
  | "eighth_bag"
  | "seven_gram_bag"
  | "two_in_one_bag"
  | "pound_bag"
  | "jar_100ml"
  | "jar_150ml"
  | "jar_250ml";
export type PartnerProductFinish = "matte" | "spot_gloss";
export type DesignJobStatus = "new" | "in_progress" | "completed";

export type CustomDesignType = "Bag design" | "Jar design" | "Other";
export type CustomDesignRequestStatus =
  | "new"
  | "reviewing"
  | "quoted"
  | "in_progress"
  | "completed"
  | "cancelled";

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
          must_change_password: boolean;
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
          must_change_password?: boolean;
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
      client_file_favorites: {
        Row: {
          id: string;
          user_id: string;
          file_id: string;
          client_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          file_id: string;
          client_id: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["client_file_favorites"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "client_file_favorites_file_id_fkey";
            columns: ["file_id"];
            referencedRelation: "client_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_file_favorites_client_id_fkey";
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
          project_id: string | null;
          category: FileCategory;
          storage_path: string;
          name: string;
          size_bytes: number;
          mime_type: string | null;
          uploaded_by: string | null;
          archived_at: string | null;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          client_id: string;
          folder_id?: string | null;
          project_id?: string | null;
          category?: FileCategory;
          storage_path: string;
          name: string;
          size_bytes?: number;
          mime_type?: string | null;
          uploaded_by?: string | null;
          archived_at?: string | null;
          display_order?: number;
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
          {
            foreignKeyName: "client_files_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "client_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      client_projects: {
        Row: {
          id: string;
          owner_id: string | null;
          client_id: string;
          name: string;
          description: string | null;
          status: ProjectStatus;
          due_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          client_id: string;
          name: string;
          description?: string | null;
          status?: ProjectStatus;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["client_projects"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "client_projects_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
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
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          instagram: string | null;
          business_name: string | null;
          onboarded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          instagram?: string | null;
          business_name?: string | null;
          onboarded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
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
      qr_generations: {
        Row: {
          id: string;
          owner_id: string | null;
          source: "public" | "admin";
          type: "url" | "instagram" | "text";
          content: string;
          style_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          source?: "public" | "admin";
          type?: "url" | "instagram" | "text";
          content: string;
          style_json?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["qr_generations"]["Insert"]>;
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
      tasks: {
        Row: {
          id: string;
          owner_id: string;
          client_id: string | null;
          title: string;
          notes: string | null;
          status: TaskStatus;
          priority: TaskPriority;
          due_date: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          client_id?: string | null;
          title: string;
          notes?: string | null;
          status?: TaskStatus;
          priority?: TaskPriority;
          due_date?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      mylar_printing_inquiries: {
        Row: {
          id: string;
          reference_number: string;
          bag_type: MylarBagType;
          quantity: number;
          design_count: number;
          artwork_coming_later: boolean;
          front_artwork_path: string | null;
          front_artwork_name: string | null;
          front_artwork_size: number | null;
          front_artwork_mime_type: string | null;
          back_artwork_path: string | null;
          back_artwork_name: string | null;
          back_artwork_size: number | null;
          back_artwork_mime_type: string | null;
          customer_name: string;
          customer_email: string;
          customer_phone: string | null;
          // Lead detail fields (migration 0025). Nullable because inquiries
          // filed before they existed stated nothing — null means "not stated",
          // never a defaulted guess.
          brand_name: string | null;
          contact_method: MylarContactMethod | null;
          needed_by: string | null;
          notes: string | null;
          status: MylarInquiryStatus;
          submitter_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reference_number: string;
          bag_type: MylarBagType;
          quantity: number;
          design_count: number;
          artwork_coming_later?: boolean;
          front_artwork_path?: string | null;
          front_artwork_name?: string | null;
          front_artwork_size?: number | null;
          front_artwork_mime_type?: string | null;
          back_artwork_path?: string | null;
          back_artwork_name?: string | null;
          back_artwork_size?: number | null;
          back_artwork_mime_type?: string | null;
          customer_name: string;
          customer_email: string;
          customer_phone?: string | null;
          brand_name?: string | null;
          contact_method?: MylarContactMethod | null;
          needed_by?: string | null;
          notes?: string | null;
          status?: MylarInquiryStatus;
          submitter_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["mylar_printing_inquiries"]["Insert"]
        >;
        Relationships: [];
      };
      mylar_designs: {
        Row: {
          id: string;
          inquiry_id: string;
          design_number: number;
          quantity: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          inquiry_id: string;
          design_number: number;
          quantity: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["mylar_designs"]["Insert"]>;
        Relationships: [];
      };
      mylar_artwork_files: {
        Row: {
          id: string;
          design_id: string;
          side: MylarArtworkSideValue;
          storage_path: string;
          file_name: string;
          file_size: number;
          mime_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          design_id: string;
          side: MylarArtworkSideValue;
          storage_path: string;
          file_name: string;
          file_size: number;
          mime_type: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["mylar_artwork_files"]["Insert"]
        >;
        Relationships: [];
      };
      custom_design_requests: {
        Row: {
          id: string;
          reference_number: string;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          instagram_username: string;
          design_type: CustomDesignType;
          notes: string;
          status: CustomDesignRequestStatus;
          submitter_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reference_number: string;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          instagram_username: string;
          design_type: CustomDesignType;
          notes: string;
          status?: CustomDesignRequestStatus;
          submitter_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["custom_design_requests"]["Insert"]
        >;
        Relationships: [];
      };
      custom_design_request_files: {
        Row: {
          id: string;
          request_id: string;
          storage_path: string;
          file_name: string;
          file_size: number;
          mime_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          storage_path: string;
          file_name: string;
          file_size: number;
          mime_type: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["custom_design_request_files"]["Insert"]
        >;
        Relationships: [];
      };
      workspace_admins: {
        Row: {
          user_id: string;
          added_at: string;
          note: string | null;
        };
        Insert: {
          user_id: string;
          added_at?: string;
          note?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["workspace_admins"]["Insert"]
        >;
        Relationships: [];
      };
      workspace_owner: {
        Row: {
          singleton: boolean;
          owner_id: string;
        };
        Insert: {
          singleton?: boolean;
          owner_id: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["workspace_owner"]["Insert"]
        >;
        Relationships: [];
      };
      partner_companies: {
        Row: {
          id: string;
          name: string;
          slug: string;
          job_prefix: string;
          next_job_number: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          job_prefix: string;
          next_job_number?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["partner_companies"]["Insert"]
        >;
        Relationships: [];
      };
      partner_users: {
        Row: {
          id: string;
          user_id: string;
          company_id: string;
          display_name: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_id: string;
          display_name?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["partner_users"]["Insert"]
        >;
        Relationships: [];
      };
      design_jobs: {
        Row: {
          id: string;
          company_id: string;
          submitted_by: string | null;
          job_number: string;
          job_name: string;
          status: DesignJobStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        // job_number is assigned by a BEFORE INSERT trigger and is never
        // accepted from the client, so it is absent here on purpose.
        Insert: {
          id?: string;
          company_id: string;
          submitted_by?: string | null;
          job_name: string;
          status?: DesignJobStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["design_jobs"]["Insert"]
        > & { status?: DesignJobStatus };
        Relationships: [];
      };
      design_job_items: {
        Row: {
          id: string;
          job_id: string;
          product_type: PartnerProductType;
          finish: PartnerProductFinish;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          product_type: PartnerProductType;
          finish: PartnerProductFinish;
          quantity: number;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["design_job_items"]["Insert"]
        >;
        Relationships: [];
      };
      design_job_files: {
        Row: {
          id: string;
          job_id: string;
          storage_path: string;
          original_filename: string;
          mime_type: string | null;
          file_size: number;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          storage_path: string;
          original_filename: string;
          mime_type?: string | null;
          file_size: number;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["design_job_files"]["Insert"]
        >;
        Relationships: [];
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
      // The owner_id the caller may read and write: the canonical workspace
      // owner for a workspace admin, auth.uid() for everyone else. The single
      // source of truth shared by RLS and the app (see currentOwnerId()).
      current_owner_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      list_premade_design_paths: {
        Args: Record<string, never>;
        Returns: Json;
      };
      next_invoice_number: {
        Args: Record<string, never>;
        Returns: string;
      };
      portal_client_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      // Print-partner membership (migration 20260825120000), mirroring
      // portal_client_id()/is_portal_user() above.
      partner_company_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      is_partner_user: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      // Files a whole job — row, items and files — in ONE transaction, under
      // the caller's own RLS (security invoker). See the migration.
      // Replaces a job's name, notes and item set in ONE transaction, under the
      // caller's own RLS (security invoker). See migration 20260826000000.
      update_design_job: {
        Args: {
          p_job_id: string;
          p_job_name: string;
          p_notes: string | null;
          p_items: Json;
        };
        Returns: { job_id: string; job_number: string }[];
      };
      create_design_job: {
        Args: {
          p_job_id: string;
          p_job_name: string;
          p_notes: string | null;
          p_items: Json;
          p_files: Json;
        };
        Returns: { job_id: string; job_number: string }[];
      };
      is_portal_user: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      portal_can_upload: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      clear_must_change_password: {
        Args: Record<string, never>;
        Returns: undefined;
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
      log_qr_generation: {
        Args: {
          p_content: string;
          p_type?: string;
          p_source?: string;
          p_style?: Json;
        };
        Returns: undefined;
      };
    };
    Enums: {
      invoice_status: InvoiceStatus;
      file_category: FileCategory;
      project_status: ProjectStatus;
      task_status: TaskStatus;
      task_priority: TaskPriority;
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
export type ClientFileFavorite =
  Database["public"]["Tables"]["client_file_favorites"]["Row"];
export type ClientProject =
  Database["public"]["Tables"]["client_projects"]["Row"];
export type FileActivity =
  Database["public"]["Tables"]["file_activity"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type QrCodeRecord = Database["public"]["Tables"]["qr_codes"]["Row"];
export type QrGeneration =
  Database["public"]["Tables"]["qr_generations"]["Row"];
export type QrScan = Database["public"]["Tables"]["qr_scans"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type MylarPrintingInquiry =
  Database["public"]["Tables"]["mylar_printing_inquiries"]["Row"];
export type MylarDesignRow = Database["public"]["Tables"]["mylar_designs"]["Row"];
export type MylarArtworkFileRow =
  Database["public"]["Tables"]["mylar_artwork_files"]["Row"];
export type CustomDesignRequestRow =
  Database["public"]["Tables"]["custom_design_requests"]["Row"];
export type CustomDesignRequestFileRow =
  Database["public"]["Tables"]["custom_design_request_files"]["Row"];
export type CustomDesignRequestWithFiles = CustomDesignRequestRow & {
  files: CustomDesignRequestFileRow[];
};

/**
 * An inquiry with its designs and each design's artwork, as assembled by
 * lib/mylar-printing/queries.ts. The legacy front_artwork_* / back_artwork_*
 * columns are still on `MylarPrintingInquiry` (migration 0024 backfilled rather
 * than dropped them) — read `designs` instead; nothing in the app writes the
 * legacy columns any more.
 */
export type MylarDesignWithArtwork = MylarDesignRow & {
  artwork: MylarArtworkFileRow[];
};

export type MylarInquiryWithDesigns = MylarPrintingInquiry & {
  designs: MylarDesignWithArtwork[];
};

// Composed shapes returned by joined queries.
export type TaskWithClient = Task & {
  client: Pick<Client, "id" | "company_name"> | null;
};
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

// A project plus how many files are attached to it.
export type ClientProjectWithFileCount = ClientProject & {
  file_count: number;
};

// Print-partner job portal (migration 20260825120000).
export type PartnerCompany =
  Database["public"]["Tables"]["partner_companies"]["Row"];
export type PartnerUser = Database["public"]["Tables"]["partner_users"]["Row"];
export type DesignJob = Database["public"]["Tables"]["design_jobs"]["Row"];
export type DesignJobItem =
  Database["public"]["Tables"]["design_job_items"]["Row"];
export type DesignJobFile =
  Database["public"]["Tables"]["design_job_files"]["Row"];

/** A dashboard row: the job plus how many products it holds. */
export type DesignJobListItem = DesignJob & { item_count: number };

/** One job with everything the detail pages render. */
export type DesignJobWithDetail = DesignJob & {
  items: DesignJobItem[];
  files: DesignJobFile[];
};

/** The admin list additionally names the company a job came from. */
export type AdminDesignJobListItem = DesignJobListItem & {
  company: Pick<PartnerCompany, "id" | "name" | "slug"> | null;
};

export type AdminDesignJobDetail = DesignJobWithDetail & {
  company: PartnerCompany | null;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
};
