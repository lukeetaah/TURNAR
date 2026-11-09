export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrganizationRole = 'owner' | 'admin' | 'instructor' | 'client';

export type ModuleKey =
  | 'agenda'
  | 'bookings'
  | 'clients'
  | 'instructors'
  | 'activities'
  | 'payments'
  | 'communications'
  | 'announcements'
  | 'events'
  | 'community';

export type BookingStatus =
  | 'requested'
  | 'confirmed'
  | 'cancelled'
  | 'waitlisted'
  | 'attended'
  | 'absent';

export type PaymentMethod =
  | 'cash'
  | 'transfer'
  | 'card'
  | 'mercadopago'
  | 'other';

export type PaymentStatus = 'pending' | 'verified' | 'rejected';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          email: string;
          phone: string | null;
          avatar_url: string | null;
          is_platform_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          first_name: string;
          last_name: string;
          email: string;
          phone?: string | null;
          avatar_url?: string | null;
          is_platform_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string;
          last_name?: string;
          email?: string;
          phone?: string | null;
          avatar_url?: string | null;
          is_platform_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          activity_category: string | null;
          logo_url: string | null;
          banner_url: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          is_active: boolean;
          is_custom_setup: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          activity_category?: string | null;
          logo_url?: string | null;
          banner_url?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          is_active?: boolean;
          is_custom_setup?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          activity_category?: string | null;
          logo_url?: string | null;
          banner_url?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          is_active?: boolean;
          is_custom_setup?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      organization_settings: {
        Row: {
          organization_id: string;
          timezone: string;
          cancellation_notice_hours: number;
          allow_waitlist: boolean;
          auto_confirm_bookings: boolean;
          contact_phone_public: boolean;
          contact_email_public: boolean;
          currency_symbol: string;
          accent_color: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          timezone?: string;
          cancellation_notice_hours?: number;
          allow_waitlist?: boolean;
          auto_confirm_bookings?: boolean;
          contact_phone_public?: boolean;
          contact_email_public?: boolean;
          currency_symbol?: string;
          accent_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          timezone?: string;
          cancellation_notice_hours?: number;
          allow_waitlist?: boolean;
          auto_confirm_bookings?: boolean;
          contact_phone_public?: boolean;
          contact_email_public?: boolean;
          currency_symbol?: string;
          accent_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: OrganizationRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      organization_invitations: {
        Row: {
          id: string;
          organization_id: string;
          role: OrganizationRole;
          invitation_token: string;
          invited_email: string | null;
          claimed_by: string | null;
          is_claimed: boolean;
          expires_at: string;
          created_at: string;
          claimed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          role?: OrganizationRole;
          invitation_token?: string;
          invited_email?: string | null;
          claimed_by?: string | null;
          is_claimed?: boolean;
          expires_at?: string;
          created_at?: string;
          claimed_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          role?: OrganizationRole;
          invitation_token?: string;
          invited_email?: string | null;
          claimed_by?: string | null;
          is_claimed?: boolean;
          expires_at?: string;
          created_at?: string;
          claimed_at?: string | null;
        };
      };
      contacts: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          notes: string | null;
          is_minor: boolean;
          birth_date: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          first_name: string;
          last_name: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          is_minor?: boolean;
          birth_date?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string | null;
          first_name?: string;
          last_name?: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          is_minor?: boolean;
          birth_date?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      plans: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          max_organizations: number;
          max_staff: number;
          max_active_contacts: number;
          max_monthly_bookings: number;
          max_active_activities: number;
          max_monthly_emails: number;
          max_storage_bytes: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          max_organizations?: number;
          max_staff?: number;
          max_active_contacts?: number;
          max_monthly_bookings?: number;
          max_active_activities?: number;
          max_monthly_emails?: number;
          max_storage_bytes?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          description?: string | null;
          max_organizations?: number;
          max_staff?: number;
          max_active_contacts?: number;
          max_monthly_bookings?: number;
          max_active_activities?: number;
          max_monthly_emails?: number;
          max_storage_bytes?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      usage_counters: {
        Row: {
          id: string;
          organization_id: string;
          period_id: string;
          bookings_count: number;
          emails_sent_count: number;
          storage_used_bytes: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          period_id: string;
          bookings_count?: number;
          emails_sent_count?: number;
          storage_used_bytes?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          period_id?: string;
          bookings_count?: number;
          emails_sent_count?: number;
          storage_used_bytes?: number;
          updated_at?: string;
        };
      };
      bookings: {
        Row: {
          id: string;
          organization_id: string;
          session_id: string;
          contact_id: string;
          status: BookingStatus;
          cancellation_reason: string | null;
          cancellation_token_hash: string | null;
          cancelled_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          session_id: string;
          contact_id: string;
          status?: BookingStatus;
          cancellation_reason?: string | null;
          cancellation_token_hash?: string | null;
          cancelled_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          session_id?: string;
          contact_id?: string;
          status?: BookingStatus;
          cancellation_reason?: string | null;
          cancellation_token_hash?: string | null;
          cancelled_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          organization_id: string;
          contact_id: string;
          price_version_id: string | null;
          amount_cents: number;
          method: PaymentMethod;
          status: PaymentStatus;
          period_month: number | null;
          period_year: number | null;
          payment_date: string;
          reference_code: string | null;
          notes: string | null;
          recorded_by: string | null;
          verified_by: string | null;
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contact_id: string;
          price_version_id?: string | null;
          amount_cents: number;
          method?: PaymentMethod;
          status?: PaymentStatus;
          period_month?: number | null;
          period_year?: number | null;
          payment_date?: string;
          reference_code?: string | null;
          notes?: string | null;
          recorded_by?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contact_id?: string;
          price_version_id?: string | null;
          amount_cents?: number;
          method?: PaymentMethod;
          status?: PaymentStatus;
          period_month?: number | null;
          period_year?: number | null;
          payment_date?: string;
          reference_code?: string | null;
          notes?: string | null;
          recorded_by?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}
