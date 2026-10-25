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
      api_rate_buckets: {
        Row: {
          count: number
          key_id: string
          window_start: string
        }
        Insert: {
          count?: number
          key_id: string
          window_start: string
        }
        Update: {
          count?: number
          key_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_rate_buckets_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "coordinator_api_keys"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
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
          period_month: string | null
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
          period_month?: string | null
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
          period_month?: string | null
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
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "click_tracking_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      coordinator_api_keys: {
        Row: {
          coordinator_id: string
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          secret_hash: string
        }
        Insert: {
          coordinator_id: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          secret_hash: string
        }
        Update: {
          coordinator_id?: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          secret_hash?: string
        }
        Relationships: []
      }
      coordinator_billing_settings: {
        Row: {
          coordinator_id: string
          created_at: string
          grace_ends_at: string | null
          monthly_fee_cents: number
          sponsored_enabled: boolean
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          coordinator_id: string
          created_at?: string
          grace_ends_at?: string | null
          monthly_fee_cents?: number
          sponsored_enabled?: boolean
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          coordinator_id?: string
          created_at?: string
          grace_ends_at?: string | null
          monthly_fee_cents?: number
          sponsored_enabled?: boolean
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coordinator_chat_hooks: {
        Row: {
          coordinator_id: string
          discord_webhook_url: string | null
          notify_event_cancelled: boolean
          notify_rsvp_going: boolean
          notify_submission: boolean
          notify_ticket_sold: boolean
          slack_webhook_url: string | null
          updated_at: string
        }
        Insert: {
          coordinator_id: string
          discord_webhook_url?: string | null
          notify_event_cancelled?: boolean
          notify_rsvp_going?: boolean
          notify_submission?: boolean
          notify_ticket_sold?: boolean
          slack_webhook_url?: string | null
          updated_at?: string
        }
        Update: {
          coordinator_id?: string
          discord_webhook_url?: string | null
          notify_event_cancelled?: boolean
          notify_rsvp_going?: boolean
          notify_submission?: boolean
          notify_ticket_sold?: boolean
          slack_webhook_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coordinator_ical_feeds: {
        Row: {
          coordinator_id: string
          created_at: string
          feed_token: string
          updated_at: string
        }
        Insert: {
          coordinator_id: string
          created_at?: string
          feed_token?: string
          updated_at?: string
        }
        Update: {
          coordinator_id?: string
          created_at?: string
          feed_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      coordinator_profiles: {
        Row: {
          ad_mode: string
          ad_mode_last_choice: string
          ads_last_local: boolean
          ads_last_network: boolean
          ads_local: boolean
          ads_network: boolean
          company_name: string | null
          contact_email: string | null
          coordinator_id: string
          created_at: string
          currency: string
          custom_css: string | null
          custom_domain: string | null
          demo_seeded_at: string | null
          description: string | null
          dns_records_acknowledged: boolean
          email_provider: Database["public"]["Enums"]["email_provider_type"]
          favicon_url: string | null
          full_name: string | null
          header_image_url: string | null
          language: string
          logo_url: string | null
          phone: string | null
          primary_color: string
          secondary_color: string
          server_config: Json
          setup_completed_at: string | null
          setup_step: number
          show_nearby_events: boolean
          slug: string | null
          terms_accepted_at: string | null
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          ad_mode?: string
          ad_mode_last_choice?: string
          ads_last_local?: boolean
          ads_last_network?: boolean
          ads_local?: boolean
          ads_network?: boolean
          company_name?: string | null
          contact_email?: string | null
          coordinator_id: string
          created_at?: string
          currency?: string
          custom_css?: string | null
          custom_domain?: string | null
          demo_seeded_at?: string | null
          description?: string | null
          dns_records_acknowledged?: boolean
          email_provider?: Database["public"]["Enums"]["email_provider_type"]
          favicon_url?: string | null
          full_name?: string | null
          header_image_url?: string | null
          language?: string
          logo_url?: string | null
          phone?: string | null
          primary_color?: string
          secondary_color?: string
          server_config?: Json
          setup_completed_at?: string | null
          setup_step?: number
          show_nearby_events?: boolean
          slug?: string | null
          terms_accepted_at?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          ad_mode?: string
          ad_mode_last_choice?: string
          ads_last_local?: boolean
          ads_last_network?: boolean
          ads_local?: boolean
          ads_network?: boolean
          company_name?: string | null
          contact_email?: string | null
          coordinator_id?: string
          created_at?: string
          currency?: string
          custom_css?: string | null
          custom_domain?: string | null
          demo_seeded_at?: string | null
          description?: string | null
          dns_records_acknowledged?: boolean
          email_provider?: Database["public"]["Enums"]["email_provider_type"]
          favicon_url?: string | null
          full_name?: string | null
          header_image_url?: string | null
          language?: string
          logo_url?: string | null
          phone?: string | null
          primary_color?: string
          secondary_color?: string
          server_config?: Json
          setup_completed_at?: string | null
          setup_step?: number
          show_nearby_events?: boolean
          slug?: string | null
          terms_accepted_at?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      coordinator_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          coordinator_id: string
          created_at: string
          current_period_end: string | null
          status: Database["public"]["Enums"]["annual_plan_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          coordinator_id: string
          created_at?: string
          current_period_end?: string | null
          status?: Database["public"]["Enums"]["annual_plan_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          coordinator_id?: string
          created_at?: string
          current_period_end?: string | null
          status?: Database["public"]["Enums"]["annual_plan_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      demo_event_templates: {
        Row: {
          category: Database["public"]["Enums"]["event_category"]
          description: string | null
          duration: string
          id: string
          location: string | null
          start_offset: string
          tags: string[]
          title: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["event_category"]
          description?: string | null
          duration: string
          id?: string
          location?: string | null
          start_offset: string
          tags?: string[]
          title: string
        }
        Update: {
          category?: Database["public"]["Enums"]["event_category"]
          description?: string | null
          duration?: string
          id?: string
          location?: string | null
          start_offset?: string
          tags?: string[]
          title?: string
        }
        Relationships: []
      }
      email_sends: {
        Row: {
          clicked_at: string | null
          coordinator_id: string
          created_at: string
          error: string | null
          event_id: string | null
          id: string
          invitation_id: string | null
          opened_at: string | null
          provider: string | null
          provider_message_id: string | null
          recipient_email: string
          recipient_user_id: string | null
          sent_at: string | null
          status: string
          subject: string | null
          type: string
        }
        Insert: {
          clicked_at?: string | null
          coordinator_id: string
          created_at?: string
          error?: string | null
          event_id?: string | null
          id?: string
          invitation_id?: string | null
          opened_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient_email: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          type: string
        }
        Update: {
          clicked_at?: string | null
          coordinator_id?: string
          created_at?: string
          error?: string | null
          event_id?: string | null
          id?: string
          invitation_id?: string | null
          opened_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sends_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "email_sends_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "event_invitations"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_details_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_field_schemas: {
        Row: {
          coordinator_id: string
          created_at: string
          display_order: number
          field_name: string
          field_type: Database["public"]["Enums"]["custom_field_type"]
          id: string
          is_required: boolean
          options: Json
          updated_at: string
        }
        Insert: {
          coordinator_id: string
          created_at?: string
          display_order?: number
          field_name: string
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          is_required?: boolean
          options?: Json
          updated_at?: string
        }
        Update: {
          coordinator_id?: string
          created_at?: string
          display_order?: number
          field_name?: string
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          is_required?: boolean
          options?: Json
          updated_at?: string
        }
        Relationships: []
      }
      event_field_values: {
        Row: {
          created_at: string
          event_id: string
          field_id: string
          id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          field_id: string
          id?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          field_id?: string
          id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_field_values_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_field_values_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "event_field_schemas"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invitations: {
        Row: {
          clicked_at: string | null
          created_at: string
          custom_message: string | null
          event_id: string
          id: string
          opened_at: string | null
          recipient_email: string
          rsvp_status: Database["public"]["Enums"]["invitation_rsvp_status"]
          sent_at: string
          sent_by: string
          token: string
          updated_at: string
        }
        Insert: {
          clicked_at?: string | null
          created_at?: string
          custom_message?: string | null
          event_id: string
          id?: string
          opened_at?: string | null
          recipient_email: string
          rsvp_status?: Database["public"]["Enums"]["invitation_rsvp_status"]
          sent_at?: string
          sent_by: string
          token?: string
          updated_at?: string
        }
        Update: {
          clicked_at?: string | null
          created_at?: string
          custom_message?: string | null
          event_id?: string
          id?: string
          opened_at?: string | null
          recipient_email?: string
          rsvp_status?: Database["public"]["Enums"]["invitation_rsvp_status"]
          sent_at?: string
          sent_by?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_invitations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_invitations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invites: {
        Row: {
          created_at: string
          email: string | null
          event_id: string
          id: string
          invited_by: string | null
          message: string | null
          responded_at: string | null
          status: Database["public"]["Enums"]["event_invite_status"]
          token_hash: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          event_id: string
          id?: string
          invited_by?: string | null
          message?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["event_invite_status"]
          token_hash?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          event_id?: string
          id?: string
          invited_by?: string | null
          message?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["event_invite_status"]
          token_hash?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_locations: {
        Row: {
          created_at: string
          event_id: string
          id: string
          latitude: number
          location_name: string
          longitude: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          latitude: number
          location_name: string
          longitude: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          latitude?: number
          location_name?: string
          longitude?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_locations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_locations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_organizers: {
        Row: {
          created_at: string
          display_order: number
          event_id: string
          id: string
          organizer_id: string
          role: Database["public"]["Enums"]["person_kind"]
        }
        Insert: {
          created_at?: string
          display_order?: number
          event_id: string
          id?: string
          organizer_id: string
          role?: Database["public"]["Enums"]["person_kind"]
        }
        Update: {
          created_at?: string
          display_order?: number
          event_id?: string
          id?: string
          organizer_id?: string
          role?: Database["public"]["Enums"]["person_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "event_organizers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_organizers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_organizers_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      event_photos: {
        Row: {
          caption: string | null
          created_at: string
          event_id: string
          id: string
          photo_url: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          event_id: string
          id?: string
          photo_url: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          event_id?: string
          id?: string
          photo_url?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          checked_in_at: string | null
          created_at: string
          event_id: string
          id: string
          status: Database["public"]["Enums"]["rsvp_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          checked_in_at?: string | null
          created_at?: string
          event_id: string
          id?: string
          status: Database["public"]["Enums"]["rsvp_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          checked_in_at?: string | null
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
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_series: {
        Row: {
          category: Database["public"]["Enums"]["event_category"]
          coordinator_id: string
          created_at: string
          description: string | null
          dtstart: string
          duration_minutes: number
          id: string
          location: string | null
          rrule: string
          tags: string[]
          timezone: string
          title: string
          until: string | null
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["event_category"]
          coordinator_id: string
          created_at?: string
          description?: string | null
          dtstart: string
          duration_minutes: number
          id?: string
          location?: string | null
          rrule: string
          tags?: string[]
          timezone?: string
          title: string
          until?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["event_category"]
          coordinator_id?: string
          created_at?: string
          description?: string | null
          dtstart?: string
          duration_minutes?: number
          id?: string
          location?: string | null
          rrule?: string
          tags?: string[]
          timezone?: string
          title?: string
          until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      event_submissions: {
        Row: {
          coordinator_id: string | null
          created_at: string
          created_event_id: string | null
          event_data: Json
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["submission_status"]
          submitted_at: string
          submitted_by_email: string
          updated_at: string
        }
        Insert: {
          coordinator_id?: string | null
          created_at?: string
          created_event_id?: string | null
          event_data: Json
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          submitted_by_email: string
          updated_at?: string
        }
        Update: {
          coordinator_id?: string | null
          created_at?: string
          created_event_id?: string | null
          event_data?: Json
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          submitted_by_email?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_submissions_created_event_id_fkey"
            columns: ["created_event_id"]
            isOneToOne: false
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_submissions_created_event_id_fkey"
            columns: ["created_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tickets: {
        Row: {
          created_at: string
          description: string | null
          early_bird: boolean
          early_bird_price_cents: number | null
          event_id: string
          id: string
          name: string
          price_cents: number
          quantity_available: number
          quantity_sold: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          early_bird?: boolean
          early_bird_price_cents?: number | null
          event_id: string
          id?: string
          name: string
          price_cents?: number
          quantity_available?: number
          quantity_sold?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          early_bird?: boolean
          early_bird_price_cents?: number | null
          event_id?: string
          id?: string
          name?: string
          price_cents?: number
          quantity_available?: number
          quantity_sold?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_waitlist: {
        Row: {
          added_at: string
          event_id: string
          id: string
          position: number
          status: Database["public"]["Enums"]["waitlist_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          added_at?: string
          event_id: string
          id?: string
          position: number
          status?: Database["public"]["Enums"]["waitlist_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          added_at?: string
          event_id?: string
          id?: string
          position?: number
          status?: Database["public"]["Enums"]["waitlist_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          category: Database["public"]["Enums"]["event_category"]
          coordinator_id: string
          created_at: string
          description: string | null
          end_time: string
          event_format: Database["public"]["Enums"]["event_format"]
          has_waitlist: boolean
          id: string
          is_demo: boolean
          is_exception: boolean
          livestream_provider: Database["public"]["Enums"]["livestream_provider"]
          location: string | null
          max_capacity: number | null
          removed_at: string | null
          removed_by: string | null
          removed_reason: string | null
          series_id: string | null
          series_original_start: string | null
          start_time: string
          status: Database["public"]["Enums"]["event_status"]
          tags: string[]
          timezone: string
          title: string
          updated_at: string
          venue_id: string | null
          virtual_link: string | null
          visibility: Database["public"]["Enums"]["event_visibility"]
        }
        Insert: {
          category?: Database["public"]["Enums"]["event_category"]
          coordinator_id: string
          created_at?: string
          description?: string | null
          end_time: string
          event_format?: Database["public"]["Enums"]["event_format"]
          has_waitlist?: boolean
          id?: string
          is_demo?: boolean
          is_exception?: boolean
          livestream_provider?: Database["public"]["Enums"]["livestream_provider"]
          location?: string | null
          max_capacity?: number | null
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
          series_id?: string | null
          series_original_start?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["event_status"]
          tags?: string[]
          timezone: string
          title: string
          updated_at?: string
          venue_id?: string | null
          virtual_link?: string | null
          visibility?: Database["public"]["Enums"]["event_visibility"]
        }
        Update: {
          category?: Database["public"]["Enums"]["event_category"]
          coordinator_id?: string
          created_at?: string
          description?: string | null
          end_time?: string
          event_format?: Database["public"]["Enums"]["event_format"]
          has_waitlist?: boolean
          id?: string
          is_demo?: boolean
          is_exception?: boolean
          livestream_provider?: Database["public"]["Enums"]["livestream_provider"]
          location?: string | null
          max_capacity?: number | null
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
          series_id?: string | null
          series_original_start?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["event_status"]
          tags?: string[]
          timezone?: string
          title?: string
          updated_at?: string
          venue_id?: string | null
          virtual_link?: string | null
          visibility?: Database["public"]["Enums"]["event_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
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
      notification_preferences: {
        Row: {
          created_at: string
          days_before: number[]
          email_reminders: boolean
          push_reminders: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days_before?: number[]
          email_reminders?: boolean
          push_reminders?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days_before?: number[]
          email_reminders?: boolean
          push_reminders?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organizers: {
        Row: {
          bio: string | null
          coordinator_id: string
          created_at: string
          credentials: string | null
          id: string
          kind: Database["public"]["Enums"]["person_kind"]
          name: string
          photo_url: string | null
          social_links: Json
          title: string | null
          updated_at: string
        }
        Insert: {
          bio?: string | null
          coordinator_id: string
          created_at?: string
          credentials?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["person_kind"]
          name: string
          photo_url?: string | null
          social_links?: Json
          title?: string | null
          updated_at?: string
        }
        Update: {
          bio?: string | null
          coordinator_id?: string
          created_at?: string
          credentials?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["person_kind"]
          name?: string
          photo_url?: string | null
          social_links?: Json
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_config: {
        Row: {
          configured_at: string | null
          created_at: string
          email_api_key: string | null
          email_configured: boolean
          email_extra: Json | null
          email_from_address: string | null
          email_from_name: string | null
          email_provider: Database["public"]["Enums"]["email_provider_type"]
          id: string
          stripe_connect_account_id: string | null
          stripe_connected: boolean
          stripe_connected_at: string | null
          stripe_publishable_key: string | null
          stripe_secret_key: string | null
          updated_at: string
          use_custom_stripe: boolean
        }
        Insert: {
          configured_at?: string | null
          created_at?: string
          email_api_key?: string | null
          email_configured?: boolean
          email_extra?: Json | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_provider?: Database["public"]["Enums"]["email_provider_type"]
          id?: string
          stripe_connect_account_id?: string | null
          stripe_connected?: boolean
          stripe_connected_at?: string | null
          stripe_publishable_key?: string | null
          stripe_secret_key?: string | null
          updated_at?: string
          use_custom_stripe?: boolean
        }
        Update: {
          configured_at?: string | null
          created_at?: string
          email_api_key?: string | null
          email_configured?: boolean
          email_extra?: Json | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_provider?: Database["public"]["Enums"]["email_provider_type"]
          id?: string
          stripe_connect_account_id?: string | null
          stripe_connected?: boolean
          stripe_connected_at?: string | null
          stripe_publishable_key?: string | null
          stripe_secret_key?: string | null
          updated_at?: string
          use_custom_stripe?: boolean
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
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
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
      sponsor_ad_stats: {
        Row: {
          first_seen: string
          hits: number
          kind: string
          last_seen: string
          slot_id: string
          stat_date: string
          surface: string
          visitor_hash: string
        }
        Insert: {
          first_seen?: string
          hits?: number
          kind: string
          last_seen?: string
          slot_id: string
          stat_date: string
          surface: string
          visitor_hash: string
        }
        Update: {
          first_seen?: string
          hits?: number
          kind?: string
          last_seen?: string
          slot_id?: string
          stat_date?: string
          surface?: string
          visitor_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_ad_stats_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "sponsored_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_campaign_calendars: {
        Row: {
          campaign_id: string
          coordinator_id: string
        }
        Insert: {
          campaign_id: string
          coordinator_id: string
        }
        Update: {
          campaign_id?: string
          coordinator_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_campaign_calendars_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsor_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_campaign_creatives: {
        Row: {
          body: string | null
          business_name: string
          campaign_id: string
          headline: string | null
          link_url: string | null
          logo_url: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          business_name: string
          campaign_id: string
          headline?: string | null
          link_url?: string | null
          logo_url?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          business_name?: string
          campaign_id?: string
          headline?: string | null
          link_url?: string | null
          logo_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_campaign_creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "sponsor_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_campaign_geo: {
        Row: {
          campaign_id: string
          center_zip: string | null
          radius_miles: number | null
          zips: string[]
        }
        Insert: {
          campaign_id: string
          center_zip?: string | null
          radius_miles?: number | null
          zips?: string[]
        }
        Update: {
          campaign_id?: string
          center_zip?: string | null
          radius_miles?: number | null
          zips?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_campaign_geo_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "sponsor_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_campaign_stats: {
        Row: {
          campaign_id: string
          first_seen: string
          hits: number
          kind: string
          last_seen: string
          stat_date: string
          surface: string
          visitor_hash: string
        }
        Insert: {
          campaign_id: string
          first_seen?: string
          hits?: number
          kind: string
          last_seen?: string
          stat_date: string
          surface: string
          visitor_hash: string
        }
        Update: {
          campaign_id?: string
          first_seen?: string
          hits?: number
          kind?: string
          last_seen?: string
          stat_date?: string
          surface?: string
          visitor_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_campaign_stats_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsor_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_campaigns: {
        Row: {
          buyer_user_id: string
          contact_email: string | null
          contact_name: string | null
          created_at: string
          currency: string
          ends_on: string
          event_id: string | null
          id: string
          paid_at: string | null
          price_cents: number
          refunded_at: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scope: Database["public"]["Enums"]["sponsor_scope"]
          starts_on: string
          status: Database["public"]["Enums"]["campaign_status"]
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          tz: string
          updated_at: string
        }
        Insert: {
          buyer_user_id: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          currency?: string
          ends_on: string
          event_id?: string | null
          id?: string
          paid_at?: string | null
          price_cents?: number
          refunded_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope: Database["public"]["Enums"]["sponsor_scope"]
          starts_on: string
          status?: Database["public"]["Enums"]["campaign_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tz?: string
          updated_at?: string
        }
        Update: {
          buyer_user_id?: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          currency?: string
          ends_on?: string
          event_id?: string | null
          id?: string
          paid_at?: string | null
          price_cents?: number
          refunded_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope?: Database["public"]["Enums"]["sponsor_scope"]
          starts_on?: string
          status?: Database["public"]["Enums"]["campaign_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tz?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_campaigns_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "sponsor_campaigns_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_creatives: {
        Row: {
          body: string | null
          business_name: string
          created_at: string
          headline: string | null
          id: string
          link_url: string | null
          logo_url: string | null
          sponsor_id: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          business_name: string
          created_at?: string
          headline?: string | null
          id?: string
          link_url?: string | null
          logo_url?: string | null
          sponsor_id: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          business_name?: string
          created_at?: string
          headline?: string | null
          id?: string
          link_url?: string | null
          logo_url?: string | null
          sponsor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_creatives_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: true
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_pricing: {
        Row: {
          period: string
          scope: Database["public"]["Enums"]["sponsor_scope"]
          unit: string
          unit_cents: number
          updated_at: string
        }
        Insert: {
          period: string
          scope: Database["public"]["Enums"]["sponsor_scope"]
          unit: string
          unit_cents: number
          updated_at?: string
        }
        Update: {
          period?: string
          scope?: Database["public"]["Enums"]["sponsor_scope"]
          unit?: string
          unit_cents?: number
          updated_at?: string
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
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
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
      ticket_purchases: {
        Row: {
          amount_cents: number
          check_in_count: number
          created_at: string
          event_id: string
          id: string
          purchased_at: string
          qr_token: string
          quantity: number
          refund_stripe_id: string | null
          refunded_at: string | null
          reserved_until: string | null
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          ticket_id: string
          user_id: string
        }
        Insert: {
          amount_cents?: number
          check_in_count?: number
          created_at?: string
          event_id: string
          id?: string
          purchased_at?: string
          qr_token?: string
          quantity?: number
          refund_stripe_id?: string | null
          refunded_at?: string | null
          reserved_until?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          ticket_id: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          check_in_count?: number
          created_at?: string
          event_id?: string
          id?: string
          purchased_at?: string
          qr_token?: string
          quantity?: number
          refund_stripe_id?: string | null
          refunded_at?: string | null
          reserved_until?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_purchases_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "ticket_purchases_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_purchases_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "event_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          created_at: string
          custom_message: string | null
          event_id: string
          id: string
          read_at: string | null
          scheduled_for: string
          sent_at: string | null
          type: Database["public"]["Enums"]["notification_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_message?: string | null
          event_id: string
          id?: string
          read_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          type: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_message?: string | null
          event_id?: string
          id?: string
          read_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_analytics"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "user_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
      venues: {
        Row: {
          accessibility_info: string | null
          address: string | null
          address_verified: boolean
          capacity: number | null
          coordinator_id: string
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          name: string
          parking_info: string | null
          phone: string | null
          photo_url: string | null
          unit: string | null
          updated_at: string
          verified_label: string | null
          website: string | null
        }
        Insert: {
          accessibility_info?: string | null
          address?: string | null
          address_verified?: boolean
          capacity?: number | null
          coordinator_id: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          parking_info?: string | null
          phone?: string | null
          photo_url?: string | null
          unit?: string | null
          updated_at?: string
          verified_label?: string | null
          website?: string | null
        }
        Update: {
          accessibility_info?: string | null
          address?: string | null
          address_verified?: boolean
          capacity?: number | null
          coordinator_id?: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          parking_info?: string | null
          phone?: string | null
          photo_url?: string | null
          unit?: string | null
          updated_at?: string
          verified_label?: string | null
          website?: string | null
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
      zip_centroids: {
        Row: {
          lat: number
          lng: number
          zip: string
        }
        Insert: {
          lat: number
          lng: number
          zip: string
        }
        Update: {
          lat?: number
          lng?: number
          zip?: string
        }
        Relationships: []
      }
    }
    Views: {
      event_analytics: {
        Row: {
          attendance_rate_pct: number | null
          check_ins: number | null
          coordinator_id: string | null
          event_id: string | null
          max_capacity: number | null
          rsvp_declined: number | null
          rsvp_going: number | null
          rsvp_interested: number | null
          rsvp_waitlist: number | null
          start_time: string | null
          ticket_revenue_cents: number | null
          title: string | null
          view_count: number | null
        }
        Insert: {
          attendance_rate_pct?: never
          check_ins?: never
          coordinator_id?: string | null
          event_id?: string | null
          max_capacity?: number | null
          rsvp_declined?: never
          rsvp_going?: never
          rsvp_interested?: never
          rsvp_waitlist?: never
          start_time?: string | null
          ticket_revenue_cents?: never
          title?: string | null
          view_count?: never
        }
        Update: {
          attendance_rate_pct?: never
          check_ins?: never
          coordinator_id?: string | null
          event_id?: string | null
          max_capacity?: number | null
          rsvp_declined?: never
          rsvp_going?: never
          rsvp_interested?: never
          rsvp_waitlist?: never
          start_time?: string | null
          ticket_revenue_cents?: never
          title?: string | null
          view_count?: never
        }
        Relationships: []
      }
      public_coordinator_profiles: {
        Row: {
          company_name: string | null
          coordinator_id: string | null
          currency: string | null
          custom_domain: string | null
          description: string | null
          favicon_url: string | null
          full_name: string | null
          language: string | null
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          setup_completed_at: string | null
          slug: string | null
          timezone: string | null
          website: string | null
        }
        Insert: {
          company_name?: string | null
          coordinator_id?: string | null
          currency?: string | null
          custom_domain?: string | null
          description?: string | null
          favicon_url?: string | null
          full_name?: string | null
          language?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          setup_completed_at?: string | null
          slug?: string | null
          timezone?: string | null
          website?: string | null
        }
        Update: {
          company_name?: string | null
          coordinator_id?: string | null
          currency?: string | null
          custom_domain?: string | null
          description?: string | null
          favicon_url?: string | null
          full_name?: string | null
          language?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          setup_completed_at?: string | null
          slug?: string | null
          timezone?: string | null
          website?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assess_all_coordinator_billing: {
        Args: { p_month?: string }
        Returns: {
          coordinators_billed: number
          total_cents: number
        }[]
      }
      assess_coordinator_billing: {
        Args: { p_coordinator_id: string; p_month?: string }
        Returns: number
      }
      calendar_in_campaign_geo: {
        Args: { _campaign_id: string; _coordinator_id: string }
        Returns: boolean
      }
      campaign_is_live: {
        Args: { c: Database["public"]["Tables"]["sponsor_campaigns"]["Row"] }
        Returns: boolean
      }
      can_read_campaign: { Args: { _campaign_id: string }; Returns: boolean }
      check_in_ticket: {
        Args: { _actor_id: string; _qr_token: string }
        Returns: {
          check_in_count: number
          event_id: string
          purchase_id: string
          quantity: number
          ticket_name: string
          user_id: string
        }[]
      }
      confirm_ticket_purchase: {
        Args: { _purchase_id: string; _stripe_charge_id: string }
        Returns: {
          amount_cents: number
          check_in_count: number
          created_at: string
          event_id: string
          id: string
          purchased_at: string
          qr_token: string
          quantity: number
          refund_stripe_id: string | null
          refunded_at: string | null
          reserved_until: string | null
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          ticket_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ticket_purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      coordinator_effective_ad_mode: {
        Args: { _coordinator_id: string }
        Returns: string
      }
      coordinator_effective_ads: {
        Args: { _coordinator_id: string }
        Returns: {
          local: boolean
          network: boolean
        }[]
      }
      coordinator_is_paid: {
        Args: { _coordinator_id: string }
        Returns: boolean
      }
      count_active_sponsorships: {
        Args: { p_coordinator_id: string; p_month?: string }
        Returns: number
      }
      delete_own_calendar: {
        Args: { _confirm_slug: string; _coordinator_id: string }
        Returns: {
          deleted_events: number
          deleted_slug: string
        }[]
      }
      event_point: {
        Args: { _event_id: string }
        Returns: {
          lat: number
          lng: number
        }[]
      }
      geo_reach: {
        Args: { p_center_zip: string; p_radius_miles: number; p_zips: string[] }
        Returns: {
          calendars: number
          events: number
          unknown_zips: string[]
        }[]
      }
      get_ad_destination: { Args: { p_slot_id: string }; Returns: string }
      get_all_coordinator_billing: {
        Args: never
        Returns: {
          active_sponsorships: number
          amount_due_cents: number
          approved_events: number
          company_name: string
          coordinator_id: string
          email: string
          grace_ends_at: string
          has_billing_row: boolean
          monthly_fee_cents: number
          slug: string
          sponsored_enabled: boolean
          state: string
          unpaid_cents: number
        }[]
      }
      get_campaign_ad_destination: {
        Args: { p_campaign_id: string }
        Returns: string
      }
      get_campaign_sponsors_for_calendar: {
        Args: { p_coordinator_id: string; p_limit?: number }
        Returns: {
          ad_key: string
          body: string
          business_name: string
          headline: string
          link_url: string
          logo_url: string
          scope: Database["public"]["Enums"]["sponsor_scope"]
        }[]
      }
      get_campaign_sponsors_for_event: {
        Args: { p_event_id: string; p_limit?: number }
        Returns: {
          ad_key: string
          body: string
          business_name: string
          headline: string
          link_url: string
          logo_url: string
          scope: Database["public"]["Enums"]["sponsor_scope"]
        }[]
      }
      get_campaign_stats: {
        Args: { p_campaign_id: string }
        Returns: {
          clicks: number
          unique_clickers: number
          unique_viewers: number
          views: number
        }[]
      }
      get_campaigns_on_my_calendar: {
        Args: { p_coordinator_id: string }
        Returns: {
          business_name: string
          campaign_id: string
          ends_on: string
          scope: Database["public"]["Enums"]["sponsor_scope"]
          starts_on: string
          status: Database["public"]["Enums"]["campaign_status"]
        }[]
      }
      get_coordinator_billing_status: {
        Args: { p_coordinator_id: string }
        Returns: {
          active_sponsorships: number
          amount_due_cents: number
          coordinator_id: string
          grace_days_left: number
          grace_ends_at: string
          monthly_fee_cents: number
          next_assessment_on: string
          reason: string
          sponsored_enabled: boolean
          state: string
        }[]
      }
      get_coordinator_slug: {
        Args: { p_coordinator_id: string }
        Returns: string
      }
      get_event_rsvp_counts: {
        Args: { p_event_id: string }
        Returns: {
          declined: number
          going: number
          interested: number
        }[]
      }
      get_event_rsvp_counts_bulk: {
        Args: { p_event_ids: string[] }
        Returns: {
          declined: number
          event_id: string
          going: number
          interested: number
        }[]
      }
      get_ical_feed_events: {
        Args: { _token: string }
        Returns: {
          description: string
          end_time: string
          event_format: Database["public"]["Enums"]["event_format"]
          id: string
          location: string
          start_time: string
          timezone: string
          title: string
          virtual_link: string
        }[]
      }
      get_my_sponsorship_stats: {
        Args: { p_days?: number }
        Returns: {
          business_name: string
          clicks: number
          ends_at: string
          event_id: string
          event_start: string
          event_title: string
          slot_id: string
          starts_at: string
          unique_clickers: number
          unique_viewers: number
          views: number
        }[]
      }
      get_public_coordinator_list: {
        Args: never
        Returns: {
          company_name: string
          logo_url: string
          slug: string
        }[]
      }
      get_public_coordinator_profile: {
        Args: { p_slug: string }
        Returns: {
          company_name: string
          coordinator_id: string
          custom_css: string
          description: string
          favicon_url: string
          header_image_url: string
          logo_url: string
          primary_color: string
          secondary_color: string
          show_nearby_events: boolean
          slug: string
        }[]
      }
      get_public_coordinator_sponsors: {
        Args: { p_coordinator_id: string; p_limit?: number }
        Returns: {
          body: string
          business_name: string
          event_id: string
          event_title: string
          headline: string
          link_url: string
          logo_url: string
          position: number
          slot_id: string
          slot_type: Database["public"]["Enums"]["slot_type"]
        }[]
      }
      get_public_sponsors: {
        Args: { p_event_id: string }
        Returns: {
          body: string
          business_name: string
          headline: string
          link_url: string
          logo_url: string
          position: number
          slot_id: string
          slot_type: Database["public"]["Enums"]["slot_type"]
        }[]
      }
      get_sponsor_ad_stats: {
        Args: { p_coordinator_id: string; p_days?: number }
        Returns: {
          business_name: string
          clicks: number
          ends_at: string
          event_id: string
          event_title: string
          position: number
          slot_id: string
          slot_type: Database["public"]["Enums"]["slot_type"]
          starts_at: string
          unique_clickers: number
          unique_viewers: number
          views: number
          views_on_embeds: number
        }[]
      }
      has_accepted_event_invite: {
        Args: { _event_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_own_draft_campaign: {
        Args: { _campaign_id: string }
        Returns: boolean
      }
      is_slug_available: {
        Args: { _coordinator_id?: string; _slug: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _coord_id: string; _user_id: string }
        Returns: boolean
      }
      mark_campaign_paid: {
        Args: {
          p_campaign_id: string
          p_payment_intent: string
          p_session_id: string
        }
        Returns: boolean
      }
      mark_campaign_payment_failed: {
        Args: { p_campaign_id: string }
        Returns: boolean
      }
      mark_campaign_refunded: {
        Args: { p_payment_intent: string }
        Returns: boolean
      }
      mark_ticket_refunded: {
        Args: { _purchase_id: string; _refund_stripe_id: string }
        Returns: {
          amount_cents: number
          check_in_count: number
          created_at: string
          event_id: string
          id: string
          purchased_at: string
          qr_token: string
          quantity: number
          refund_stripe_id: string | null
          refunded_at: string | null
          reserved_until: string | null
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          ticket_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ticket_purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      miles_between: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      point_in_campaign_geo: {
        Args: { _campaign_id: string; _lat: number; _lng: number }
        Returns: boolean
      }
      prune_sponsor_ad_stats: {
        Args: { p_keep_days?: number }
        Returns: number
      }
      record_ad_event: {
        Args: {
          p_kind: string
          p_slot_id: string
          p_surface: string
          p_visitor_hash: string
        }
        Returns: boolean
      }
      record_campaign_ad_event: {
        Args: {
          p_campaign_id: string
          p_kind: string
          p_surface: string
          p_visitor_hash: string
        }
        Returns: boolean
      }
      release_ticket_hold: {
        Args: { _purchase_id: string }
        Returns: undefined
      }
      reserve_ticket: {
        Args: {
          _amount_cents: number
          _hold_minutes?: number
          _quantity: number
          _ticket_id: string
          _user_id: string
        }
        Returns: {
          amount_cents: number
          check_in_count: number
          created_at: string
          event_id: string
          id: string
          purchased_at: string
          qr_token: string
          quantity: number
          refund_stripe_id: string | null
          refunded_at: string | null
          reserved_until: string | null
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          ticket_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ticket_purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restore_lapsed_ad_settings: { Args: never; Returns: number }
      search_events_nearby: {
        Args: {
          _lat: number
          _limit?: number
          _lng: number
          _radius_meters: number
        }
        Returns: {
          category: Database["public"]["Enums"]["event_category"]
          coordinator_id: string
          description: string
          distance_meters: number
          end_time: string
          id: string
          latitude: number
          location: string
          longitude: number
          start_time: string
          status: Database["public"]["Enums"]["event_status"]
          tags: string[]
          title: string
        }[]
      }
      seed_demo_events: { Args: { _coordinator_id: string }; Returns: number }
    }
    Enums: {
      annual_plan_status: "none" | "active" | "past_due" | "canceled"
      app_role: "admin" | "coordinator" | "staff" | "user"
      ban_scope: "user" | "event"
      campaign_status:
        | "draft"
        | "pending_payment"
        | "pending_review"
        | "active"
        | "paused"
        | "ended"
        | "refunded"
        | "rejected"
      consent_status: "pending" | "confirmed" | "unsubscribed"
      custom_field_type: "text" | "dropdown" | "number" | "date" | "checkbox"
      email_provider_type:
        | "lovable"
        | "sendgrid"
        | "postmark"
        | "mailgun"
        | "none"
      event_category:
        | "sports"
        | "networking"
        | "education"
        | "social"
        | "fundraiser"
        | "workshop"
        | "other"
      event_format: "in_person" | "virtual" | "hybrid"
      event_invite_status:
        | "pending"
        | "requested"
        | "accepted"
        | "declined"
        | "revoked"
      event_status: "draft" | "approved" | "removed"
      event_visibility: "public" | "unlisted" | "private"
      invitation_rsvp_status: "pending" | "going" | "interested" | "declined"
      livestream_provider: "zoom" | "google_meet" | "youtube" | "none"
      notification_type: "reminder" | "announcement" | "update"
      oauth_provider: "google" | "apple" | "facebook" | "email"
      payment_status: "pending" | "succeeded" | "failed" | "refunded"
      person_kind: "organizer" | "speaker" | "both"
      rsvp_status: "going" | "interested" | "declined"
      share_platform: "facebook" | "twitter" | "email" | "link" | "other"
      slot_status: "available" | "reserved" | "paid" | "expired"
      slot_type: "banner" | "featured" | "sidebar"
      sponsor_scope: "event" | "calendars" | "network" | "geo"
      staff_role: "coordinator" | "staff"
      submission_status: "pending" | "approved" | "rejected"
      waitlist_status: "waitlisted" | "promoted" | "declined"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      annual_plan_status: ["none", "active", "past_due", "canceled"],
      app_role: ["admin", "coordinator", "staff", "user"],
      ban_scope: ["user", "event"],
      campaign_status: [
        "draft",
        "pending_payment",
        "pending_review",
        "active",
        "paused",
        "ended",
        "refunded",
        "rejected",
      ],
      consent_status: ["pending", "confirmed", "unsubscribed"],
      custom_field_type: ["text", "dropdown", "number", "date", "checkbox"],
      email_provider_type: [
        "lovable",
        "sendgrid",
        "postmark",
        "mailgun",
        "none",
      ],
      event_category: [
        "sports",
        "networking",
        "education",
        "social",
        "fundraiser",
        "workshop",
        "other",
      ],
      event_format: ["in_person", "virtual", "hybrid"],
      event_invite_status: [
        "pending",
        "requested",
        "accepted",
        "declined",
        "revoked",
      ],
      event_status: ["draft", "approved", "removed"],
      event_visibility: ["public", "unlisted", "private"],
      invitation_rsvp_status: ["pending", "going", "interested", "declined"],
      livestream_provider: ["zoom", "google_meet", "youtube", "none"],
      notification_type: ["reminder", "announcement", "update"],
      oauth_provider: ["google", "apple", "facebook", "email"],
      payment_status: ["pending", "succeeded", "failed", "refunded"],
      person_kind: ["organizer", "speaker", "both"],
      rsvp_status: ["going", "interested", "declined"],
      share_platform: ["facebook", "twitter", "email", "link", "other"],
      slot_status: ["available", "reserved", "paid", "expired"],
      slot_type: ["banner", "featured", "sidebar"],
      sponsor_scope: ["event", "calendars", "network", "geo"],
      staff_role: ["coordinator", "staff"],
      submission_status: ["pending", "approved", "rejected"],
      waitlist_status: ["waitlisted", "promoted", "declined"],
    },
  },
} as const
