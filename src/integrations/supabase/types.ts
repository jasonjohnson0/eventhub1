export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          change_details: Json
          created_at: string
          id: string
          record_id: string | null
          table_name: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          change_details?: Json
          created_at?: string
          id?: string
          record_id?: string | null
          table_name?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          change_details?: Json
          created_at?: string
          id?: string
          record_id?: string | null
          table_name?: string | null
        }
        Relationships: []
      }
      auth_oauth_emails: {
        Row: {
          added_to_marketing_list: boolean
          created_at: string
          email: string
          id: string
          provider: Database["public"]["Enums"]["oauth_provider"]
          user_id: string
          verified: boolean
        }
        Insert: {
          added_to_marketing_list?: boolean
          created_at?: string
          email: string
          id?: string
          provider: Database["public"]["Enums"]["oauth_provider"]
          user_id: string
          verified?: boolean
        }
        Update: {
          added_to_marketing_list?: boolean
          created_at?: string
          email?: string
          id?: string
          provider?: Database["public"]["Enums"]["oauth_provider"]
          user_id?: string
          verified?: boolean
        }
        Relationships: []
      }
      bans: {
        Row: {
          banned_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          reason: string | null
          scope: Database["public"]["Enums"]["ban_scope"]
          target_event_id: string | null
          target_user_id: string | null
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          reason?: string | null
          scope: Database["public"]["Enums"]["ban_scope"]
          target_event_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          reason?: string | null
          scope?: Database["public"]["Enums"]["ban_scope"]
          target_event_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bans_target_event_id_fkey"
            columns: ["target_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      billing: {
        Row: {
          amount_cents: number
          coordinator_id: string
          created_at: string
          currency: string
          description: string | null
          external_ref: string | null
          id: string
          sponsor_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          coordinator_id: string
          created_at?: string
          currency?: string
          description?: string | null
          external_ref?: string | null
          id?: string
          sponsor_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          coordinator_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          external_ref?: string | null
          id?: string
          sponsor_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      click_tracking: {
        Row: {
          click_date: string
          clicked_at: string
          device_type: string | null
          event_id: string
          id: string
          referrer: string | null
          user_id: string
        }
        Insert: {
          click_date?: string
          clicked_at?: string
          device_type?: string | null
          event_id: string
          id?: string
          referrer?: string | null
          user_id: string
        }
        Update: {
          click_date?: string
          clicked_at?: string
          device_type?: string | null
          event_id?: string
          id?: string
          referrer?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "click_tracking_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      coordinator_billing_settings: {
        Row: {
          coordinator_id: string
          created_at: string
          monthly_fee_cents: number
          sponsored_enabled: boolean
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          coordinator_id: string
          created_at?: string
          monthly_fee_cents?: number
          sponsored_enabled?: boolean
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          coordinator_id?: string
          created_at?: string
          monthly_fee_cents?: number
          sponsored_enabled?: boolean
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      event_details: {
        Row: {
          created_at: string
          event_id: string
          id: string
          landscape_image_url: string | null
          metadata: Json
          portrait_image_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          landscape_image_url?: string | null
          metadata?: Json
          portrait_image_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          landscape_image_url?: string | null
          metadata?: Json
          portrait_image_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_details_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: Database["public"]["Enums"]["rsvp_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status: Database["public"]["Enums"]["rsvp_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: Database["public"]["Enums"]["rsvp_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          coordinator_id: string
          created_at: string
          description: string | null
          end_time: string
          id: string
          location: string | null
          removed_at: string | null
          removed_by: string | null
          removed_reason: string | null
          start_time: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at: string
        }
        Insert: {
          coordinator_id: string
          created_at?: string
          description?: string | null
          end_time: string
          id?: string
          location?: string | null
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at?: string
        }
        Update: {
          coordinator_id?: string
          created_at?: string
          description?: string | null
          end_time?: string
          id?: string
          location?: string | null
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_consent: {
        Row: {
          confirmation_token: string | null
          confirmed_at: string | null
          email: string
          id: string
          opted_in_at: string
          source: string | null
          status: Database["public"]["Enums"]["consent_status"]
          unsubscribed_at: string | null
          user_id: string | null
        }
        Insert: {
          confirmation_token?: string | null
          confirmed_at?: string | null
          email: string
          id?: string
          opted_in_at?: string
          source?: string | null
          status?: Database["public"]["Enums"]["consent_status"]
          unsubscribed_at?: string | null
          user_id?: string | null
        }
        Update: {
          confirmation_token?: string | null
          confirmed_at?: string | null
          email?: string
          id?: string
          opted_in_at?: string
          source?: string | null
          status?: Database["public"]["Enums"]["consent_status"]
          unsubscribed_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      schema_version: {
        Row: {
          applied_at: string
          description: string | null
          id: string
          version: string
        }
        Insert: {
          applied_at?: string
          description?: string | null
          id?: string
          version: string
        }
        Update: {
          applied_at?: string
          description?: string | null
          id?: string
          version?: string
        }
        Relationships: []
      }
      share_tracking: {
        Row: {
          created_at: string
          event_id: string
          id: string
          share_platform: Database["public"]["Enums"]["share_platform"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          share_platform: Database["public"]["Enums"]["share_platform"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          share_platform?: Database["public"]["Enums"]["share_platform"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_tracking_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      social_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      sponsored_slots: {
        Row: {
          cost_cents: number
          created_at: string
          ends_at: string | null
          event_id: string
          id: string
          position: number
          slot_type: Database["public"]["Enums"]["slot_type"]
          starts_at: string | null
          status: Database["public"]["Enums"]["slot_status"]
          updated_at: string
        }
        Insert: {
          cost_cents?: number
          created_at?: string
          ends_at?: string | null
          event_id: string
          id?: string
          position: number
          slot_type?: Database["public"]["Enums"]["slot_type"]
          starts_at?: string | null
          status?: Database["public"]["Enums"]["slot_status"]
          updated_at?: string
        }
        Update: {
          cost_cents?: number
          created_at?: string
          ends_at?: string | null
          event_id?: string
          id?: string
          position?: number
          slot_type?: Database["public"]["Enums"]["slot_type"]
          starts_at?: string | null
          status?: Database["public"]["Enums"]["slot_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsored_slots_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          buyer_user_id: string | null
          cost_cents: number
          created_at: string
          external_contact: string | null
          external_name: string | null
          id: string
          slot_id: string
        }
        Insert: {
          buyer_user_id?: string | null
          cost_cents?: number
          created_at?: string
          external_contact?: string | null
          external_name?: string | null
          id?: string
          slot_id: string
        }
        Update: {
          buyer_user_id?: string | null
          cost_cents?: number
          created_at?: string
          external_contact?: string | null
          external_name?: string | null
          id?: string
          slot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsors_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "sponsored_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_staff: {
        Row: {
          accepted_at: string | null
          coordinator_id: string
          created_at: string
          id: string
          invitation_expires_at: string | null
          invitation_token: string | null
          invited_at: string
          invited_email: string
          role: Database["public"]["Enums"]["staff_role"]
          staff_user_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          coordinator_id: string
          created_at?: string
          id?: string
          invitation_expires_at?: string | null
          invitation_token?: string | null
          invited_at?: string
          invited_email: string
          role?: Database["public"]["Enums"]["staff_role"]
          staff_user_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          coordinator_id?: string
          created_at?: string
          id?: string
          invitation_expires_at?: string | null
          invitation_token?: string | null
          invited_at?: string
          invited_email?: string
          role?: Database["public"]["Enums"]["staff_role"]
          staff_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _coord_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "coordinator" | "staff" | "user"
      ban_scope: "user" | "event"
      consent_status: "pending" | "confirmed" | "unsubscribed"
      event_status: "draft" | "approved" | "removed"
      oauth_provider: "google" | "apple" | "facebook" | "email"
      payment_status: "pending" | "succeeded" | "failed" | "refunded"
      rsvp_status: "going" | "interested" | "declined"
      share_platform: "facebook" | "twitter" | "email" | "link" | "other"
      slot_status: "available" | "reserved" | "paid" | "expired"
      slot_type: "banner" | "featured" | "sidebar"
      staff_role: "coordinator" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "coordinator", "staff", "user"],
      ban_scope: ["user", "event"],
      consent_status: ["pending", "confirmed", "unsubscribed"],
      event_status: ["draft", "approved", "removed"],
      oauth_provider: ["google", "apple", "facebook", "email"],
      payment_status: ["pending", "succeeded", "failed", "refunded"],
      rsvp_status: ["going", "interested", "declined"],
      share_platform: ["facebook", "twitter", "email", "link", "other"],
      slot_status: ["available", "reserved", "paid", "expired"],
      slot_type: ["banner", "featured", "sidebar"],
      staff_role: ["coordinator", "staff"],
    },
  },
} as const
