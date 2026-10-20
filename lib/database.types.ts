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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audition_follows: {
        Row: {
          created_at: string
          production_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          production_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          production_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audition_follows_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audition_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      auditions: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          label: string | null
          location_id: string | null
          place: string | null
          production_id: string
          starts_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          label?: string | null
          location_id?: string | null
          place?: string | null
          production_id: string
          starts_at: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          label?: string | null
          location_id?: string | null
          place?: string | null
          production_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditions_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      award_bodies: {
        Row: {
          id: string
          name: string
          slug: string
          website_url: string | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          website_url?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          website_url?: string | null
        }
        Relationships: []
      }
      award_categories: {
        Row: {
          award_body_id: string
          id: string
          name: string
        }
        Insert: {
          award_body_id: string
          id?: string
          name: string
        }
        Update: {
          award_body_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "award_categories_award_body_id_fkey"
            columns: ["award_body_id"]
            isOneToOne: false
            referencedRelation: "award_bodies"
            referencedColumns: ["id"]
          },
        ]
      }
      award_entries: {
        Row: {
          award_year: number
          category_id: string
          created_at: string
          created_by: string | null
          credit_id: string | null
          id: string
          person_id: string | null
          production_id: string
          result: Database["public"]["Enums"]["award_result"]
          updated_at: string
        }
        Insert: {
          award_year: number
          category_id: string
          created_at?: string
          created_by?: string | null
          credit_id?: string | null
          id?: string
          person_id?: string | null
          production_id: string
          result: Database["public"]["Enums"]["award_result"]
          updated_at?: string
        }
        Update: {
          award_year?: number
          category_id?: string
          created_at?: string
          created_by?: string | null
          credit_id?: string | null
          id?: string
          person_id?: string | null
          production_id?: string
          result?: Database["public"]["Enums"]["award_result"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "award_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "award_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_entries_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_entries_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          created_at: string
          details: Json
          id: string
          kind: string
          message: string
          page_url: string
          reported_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          message: string
          page_url: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          message?: string
          page_url?: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_feeds: {
        Row: {
          created_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_feeds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credits: {
        Row: {
          added_by_owner: boolean
          billing_order: number
          character_id: string | null
          created_at: string
          created_by: string | null
          hidden_on_person_page: boolean
          id: string
          is_understudy: boolean
          is_young_performer: boolean
          kind: Database["public"]["Enums"]["credit_kind"]
          person_id: string | null
          production_id: string
          role_name: string | null
          updated_at: string
        }
        Insert: {
          added_by_owner?: boolean
          billing_order?: number
          character_id?: string | null
          created_at?: string
          created_by?: string | null
          hidden_on_person_page?: boolean
          id?: string
          is_understudy?: boolean
          is_young_performer?: boolean
          kind: Database["public"]["Enums"]["credit_kind"]
          person_id?: string | null
          production_id: string
          role_name?: string | null
          updated_at?: string
        }
        Update: {
          added_by_owner?: boolean
          billing_order?: number
          character_id?: string | null
          created_at?: string
          created_by?: string | null
          hidden_on_person_page?: boolean
          id?: string
          is_understudy?: boolean
          is_young_performer?: boolean
          kind?: Database["public"]["Enums"]["credit_kind"]
          person_id?: string | null
          production_id?: string
          role_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credits_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "show_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_positions: {
        Row: {
          added_by: string | null
          created_at: string
          name: string
          rank: number
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          name: string
          rank: number
        }
        Update: {
          added_by?: string | null
          created_at?: string
          name?: string
          rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "crew_positions_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deletions: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          entity_id: string
          entity_table: string
          id: number
          label: string | null
          snapshot: Json
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          entity_id: string
          entity_table: string
          id?: never
          label?: string | null
          snapshot: Json
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          entity_id?: string
          entity_table?: string
          id?: never
          label?: string | null
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "deletions_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      edit_proposals: {
        Row: {
          approved_changes: Json | null
          changes: Json
          created_at: string
          entity_id: string | null
          entity_table: string
          id: string
          left_out: Json | null
          note: string | null
          proposed_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["moderation_status"]
        }
        Insert: {
          approved_changes?: Json | null
          changes: Json
          created_at?: string
          entity_id?: string | null
          entity_table: string
          id?: string
          left_out?: Json | null
          note?: string | null
          proposed_by: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["moderation_status"]
        }
        Update: {
          approved_changes?: Json | null
          changes?: Json
          created_at?: string
          entity_id?: string | null
          entity_table?: string
          id?: string
          left_out?: Json | null
          note?: string | null
          proposed_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["moderation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "edit_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edit_proposals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_messages: {
        Row: {
          author_id: string | null
          body: string
          bug_report_id: string
          created_at: string
          from_moderator: boolean
          id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          bug_report_id: string
          created_at?: string
          from_moderator: boolean
          id?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          bug_report_id?: string
          created_at?: string
          from_moderator?: boolean
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_messages_bug_report_id_fkey"
            columns: ["bug_report_id"]
            isOneToOne: false
            referencedRelation: "bug_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          person_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          person_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          person_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hotlist_snapshots: {
        Row: {
          day: string
          entity_id: string
          entity_table: string
          rank: number
        }
        Insert: {
          day: string
          entity_id: string
          entity_table: string
          rank: number
        }
        Update: {
          day?: string
          entity_id?: string
          entity_table?: string
          rank?: number
        }
        Relationships: []
      }
      locations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          postal_code: string | null
          seating_capacity: number | null
          slug: string
          state: string
          street_address: string | null
          town: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          postal_code?: string | null
          seating_capacity?: number | null
          slug: string
          state?: string
          street_address?: string | null
          town?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          postal_code?: string | null
          seating_capacity?: number | null
          slug?: string
          state?: string
          street_address?: string | null
          town?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ma_towns: {
        Row: {
          name: string
        }
        Insert: {
          name: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      media: {
        Row: {
          bytes: number | null
          caption: string | null
          created_at: string
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["media_kind"]
          organization_id: string | null
          palette: Json | null
          person_id: string | null
          photographer_credit: string | null
          production_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rights_confirmed_at: string
          status: Database["public"]["Enums"]["moderation_status"]
          storage_key: string
          thumb_key: string | null
          uploaded_by: string
          width: number | null
        }
        Insert: {
          bytes?: number | null
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          kind: Database["public"]["Enums"]["media_kind"]
          organization_id?: string | null
          palette?: Json | null
          person_id?: string | null
          photographer_credit?: string | null
          production_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rights_confirmed_at: string
          status?: Database["public"]["Enums"]["moderation_status"]
          storage_key: string
          thumb_key?: string | null
          uploaded_by: string
          width?: number | null
        }
        Update: {
          bytes?: number | null
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          organization_id?: string | null
          palette?: Json | null
          person_id?: string | null
          photographer_credit?: string | null
          production_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rights_confirmed_at?: string
          status?: Database["public"]["Enums"]["moderation_status"]
          storage_key?: string
          thumb_key?: string | null
          uploaded_by?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          bug_report_id: string | null
          created_at: string
          credit_id: string | null
          dispute_note: string | null
          id: string
          kind: string
          person_id: string | null
          post_id: string | null
          production_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          revision_id: number | null
          status: string
          user_id: string
        }
        Insert: {
          bug_report_id?: string | null
          created_at?: string
          credit_id?: string | null
          dispute_note?: string | null
          id?: string
          kind: string
          person_id?: string | null
          post_id?: string | null
          production_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          revision_id?: number | null
          status?: string
          user_id: string
        }
        Update: {
          bug_report_id?: string | null
          created_at?: string
          credit_id?: string | null
          dispute_note?: string | null
          id?: string
          kind?: string
          person_id?: string | null
          post_id?: string | null
          production_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          revision_id?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_bug_report_id_fkey"
            columns: ["bug_report_id"]
            isOneToOne: false
            referencedRelation: "bug_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_locations: {
        Row: {
          is_home_venue: boolean
          location_id: string
          organization_id: string
        }
        Insert: {
          is_home_venue?: boolean
          location_id: string
          organization_id: string
        }
        Update: {
          is_home_venue?: boolean
          location_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          founded_year: number | null
          id: string
          is_active: boolean
          logo_media_id: string | null
          name: string
          short_name: string | null
          slug: string
          state: string
          town: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          founded_year?: number | null
          id?: string
          is_active?: boolean
          logo_media_id?: string | null
          name: string
          short_name?: string | null
          slug: string
          state?: string
          town?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          founded_year?: number | null
          id?: string
          is_active?: boolean
          logo_media_id?: string | null
          name?: string
          short_name?: string | null
          slug?: string
          state?: string
          town?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_logo_fk"
            columns: ["logo_media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
        ]
      }
      page_views: {
        Row: {
          day: string
          entity_id: string
          entity_table: string
          visitor_hash: string
        }
        Insert: {
          day?: string
          entity_id: string
          entity_table: string
          visitor_hash: string
        }
        Update: {
          day?: string
          entity_id?: string
          entity_table?: string
          visitor_hash?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          adult_attested_at: string
          adult_attested_by: string | null
          bio: string | null
          created_at: string
          created_by: string | null
          display_name: string
          headshot_media_id: string | null
          id: string
          is_hidden: boolean
          links: Json
          slug: string
          sort_name: string
          updated_at: string
          verified_owner_id: string | null
        }
        Insert: {
          adult_attested_at: string
          adult_attested_by?: string | null
          bio?: string | null
          created_at?: string
          created_by?: string | null
          display_name: string
          headshot_media_id?: string | null
          id?: string
          is_hidden?: boolean
          links?: Json
          slug: string
          sort_name: string
          updated_at?: string
          verified_owner_id?: string | null
        }
        Update: {
          adult_attested_at?: string
          adult_attested_by?: string | null
          bio?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string
          headshot_media_id?: string | null
          id?: string
          is_hidden?: boolean
          links?: Json
          slug?: string
          sort_name?: string
          updated_at?: string
          verified_owner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_adult_attested_by_fkey"
            columns: ["adult_attested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_headshot_fk"
            columns: ["headshot_media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_verified_owner_id_fkey"
            columns: ["verified_owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performances: {
        Row: {
          id: string
          is_cancelled: boolean
          label: string | null
          location_id: string | null
          production_id: string
          starts_at: string
        }
        Insert: {
          id?: string
          is_cancelled?: boolean
          label?: string | null
          location_id?: string | null
          production_id: string
          starts_at: string
        }
        Update: {
          id?: string
          is_cancelled?: boolean
          label?: string | null
          location_id?: string | null
          production_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performances_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      person_claims: {
        Row: {
          created_at: string
          evidence_note: string | null
          evidence_url: string | null
          id: string
          person_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["claim_status"]
          user_id: string
          vouched_by: string | null
        }
        Insert: {
          created_at?: string
          evidence_note?: string | null
          evidence_url?: string | null
          id?: string
          person_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          user_id: string
          vouched_by?: string | null
        }
        Update: {
          created_at?: string
          evidence_note?: string | null
          evidence_url?: string | null
          id?: string
          person_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          user_id?: string
          vouched_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_claims_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_claims_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_claims_vouched_by_fkey"
            columns: ["vouched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      point_events: {
        Row: {
          amount: number
          created_at: string
          id: number
          reason: string
          ref_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: never
          reason: string
          ref_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: never
          reason?: string
          ref_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          notified_at: string | null
          published_at: string | null
          slug: string
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notified_at?: string | null
          published_at?: string | null
          slug: string
          status?: string
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notified_at?: string | null
          published_at?: string | null
          slug?: string
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      productions: {
        Row: {
          audition_note: string | null
          audition_url: string | null
          closing_date: string | null
          color_accent: string | null
          color_edge: string | null
          color_ground: string | null
          color_ground_2: string | null
          color_ink: string | null
          color_soft: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_hidden: boolean
          location_id: string | null
          opening_date: string | null
          organization_id: string
          poster_media_id: string | null
          show_id: string
          slug: string
          ticket_url: string | null
          title_override: string | null
          updated_at: string
          year: number
        }
        Insert: {
          audition_note?: string | null
          audition_url?: string | null
          closing_date?: string | null
          color_accent?: string | null
          color_edge?: string | null
          color_ground?: string | null
          color_ground_2?: string | null
          color_ink?: string | null
          color_soft?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_hidden?: boolean
          location_id?: string | null
          opening_date?: string | null
          organization_id: string
          poster_media_id?: string | null
          show_id: string
          slug: string
          ticket_url?: string | null
          title_override?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          audition_note?: string | null
          audition_url?: string | null
          closing_date?: string | null
          color_accent?: string | null
          color_edge?: string | null
          color_ground?: string | null
          color_ground_2?: string | null
          color_ink?: string | null
          color_soft?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_hidden?: boolean
          location_id?: string | null
          opening_date?: string | null
          organization_id?: string
          poster_media_id?: string | null
          show_id?: string
          slug?: string
          ticket_url?: string | null
          title_override?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "productions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_poster_fk"
            columns: ["poster_media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_confirmed_at: string
          banned_at: string | null
          banned_by: string | null
          banned_reason: string | null
          created_at: string
          display_name: string
          id: string
          notify_updates: boolean
          person_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          show_seen: boolean
          updated_at: string
          username: string
        }
        Insert: {
          age_confirmed_at: string
          banned_at?: string | null
          banned_by?: string | null
          banned_reason?: string | null
          created_at?: string
          display_name: string
          id: string
          notify_updates?: boolean
          person_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          show_seen?: boolean
          updated_at?: string
          username: string
        }
        Update: {
          age_confirmed_at?: string
          banned_at?: string | null
          banned_by?: string | null
          banned_reason?: string | null
          created_at?: string
          display_name?: string
          id?: string
          notify_updates?: boolean
          person_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          show_seen?: boolean
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      revisions: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          changed_at: string
          changed_by: string | null
          entity_id: string
          entity_table: string
          id: number
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          changed_at?: string
          changed_by?: string | null
          entity_id: string
          entity_table: string
          id?: never
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          changed_at?: string
          changed_by?: string | null
          entity_id?: string
          entity_table?: string
          id?: never
        }
        Relationships: []
      }
      show_characters: {
        Row: {
          id: string
          name: string
          show_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          show_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          show_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "show_characters_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      shows: {
        Row: {
          authors: string | null
          created_at: string
          created_by: string | null
          id: string
          premiere_year: number | null
          slug: string
          subtitle: string | null
          synopsis: string | null
          title: string
          type: Database["public"]["Enums"]["show_type"]
          updated_at: string
        }
        Insert: {
          authors?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          premiere_year?: number | null
          slug: string
          subtitle?: string | null
          synopsis?: string | null
          title: string
          type: Database["public"]["Enums"]["show_type"]
          updated_at?: string
        }
        Update: {
          authors?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          premiere_year?: number | null
          slug?: string
          subtitle?: string | null
          synopsis?: string | null
          title?: string
          type?: Database["public"]["Enums"]["show_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_drafts: {
        Row: {
          data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          data: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_drafts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge: string
          earned_at: string
          seen_at: string | null
          user_id: string
        }
        Insert: {
          badge: string
          earned_at?: string
          seen_at?: string | null
          user_id: string
        }
        Update: {
          badge?: string
          earned_at?: string
          seen_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_list: {
        Row: {
          performance_id: string | null
          production_id: string
          status: Database["public"]["Enums"]["watch_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          performance_id?: string | null
          production_id: string
          status: Database["public"]["Enums"]["watch_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          performance_id?: string | null
          production_id?: string
          status?: Database["public"]["Enums"]["watch_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_list_performance_id_fkey"
            columns: ["performance_id"]
            isOneToOne: false
            referencedRelation: "performances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_list_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_list_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      user_points: {
        Row: {
          points: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "point_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_crew_positions: { Args: { p_names: string[] }; Returns: number }
      allow_distinct_person: { Args: { p_name: string }; Returns: undefined }
      answer_feedback: {
        Args: { p_body: string; p_id: string }
        Returns: undefined
      }
      apply_auditions: { Args: { p_proposal_id: string }; Returns: undefined }
      apply_award: { Args: { p_proposal_id: string }; Returns: undefined }
      apply_correction: {
        Args: { p_accept: string[]; p_proposal_id: string }
        Returns: number
      }
      apply_poster: {
        Args: { p_media: string; p_production: string }
        Returns: undefined
      }
      approve_person_edit: {
        Args: { p_approve: boolean; p_note?: string; p_proposal_id: string }
        Returns: undefined
      }
      approve_submission: {
        Args: {
          p_bundle?: Json
          p_left_out?: Json
          p_note?: string
          p_proposal_id: string
        }
        Returns: string
      }
      approve_submission_checked: {
        Args: {
          p_bundle?: Json
          p_left_out?: Json
          p_note?: string
          p_proposal_id: string
        }
        Returns: string
      }
      attach_submission_poster: {
        Args: {
          p_confirmed_at: string
          p_poster: Json
          p_production: string
          p_uploader: string
        }
        Returns: undefined
      }
      calendar_feed: {
        Args: { p_token: string }
        Returns: {
          address: string
          company: string
          label: string
          performance_id: string
          production_slug: string
          starts_at: string
          title: string
          venue: string
          year: number
        }[]
      }
      character_for: {
        Args: { p_production_id: string; p_role: string }
        Returns: string
      }
      claim_state: { Args: { p_person_id: string }; Returns: string }
      convert_to_young_performer: {
        Args: { p_credit_ids: string[] }
        Returns: Json
      }
      correction_changes: { Args: { p_changes: Json }; Returns: Json }
      correction_fields: { Args: { p_table: string }; Returns: string[] }
      deletion_blockers: {
        Args: { p_id: string; p_table: string }
        Returns: {
          label: string
          slug: string
        }[]
      }
      dismiss_notification: { Args: { p_id: string }; Returns: undefined }
      edge_for: { Args: { p_ground: string }; Returns: string }
      find_people_by_names: {
        Args: { p_names: string[] }
        Returns: {
          detail: string
          display_name: string
          id: string
          name_key: string
          slug: string
        }[]
      }
      follower_count: {
        Args: { p_organization_id?: string; p_person_id?: string }
        Returns: number
      }
      frequent_collaborators: {
        Args: { max_results?: number; p_person_id: string }
        Returns: {
          display_name: string
          person_id: string
          shows_together: number
          slug: string
        }[]
      }
      has_role: {
        Args: { min_role: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      hotlist: {
        Args: { p_limit?: number; p_table: string }
        Returns: {
          entity_id: string
          has_history: boolean
          last_week_rank: number
          rank: number
          visitors: number
        }[]
      }
      hotlist_counts: {
        Args: { p_table: string }
        Returns: {
          entity_id: string
          visitors: number
        }[]
      }
      is_banned: { Args: never; Returns: boolean }
      keep_all_notifications: { Args: never; Returns: undefined }
      level_thresholds: {
        Args: never
        Returns: {
          badge: string
          points: number
        }[]
      }
      lookup: {
        Args: { max_results?: number; p_kind: string; p_query: string }
        Returns: {
          detail: string
          id: string
          label: string
          slug: string
        }[]
      }
      lookup_productions: {
        Args: { max_results?: number; p_query: string }
        Returns: {
          detail: string
          id: string
          label: string
          slug: string
        }[]
      }
      ma_town: { Args: { p_town: string }; Returns: string }
      mark_badges_seen: { Args: never; Returns: undefined }
      mark_past_going_seen: { Args: never; Returns: number }
      mark_update_read: { Args: { p_post_id: string }; Returns: undefined }
      member_overview: {
        Args: { p_query?: string }
        Returns: {
          approved: number
          banned_at: string
          banned_reason: string
          display_name: string
          id: string
          joined: string
          last_active: string
          pending: number
          rejected: number
          role: Database["public"]["Enums"]["user_role"]
          uploads: number
          username: string
        }[]
      }
      moderation_pending_count: { Args: never; Returns: number }
      moderation_stats: { Args: never; Returns: Json }
      moderator_delete: {
        Args: { p_id: string; p_table: string; p_with_orphans?: boolean }
        Returns: number
      }
      my_calendar_feed: { Args: { p_reset?: boolean }; Returns: string }
      my_person_id: { Args: never; Returns: string }
      owner_add_credit: {
        Args: {
          p_character_id: string
          p_kind: Database["public"]["Enums"]["credit_kind"]
          p_production_id: string
          p_role_name: string
        }
        Returns: string
      }
      owner_add_credit_named: {
        Args: {
          p_kind: Database["public"]["Enums"]["credit_kind"]
          p_production_id: string
          p_role: string
        }
        Returns: string
      }
      owner_set_credit_hidden: {
        Args: { p_credit_id: string; p_hidden: boolean }
        Returns: undefined
      }
      owner_set_credit_role: {
        Args: { p_credit_id: string; p_role: string }
        Returns: undefined
      }
      owner_set_page_hidden: { Args: { p_hidden: boolean }; Returns: undefined }
      owner_update_credit: {
        Args: {
          p_character_id: string
          p_credit_id: string
          p_role_name: string
        }
        Returns: undefined
      }
      owner_update_person: {
        Args: { p_bio: string; p_headshot_media_id: string; p_links: Json }
        Returns: undefined
      }
      person_name_key: { Args: { p_name: string }; Returns: string }
      production_display_title: {
        Args: { p: Database["public"]["Tables"]["productions"]["Row"] }
        Returns: string
      }
      production_orphans: {
        Args: { p_production_id: string }
        Returns: {
          entity_id: string
          entity_table: string
          label: string
        }[]
      }
      profile_seen: {
        Args: { p_user: string }
        Returns: {
          production_id: string
          seen_on: string
        }[]
      }
      profile_stats: {
        Args: { p_user: string }
        Returns: {
          contributions: number
          photos: number
          points: number
          seen: number
        }[]
      }
      publish_post: { Args: { p_id: string }; Returns: number }
      recent_contributions: {
        Args: { p_limit?: number; p_user: string }
        Returns: {
          amount: number
          credits: number
          draft_title: string
          earned_at: string
          entity_id: string
          entity_table: string
          kind: string
          media_kind: string
          person_id: string
          production_id: string
          reason: string
        }[]
      }
      record_view: {
        Args: { p_id: string; p_table: string; p_visitor_hash: string }
        Returns: undefined
      }
      refresh_badges: { Args: { p_user: string }; Returns: undefined }
      reject_submission: {
        Args: { p_note?: string; p_proposal_id: string }
        Returns: undefined
      }
      reply_to_feedback: {
        Args: { p_body: string; p_done?: boolean; p_id: string }
        Returns: undefined
      }
      report_bug: {
        Args: { p_details?: Json; p_message: string; p_page_url: string }
        Returns: undefined
      }
      resolve_bug: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      resolve_dispute: {
        Args: { p_id: string; p_undo: boolean }
        Returns: undefined
      }
      resolve_suggestion: {
        Args: { p_done: boolean; p_note?: string; p_proposal_id: string }
        Returns: undefined
      }
      respond_notification: {
        Args: { p_id: string; p_keep: boolean; p_note?: string }
        Returns: undefined
      }
      restore_member: { Args: { p_user: string }; Returns: undefined }
      revert_revision: { Args: { p_revision_id: number }; Returns: undefined }
      review_auditions: {
        Args: { p_approve: boolean; p_note?: string; p_proposal_id: string }
        Returns: undefined
      }
      review_award: {
        Args: { p_approve: boolean; p_note?: string; p_proposal_id: string }
        Returns: undefined
      }
      review_claim: {
        Args: { p_claim_id: string; p_verify: boolean }
        Returns: undefined
      }
      review_correction: {
        Args: { p_accept: string[]; p_note?: string; p_proposal_id: string }
        Returns: number
      }
      review_media: {
        Args: { p_approve: boolean; p_media_id: string; p_note?: string }
        Returns: undefined
      }
      save_post: {
        Args: {
          p_body: string
          p_id: string
          p_summary: string
          p_title: string
        }
        Returns: string
      }
      search_all: {
        Args: { max_results?: number; q: string }
        Returns: {
          entity_table: string
          id: string
          label: string
          score: number
          slug: string
        }[]
      }
      seen_count: { Args: { p_person_id: string }; Returns: number }
      send_feedback: {
        Args: {
          p_details?: Json
          p_kind: string
          p_message: string
          p_page_url: string
        }
        Returns: undefined
      }
      set_feedback_kind: {
        Args: { p_id: string; p_kind: string }
        Returns: undefined
      }
      set_founding_open: { Args: { p_open: boolean }; Returns: undefined }
      set_home_counts: { Args: { p_show: boolean }; Returns: undefined }
      set_member_role: {
        Args: {
          p_role: Database["public"]["Enums"]["user_role"]
          p_user: string
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      site_counts: {
        Args: never
        Returns: {
          companies: number
          people: number
          productions: number
        }[]
      }
      slugify: { Args: { p_text: string }; Returns: string }
      snapshot_hotlist: { Args: never; Returns: undefined }
      sort_name_for: { Args: { p_name: string }; Returns: string }
      submission_destination: {
        Args: { p_proposal_id: string }
        Returns: {
          slug: string
          status: string
          title: string
        }[]
      }
      submission_earned_before: { Args: { p_changes: Json }; Returns: boolean }
      submit_auditions: {
        Args: {
          p_comment?: string
          p_note: string
          p_production_id: string
          p_sessions: Json
          p_url: string
        }
        Returns: string
      }
      submit_award: {
        Args: { p_award: Json; p_note?: string }
        Returns: string
      }
      submit_correction: {
        Args: { p_changes: Json; p_id: string; p_note: string; p_table: string }
        Returns: string
      }
      suspend_member: {
        Args: { p_reason: string; p_user: string }
        Returns: number
      }
      unaccent: { Args: { "": string }; Returns: string }
      unique_slug: {
        Args: { p_table: string; p_text: string }
        Returns: string
      }
      unpublish_post: { Args: { p_id: string }; Returns: undefined }
      vouch_claim: { Args: { p_claim_id: string }; Returns: undefined }
      young_performer_preview: {
        Args: { p_credit_ids: string[] }
        Returns: {
          claimed: boolean
          display_name: string
          other_credits: number
          person_id: string
          photos: number
          will_delete: boolean
        }[]
      }
    }
    Enums: {
      award_result: "nominated" | "won"
      claim_status: "pending" | "verified" | "rejected"
      credit_kind: "cast" | "crew"
      media_kind: "production_photo" | "poster" | "headshot" | "logo"
      moderation_status: "pending" | "approved" | "rejected"
      show_type: "musical" | "play" | "opera" | "revue" | "other"
      user_role: "member" | "trusted" | "moderator" | "admin"
      watch_status: "want_to_see" | "going" | "seen"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      award_result: ["nominated", "won"],
      claim_status: ["pending", "verified", "rejected"],
      credit_kind: ["cast", "crew"],
      media_kind: ["production_photo", "poster", "headshot", "logo"],
      moderation_status: ["pending", "approved", "rejected"],
      show_type: ["musical", "play", "opera", "revue", "other"],
      user_role: ["member", "trusted", "moderator", "admin"],
      watch_status: ["want_to_see", "going", "seen"],
    },
  },
} as const
