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
          company_name: string | null
          contact_email: string | null
          coordinator_id: string
          created_at: string
          currency: string
          custom_domain: string | null
          description: string | null
          dns_records_acknowledged: boolean
          email_provider: Database["public"]["Enums"]["email_provider_type"]
          favicon_url: string | null
          full_name: string | null
          language: string
          logo_url: string | null
          phone: string | null
          primary_color: string
          secondary_color: string
          server_config: Json
          setup_completed_at: string | null
          setup_step: number
          slug: string | null
          terms_accepted_at: string | null
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          company_name?: string | null
          contact_email?: string | null
          coordinator_id: string
          created_at?: string
          currency?: string
          custom_domain?: string | null
          description?: string | null
          dns_records_acknowledged?: boolean
          email_provider?: Database["public"]["Enums"]["email_provider_type"]
          favicon_url?: string | null
          full_name?: string | null
          language?: string
          logo_url?: string | null
          phone?: string | null
          primary_color?: string
          secondary_color?: string
          server_config?: Json
          setup_completed_at?: string | null
          setup_step?: number
          slug?: string | null
          terms_accepted_at?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          company_name?: string | null
          contact_email?: string | null
          coordinator_id?: string
          created_at?: string
          currency?: string
          custom_domain?: string | null
          description?: string | null
          dns_records_acknowledged?: boolean
          email_provider?: Database["public"]["Enums"]["email_provider_type"]
          favicon_url?: string | null
          full_name?: string | null
          language?: string
          logo_url?: string | null
          phone?: string | null
          primary_color?: string
          secondary_color?: string
          server_config?: Json
          setup_completed_at?: string | null
          setup_step?: number
          slug?: string | null
          terms_accepted_at?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
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
      event_locations: {
        Row: {
          created_at: string
          event_id: string
          geom: unknown
          id: string
          latitude: number
          location_name: string
          longitude: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          geom?: unknown
          id?: string
          latitude: number
          location_name: string
          longitude: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          geom?: unknown
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
        }
        Insert: {
          created_at?: string
          display_order?: number
          event_id: string
          id?: string
          organizer_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          event_id?: string
          id?: string
          organizer_id?: string
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
          title: string
          updated_at: string
          venue_id: string | null
          virtual_link: string | null
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
          title: string
          updated_at?: string
          venue_id?: string | null
          virtual_link?: string | null
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
          title?: string
          updated_at?: string
          venue_id?: string | null
          virtual_link?: string | null
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
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
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
          status: string
          stripe_charge_id: string | null
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
          status?: string
          stripe_charge_id?: string | null
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
          status?: string
          stripe_charge_id?: string | null
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
          updated_at: string
          website: string | null
        }
        Insert: {
          accessibility_info?: string | null
          address?: string | null
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
          updated_at?: string
          website?: string | null
        }
        Update: {
          accessibility_info?: string | null
          address?: string | null
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
          updated_at?: string
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
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      check_in_ticket: {
        Args: { _qr_token: string }
        Returns: {
          check_in_count: number
          event_id: string
          purchase_id: string
          quantity: number
          ticket_name: string
          user_id: string
        }[]
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_ical_feed_events: {
        Args: { _token: string }
        Returns: {
          description: string
          end_time: string
          event_format: Database["public"]["Enums"]["event_format"]
          id: string
          location: string
          start_time: string
          title: string
          virtual_link: string
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
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
      longtransactionsenabled: { Args: never; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
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
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "coordinator" | "staff" | "user"
      ban_scope: "user" | "event"
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
      event_status: "draft" | "approved" | "removed"
      invitation_rsvp_status: "pending" | "going" | "interested" | "declined"
      livestream_provider: "zoom" | "google_meet" | "youtube" | "none"
      notification_type: "reminder" | "announcement" | "update"
      oauth_provider: "google" | "apple" | "facebook" | "email"
      payment_status: "pending" | "succeeded" | "failed" | "refunded"
      rsvp_status: "going" | "interested" | "declined"
      share_platform: "facebook" | "twitter" | "email" | "link" | "other"
      slot_status: "available" | "reserved" | "paid" | "expired"
      slot_type: "banner" | "featured" | "sidebar"
      staff_role: "coordinator" | "staff"
      submission_status: "pending" | "approved" | "rejected"
      waitlist_status: "waitlisted" | "promoted" | "declined"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
      event_status: ["draft", "approved", "removed"],
      invitation_rsvp_status: ["pending", "going", "interested", "declined"],
      livestream_provider: ["zoom", "google_meet", "youtube", "none"],
      notification_type: ["reminder", "announcement", "update"],
      oauth_provider: ["google", "apple", "facebook", "email"],
      payment_status: ["pending", "succeeded", "failed", "refunded"],
      rsvp_status: ["going", "interested", "declined"],
      share_platform: ["facebook", "twitter", "email", "link", "other"],
      slot_status: ["available", "reserved", "paid", "expired"],
      slot_type: ["banner", "featured", "sidebar"],
      staff_role: ["coordinator", "staff"],
      submission_status: ["pending", "approved", "rejected"],
      waitlist_status: ["waitlisted", "promoted", "declined"],
    },
  },
} as const
