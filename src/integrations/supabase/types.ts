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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      evaluation_files: {
        Row: {
          evaluation_id: string
          file_name: string
          file_url: string
          id: string
          uploaded_at: string
        }
        Insert: {
          evaluation_id: string
          file_name: string
          file_url: string
          id?: string
          uploaded_at?: string
        }
        Update: {
          evaluation_id?: string
          file_name?: string
          file_url?: string
          id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_files_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_scores: {
        Row: {
          criterion_id: string
          evaluation_id: string
          id: string
          observations: string | null
          score: number | null
          section_id: string
        }
        Insert: {
          criterion_id: string
          evaluation_id: string
          id?: string
          observations?: string | null
          score?: number | null
          section_id: string
        }
        Update: {
          criterion_id?: string
          evaluation_id?: string
          id?: string
          observations?: string | null
          score?: number | null
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_scores_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          concept: string | null
          created_at: string
          final_score: number | null
          general_observations: string | null
          id: string
          submitted_at: string | null
          thesis_evaluator_id: string
          updated_at: string
        }
        Insert: {
          concept?: string | null
          created_at?: string
          final_score?: number | null
          general_observations?: string | null
          id?: string
          submitted_at?: string | null
          thesis_evaluator_id: string
          updated_at?: string
        }
        Update: {
          concept?: string | null
          created_at?: string
          final_score?: number | null
          general_observations?: string | null
          id?: string
          submitted_at?: string | null
          thesis_evaluator_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_thesis_evaluator_id_fkey"
            columns: ["thesis_evaluator_id"]
            isOneToOne: true
            referencedRelation: "thesis_evaluators"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cedula: string | null
          created_at: string
          full_name: string
          id: string
          institutional_email: string | null
          student_code: string | null
          updated_at: string
        }
        Insert: {
          cedula?: string | null
          created_at?: string
          full_name: string
          id: string
          institutional_email?: string | null
          student_code?: string | null
          updated_at?: string
        }
        Update: {
          cedula?: string | null
          created_at?: string
          full_name?: string
          id?: string
          institutional_email?: string | null
          student_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      theses: {
        Row: {
          abstract: string | null
          created_at: string
          created_by: string | null
          id: string
          keywords: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          abstract?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          keywords?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          abstract?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          keywords?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      thesis_evaluators: {
        Row: {
          assigned_at: string
          evaluator_id: string
          id: string
          is_blind: boolean
          thesis_id: string
        }
        Insert: {
          assigned_at?: string
          evaluator_id: string
          id?: string
          is_blind?: boolean
          thesis_id: string
        }
        Update: {
          assigned_at?: string
          evaluator_id?: string
          id?: string
          is_blind?: boolean
          thesis_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thesis_evaluators_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "theses"
            referencedColumns: ["id"]
          },
        ]
      }
      thesis_files: {
        Row: {
          file_name: string
          file_type: string
          file_url: string
          id: string
          thesis_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          file_name: string
          file_type: string
          file_url: string
          id?: string
          thesis_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          thesis_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "thesis_files_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "theses"
            referencedColumns: ["id"]
          },
        ]
      }
      thesis_students: {
        Row: {
          id: string
          student_id: string
          thesis_id: string
        }
        Insert: {
          id?: string
          student_id: string
          thesis_id: string
        }
        Update: {
          id?: string
          student_id?: string
          thesis_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thesis_students_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "theses"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          attachments: string[] | null
          created_at: string
          description: string | null
          event_type: string
          id: string
          label: string
          thesis_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          attachments?: string[] | null
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          label: string
          thesis_id: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          attachments?: string[] | null
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          label?: string
          thesis_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "theses"
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
      is_assigned_evaluator: {
        Args: { _thesis_id: string; _user_id: string }
        Returns: boolean
      }
      is_thesis_student: {
        Args: { _thesis_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "student" | "evaluator" | "admin"
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
      app_role: ["student", "evaluator", "admin"],
    },
  },
} as const
