// Database types for the Comp Matcher schema.
//
// NOTE: hand-transcribed from supabase/migrations/20260727120000_schema.sql
// (+ functions migrations) in the exact shape `supabase gen types typescript`
// emits, because type generation requires Docker/podman on this machine
// (the CLI shells out to a postgres-meta container) and none is installed.
// The schema is frozen for the MVP; if it changes, regenerate canonically with:
//   npx supabase gen types typescript --db-url "$SUPABASE_DB_URL" --schema public
// on a machine with Docker, and replace this file.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      competition_history: {
        Row: {
          contest_name: string
          event_name: string
          id: string
          placement: string | null
          profile_id: string
          year: number
        }
        Insert: {
          contest_name: string
          event_name: string
          id?: string
          placement?: string | null
          profile_id: string
          year: number
        }
        Update: {
          contest_name?: string
          event_name?: string
          id?: string
          placement?: string | null
          profile_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "competition_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contests: {
        Row: {
          divisions: Database["public"]["Enums"]["division"][]
          event_id: string
          id: string
          name: string
        }
        Insert: {
          divisions: Database["public"]["Enums"]["division"][]
          event_id: string
          id?: string
          name: string
        }
        Update: {
          divisions?: Database["public"]["Enums"]["division"][]
          event_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "contests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      entries: {
        Row: {
          contest_id: string
          created_at: string
          division: Database["public"]["Enums"]["division"]
          id: string
          note: string | null
          profile_id: string
          role: Database["public"]["Enums"]["dance_role"]
        }
        Insert: {
          contest_id: string
          created_at?: string
          division: Database["public"]["Enums"]["division"]
          id?: string
          note?: string | null
          profile_id: string
          role: Database["public"]["Enums"]["dance_role"]
        }
        Update: {
          contest_id?: string
          created_at?: string
          division?: Database["public"]["Enums"]["division"]
          id?: string
          note?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["dance_role"]
        }
        Relationships: [
          {
            foreignKeyName: "entries_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          end_date: string
          facebook_url: string | null
          id: string
          location: string
          name: string
          start_date: string
          status: Database["public"]["Enums"]["event_status"]
          suggested_by: string | null
          website_url: string | null
        }
        Insert: {
          created_at?: string
          end_date: string
          facebook_url?: string | null
          id?: string
          location: string
          name: string
          start_date: string
          status?: Database["public"]["Enums"]["event_status"]
          suggested_by?: string | null
          website_url?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string
          facebook_url?: string | null
          id?: string
          location?: string
          name?: string
          start_date?: string
          status?: Database["public"]["Enums"]["event_status"]
          suggested_by?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      matches: {
        Row: {
          contest_id: string
          created_at: string
          id: string
          profile_a: string
          profile_a_role: Database["public"]["Enums"]["dance_role"]
          profile_b: string
        }
        Insert: {
          contest_id: string
          created_at?: string
          id?: string
          profile_a: string
          profile_a_role: Database["public"]["Enums"]["dance_role"]
          profile_b: string
        }
        Update: {
          contest_id?: string
          created_at?: string
          id?: string
          profile_a?: string
          profile_a_role?: Database["public"]["Enums"]["dance_role"]
          profile_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_profile_a_fkey"
            columns: ["profile_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_profile_b_fkey"
            columns: ["profile_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_clips: {
        Row: {
          created_at: string
          id: string
          platform: Database["public"]["Enums"]["clip_platform"]
          position: number
          profile_id: string
          url: string
          video_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          platform: Database["public"]["Enums"]["clip_platform"]
          position: number
          profile_id: string
          url: string
          video_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          platform?: Database["public"]["Enums"]["clip_platform"]
          position?: number
          profile_id?: string
          url?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_clips_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_photos: {
        Row: {
          created_at: string
          id: string
          path: string
          position: number
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          path: string
          position: number
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          path?: string
          position?: number
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_photos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_contacts: {
        Row: {
          handle: string
          id: string
          platform: Database["public"]["Enums"]["contact_platform"]
          profile_id: string
        }
        Insert: {
          handle: string
          id?: string
          platform: Database["public"]["Enums"]["contact_platform"]
          profile_id: string
        }
        Update: {
          handle?: string
          id?: string
          platform?: Database["public"]["Enums"]["contact_platform"]
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bio: string | null
          city: string | null
          country: string | null
          created_at: string
          display_name: string
          id: string
          photo_url: string | null
          state: string | null
          user_id: string
          values: string[]
        }
        Insert: {
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name: string
          id?: string
          photo_url?: string | null
          state?: string | null
          user_id: string
          values?: string[]
        }
        Update: {
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name?: string
          id?: string
          photo_url?: string | null
          state?: string | null
          user_id?: string
          values?: string[]
        }
        Relationships: []
      }
      swipes: {
        Row: {
          contest_id: string
          created_at: string
          direction: Database["public"]["Enums"]["swipe_direction"]
          id: string
          swiper_profile_id: string
          swiper_role: Database["public"]["Enums"]["dance_role"]
          target_profile_id: string
        }
        Insert: {
          contest_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["swipe_direction"]
          id?: string
          swiper_profile_id: string
          swiper_role: Database["public"]["Enums"]["dance_role"]
          target_profile_id: string
        }
        Update: {
          contest_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["swipe_direction"]
          id?: string
          swiper_profile_id?: string
          swiper_role?: Database["public"]["Enums"]["dance_role"]
          target_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swipes_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipes_swiper_profile_id_fkey"
            columns: ["swiper_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipes_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_my_account: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      get_deck: {
        Args: { p_entry_id: string }
        Returns: {
          bio: string | null
          city: string | null
          country: string | null
          display_name: string
          division: Database["public"]["Enums"]["division"]
          entry_id: string
          note: string | null
          photo_url: string | null
          profile_id: string
          role: Database["public"]["Enums"]["dance_role"]
          state: string | null
          values: string[]
        }[]
      }
      get_my_profile_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_passed: {
        Args: { p_entry_id: string }
        Returns: {
          bio: string | null
          city: string | null
          country: string | null
          display_name: string
          division: Database["public"]["Enums"]["division"]
          entry_id: string
          note: string | null
          photo_url: string | null
          profile_id: string
          role: Database["public"]["Enums"]["dance_role"]
          state: string | null
          values: string[]
        }[]
      }
      get_pool_counts: {
        Args: {
          p_contest_id: string
          p_role: Database["public"]["Enums"]["dance_role"]
        }
        Returns: {
          available: number
          division: Database["public"]["Enums"]["division"]
        }[]
      }
      other_role: {
        Args: { r: Database["public"]["Enums"]["dance_role"] }
        Returns: Database["public"]["Enums"]["dance_role"]
      }
    }
    Enums: {
      clip_platform: "youtube" | "instagram" | "tiktok"
      contact_platform:
        | "instagram"
        | "facebook"
        | "tiktok"
        | "youtube"
        | "whatsapp"
        | "phone"
        | "email"
        | "other"
      dance_role: "leader" | "follower"
      division: "novice" | "amateur" | "advanced" | "open"
      event_status: "pending" | "approved"
      swipe_direction: "like" | "pass"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Database

type DefaultSchema = DatabaseWithoutInternals["public"]

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

export const Constants = {
  public: {
    Enums: {
      clip_platform: ["youtube", "instagram", "tiktok"],
      contact_platform: [
        "instagram",
        "facebook",
        "tiktok",
        "youtube",
        "whatsapp",
        "phone",
        "email",
        "other",
      ],
      dance_role: ["leader", "follower"],
      division: ["novice", "amateur", "advanced", "open"],
      event_status: ["pending", "approved"],
      swipe_direction: ["like", "pass"],
    },
  },
} as const
